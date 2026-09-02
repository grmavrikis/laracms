<?php

namespace App\Services;

use Illuminate\Support\HtmlString;
use InvalidArgumentException;
use LogicException;

/**
 * Turns a stored Tiptap document into the HTML a public page shows.
 *
 * The counterpart to [`RichTextDocument`](RichTextDocument.php): normalise on
 * write, render on read, from the same closed vocabulary. Until this existed
 * nothing turned a document into markup at all - the admin table rendered a
 * plain-text excerpt and that was the whole of it - so no rich text could
 * appear on a client's site (TASKS.md #55).
 *
 * **It normalises before it renders**, rather than keeping a second allowlist.
 * That costs one walk of a small tree and buys two things: one definition of
 * what a document may contain, and the guarantee that this class only ever
 * sees node types, marks and attribute values that have already been rebuilt
 * from it. A document written straight into the database, or stored before the
 * normaliser existed, is therefore no more dangerous than one saved through
 * the API.
 *
 * That makes the *structure* safe by construction: there is no node type in
 * the vocabulary that could emit a script tag, so there is nothing to strip
 * afterwards. It says nothing about the **text**, which is stored verbatim on
 * purpose - `<script>` typed as text is content, not markup. Escaping it is
 * the one thing this class must never get wrong, and it is why every string
 * that reaches the output passes through `escape()`.
 *
 * Returns an `HtmlString`, so a Blade template writes `{{ }}` and never
 * `{!! !!}`. The claim that this output is safe is then made once, here,
 * instead of at every call site - the same reasoning that keeps
 * `dangerouslySetInnerHTML` out of the React side.
 *
 * To ask whether there is anything worth rendering at all, use
 * `RichTextDocument::toPlainText()`; this class renders what it is given
 * rather than guessing, so an empty document is an empty paragraph.
 */
class RichTextRenderer
{
    /**
     * Node types that are **nothing but a tag** (plus alignment, where the
     * vocabulary allows it).
     *
     * Not every node type is here, and the name says which: the ones that need
     * more than a tag are handled in `renderNode()` because they cannot be
     * expressed as a lookup - `heading` builds its tag from the level,
     * `codeBlock` wraps in two elements and carries a class, `orderedList`
     * carries `start`, and `hardBreak`/`horizontalRule` are void. So
     * `bulletList` is here while `orderedList` is not, which reads as an
     * omission until you know that rule.
     */
    private const PLAIN_TAGS = [
        'paragraph' => 'p',
        'bulletList' => 'ul',
        'listItem' => 'li',
        'blockquote' => 'blockquote',
    ];

    /** Marks that are a bare tag. `link` and `highlight` carry attributes. */
    private const MARK_TAGS = [
        'bold' => 'strong',
        'italic' => 'em',
        'strike' => 's',
        'underline' => 'u',
        'code' => 'code',
    ];

    public function __construct(private readonly RichTextDocument $documents)
    {
    }

    /**
     * @param string|null $language which translation to render, for a field
     *        that is translatable. Ignored for one that is not, so a template
     *        can pass the language it is on without first asking which kind of
     *        field it has.
     */
    public function toHtml(mixed $value, ?string $language = null): HtmlString
    {
        if (self::isLanguageMap($value))
        {
            if ($language === null)
            {
                throw new InvalidArgumentException(
                    'This value is a per-language map of documents, not a document. Pass the'
                    . ' language code as the second argument to say which translation to render.'
                );
            }

            // A language nobody has written yet is data rather than a mistake:
            // the entry simply has no Greek. That renders as empty.
            $value = $value[$language] ?? null;
        }

        $normalized = $this->documents->normalize($value);

        return new HtmlString($this->renderChildren($normalized['content'] ?? []));
    }

    /**
     * Whether this is a translatable field's value: language code => document.
     *
     * A translatable rich-text field holds one of these, and it is the common
     * shape here. Handed one without a language, `normalize()` sees something
     * that is not a document and returns the empty one, so the page rendered a
     * blank section indistinguishable from a document that really was empty.
     *
     * Only a map of *documents* counts. Anything else that is merely the wrong
     * shape keeps the old behaviour and renders empty, because a template
     * author cannot fix bad stored data by being shouted at on a live page -
     * whereas passing the whole map is a mistake in the template itself, and
     * shows up the first time it is loaded.
     */
    private static function isLanguageMap(mixed $value): bool
    {
        if (!is_array($value) || $value === [] || ($value['type'] ?? null) === 'doc')
        {
            return false;
        }

        foreach ($value as $translation)
        {
            if ($translation !== null
                && !(is_array($translation) && ($translation['type'] ?? null) === 'doc'))
            {
                return false;
            }
        }

        return true;
    }

    private function renderChildren(mixed $nodes): string
    {
        if (!is_array($nodes))
        {
            return '';
        }

        $html = '';

        foreach ($nodes as $node)
        {
            if (is_array($node))
            {
                $html .= $this->renderNode($node);
            }
        }

        return $html;
    }

    private function renderNode(array $node): string
    {
        $type = $node['type'] ?? null;
        $attrs = $node['attrs'] ?? [];

        if ($type === 'text')
        {
            return $this->renderText($node);
        }

        // The two that hold nothing. Void elements, so no closing tag.
        if ($type === 'hardBreak')
        {
            return '<br>';
        }

        if ($type === 'horizontalRule')
        {
            return '<hr>';
        }

        $children = $this->renderChildren($node['content'] ?? []);

        if ($type === 'heading')
        {
            // Already clamped to 1-6 by the normaliser.
            $level = (int) ($attrs['level'] ?? 1);

            return "<h{$level}{$this->alignment($attrs)}>{$children}</h{$level}>";
        }

        if ($type === 'codeBlock')
        {
            $language = $attrs['language'] ?? null;
            $class = $language === null
                ? ''
                : ' class="language-' . self::escape((string) $language) . '"';

            return "<pre><code{$class}>{$children}</code></pre>";
        }

        if ($type === 'orderedList')
        {
            // `start="1"` is the default, so emitting it would be noise on
            // every list that never asked for anything else.
            $start = (int) ($attrs['start'] ?? 1);
            $attribute = $start > 1 ? " start=\"{$start}\"" : '';

            return "<ol{$attribute}>{$children}</ol>";
        }

        $tag = self::PLAIN_TAGS[$type] ?? null;

        if ($tag === null)
        {
            throw self::vocabulariesDisagree('Node type', $type);
        }

        return "<{$tag}{$this->alignment($attrs)}>{$children}</{$tag}>";
    }

    private function renderText(array $node): string
    {
        $html = self::escape((string) ($node['text'] ?? ''));

        // Reversed so the first mark ends up outermost, which is the order the
        // editor applied them in.
        foreach (array_reverse($node['marks'] ?? []) as $mark)
        {
            if (is_array($mark))
            {
                $html = $this->wrapInMark($html, $mark);
            }
        }

        return $html;
    }

    private function wrapInMark(string $html, array $mark): string
    {
        $type = $mark['type'] ?? null;
        $attrs = $mark['attrs'] ?? [];

        if ($type === 'link')
        {
            // href is already restricted to http/https/mailto, and target and
            // rel are set by the normaliser rather than taken from the
            // payload, so a stored link cannot opt out of them.
            $attributes = $this->attributes([
                'href' => $attrs['href'] ?? null,
                'target' => $attrs['target'] ?? null,
                'rel' => $attrs['rel'] ?? null,
            ]);

            return "<a{$attributes}>{$html}</a>";
        }

        if ($type === 'highlight')
        {
            $colour = $attrs['color'] ?? null;
            $style = $colour === null
                ? ''
                : ' style="background-color: ' . self::escape((string) $colour) . '"';

            return "<mark{$style}>{$html}</mark>";
        }

        $tag = self::MARK_TAGS[$type] ?? null;

        if ($tag === null)
        {
            throw self::vocabulariesDisagree('Mark', $type);
        }

        return "<{$tag}>{$html}</{$tag}>";
    }

    /**
     * Only reachable when this class and `RichTextDocument`'s vocabulary have
     * drifted apart, which is a bug in the code rather than in the data: the
     * normaliser drops everything it does not list, so anything arriving here
     * is something it *does* list and this class has not been taught.
     *
     * Thrown rather than skipped. Returning an empty string made a type added
     * to the normaliser and not here vanish from the page in silence, with the
     * content still sitting in the database and nothing to say where it went.
     * `RichTextRendererTest` walks both lists so this cannot ship, and the
     * throw is what makes that walk fail loudly rather than on an assertion
     * about empty output.
     */
    private static function vocabulariesDisagree(string $kind, mixed $type): LogicException
    {
        $name = is_string($type) ? $type : get_debug_type($type);

        return new LogicException(
            "{$kind} '{$name}' is kept by RichTextDocument but RichTextRenderer cannot render it."
        );
    }

    /**
     * Alignment is a style rather than an attribute because that is what the
     * editor's TextAlign extension produces, and the value is one of four
     * literals the normaliser has already checked.
     */
    private function alignment(array $attrs): string
    {
        $align = $attrs['textAlign'] ?? null;

        return $align === null
            ? ''
            : ' style="text-align: ' . self::escape((string) $align) . '"';
    }

    /**
     * @param array<string, string|null> $pairs
     */
    private function attributes(array $pairs): string
    {
        $html = '';

        foreach ($pairs as $name => $value)
        {
            if ($value === null || $value === '')
            {
                continue;
            }

            $html .= ' ' . $name . '="' . self::escape((string) $value) . '"';
        }

        return $html;
    }

    /**
     * Every string that reaches the output goes through here.
     *
     * `ENT_SUBSTITUTE` is not decoration: without it `htmlspecialchars`
     * returns an **empty string** for malformed UTF-8, so one bad byte would
     * silently delete a paragraph instead of mangling a character of it.
     * `ENT_QUOTES` covers both quote characters, which is what stops a value
     * closing the attribute it sits in.
     */
    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
