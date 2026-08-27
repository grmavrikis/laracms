<?php

namespace App\Console\Commands;

use App\Models\Entry;
use App\Services\RichTextDocument;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;
use Illuminate\Console\Command;

/**
 * One-off migration: rich-text fields used to hold an HTML string and now hold
 * the editor's document as JSON. This converts what is already stored.
 *
 * The element vocabulary handled here is the one the old sanitizer allowed, so
 * previously stored content round-trips without loss. Anything outside it is
 * dropped, exactly as it would have been on the way in.
 */
class MigrateRichTextToDocuments extends Command
{
    protected $signature = 'entries:migrate-richtext {--dry-run : Show what would change without writing}';

    protected $description = 'Convert legacy HTML rich-text values into editor documents';

    private const BLOCKS = [
        'p' => 'paragraph',
        'h1' => 'heading', 'h2' => 'heading', 'h3' => 'heading',
        'h4' => 'heading', 'h5' => 'heading', 'h6' => 'heading',
        'ul' => 'bulletList',
        'ol' => 'orderedList',
        'li' => 'listItem',
        'blockquote' => 'blockquote',
        'pre' => 'codeBlock',
        'hr' => 'horizontalRule',
    ];

    private const MARKS = [
        'strong' => 'bold', 'b' => 'bold',
        'em' => 'italic', 'i' => 'italic',
        's' => 'strike', 'strike' => 'strike', 'del' => 'strike',
        'u' => 'underline',
        'code' => 'code',
        'mark' => 'highlight',
        'a' => 'link',
    ];

    public function handle(RichTextDocument $richText): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $converted = 0;

        foreach (Entry::with('module')->get() as $entry)
        {
            $schema = $entry->module?->schema ?? [];
            $data = $entry->data ?? [];
            $changed = false;

            foreach ($schema as $field)
            {
                $name = $field['name'] ?? null;

                if (!$name || !RichTextDocument::isRichTextField($field) || !array_key_exists($name, $data))
                {
                    continue;
                }

                $new = $this->convertValue($data[$name]);

                if ($new !== $data[$name])
                {
                    $this->line("entry {$entry->id} / {$name}:");
                    $this->line('  before: ' . json_encode($data[$name], JSON_UNESCAPED_UNICODE));
                    $this->line('  after : ' . json_encode($new, JSON_UNESCAPED_UNICODE));

                    $data[$name] = $new;
                    $changed = true;
                }
            }

            if (!$changed)
            {
                continue;
            }

            $converted++;

            if (!$dryRun)
            {
                // Pass through the normalizer so migrated data is held to the
                // same rules as anything arriving through the API.
                $entry->data = $richText->normalizeEntryData($schema, $data);
                $entry->save();
            }
        }

        $this->newLine();
        $this->info($dryRun
            ? "{$converted} entries would be converted (dry run, nothing written)."
            : "{$converted} entries converted.");

        return self::SUCCESS;
    }

    private function convertValue(mixed $value): mixed
    {
        if (is_string($value))
        {
            return $this->htmlToDocument($value);
        }

        // Translatable field: a map of language code => value. A document is
        // itself an array, so it is told apart by its marker.
        if (is_array($value) && ($value['type'] ?? null) !== 'doc')
        {
            return array_map(fn($item) => $this->convertValue($item), $value);
        }

        return $value;
    }

    private function htmlToDocument(string $html): array
    {
        if (trim(strip_tags($html)) === '' && !str_contains($html, '<hr'))
        {
            return RichTextDocument::empty();
        }

        $dom = new DOMDocument();
        libxml_use_internal_errors(true);

        // Numeric entities keep multibyte text intact through loadHTML.
        $dom->loadHTML(
            mb_encode_numericentity($html, [0x80, 0x10FFFF, 0, 0x1FFFFF], 'UTF-8'),
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );

        libxml_clear_errors();

        $content = [];
        $looseInline = [];

        foreach (iterator_to_array($dom->childNodes) as $child)
        {
            if ($this->isBlock($child))
            {
                $this->flushInline($looseInline, $content);

                $block = $this->convertBlock($child);

                if ($block !== null)
                {
                    $content[] = $block;
                }

                continue;
            }

            // Text sitting outside any block still belongs in a paragraph.
            $looseInline = array_merge($looseInline, $this->convertInline($child, []));
        }

        $this->flushInline($looseInline, $content);

        return $content === []
            ? RichTextDocument::empty()
            : ['type' => 'doc', 'content' => $content];
    }

    private function flushInline(array &$inline, array &$content): void
    {
        if ($inline === [])
        {
            return;
        }

        $content[] = ['type' => 'paragraph', 'content' => $inline];
        $inline = [];
    }

    private function isBlock(DOMNode $node): bool
    {
        return $node instanceof DOMElement
            && array_key_exists(strtolower($node->nodeName), self::BLOCKS);
    }

    private function convertBlock(DOMNode $node): ?array
    {
        if (!$node instanceof DOMElement)
        {
            return null;
        }

        $name = strtolower($node->nodeName);
        $type = self::BLOCKS[$name] ?? null;

        if ($type === null)
        {
            return null;
        }

        $result = ['type' => $type];
        $attrs = [];

        if ($type === 'heading')
        {
            $attrs['level'] = (int) substr($name, 1);
        }

        if (preg_match('/text-align\s*:\s*(left|right|center|justify)/i', $node->getAttribute('style'), $m))
        {
            $attrs['textAlign'] = strtolower($m[1]);
        }

        if ($attrs !== [])
        {
            $result['attrs'] = $attrs;
        }

        if ($type === 'horizontalRule')
        {
            return $result;
        }

        $content = [];
        $inline = [];

        foreach (iterator_to_array($node->childNodes) as $child)
        {
            if ($this->isBlock($child))
            {
                $this->flushInline($inline, $content);
                $nested = $this->convertBlock($child);

                if ($nested !== null)
                {
                    $content[] = $nested;
                }

                continue;
            }

            $inline = array_merge($inline, $this->convertInline($child, []));
        }

        // A list wraps blocks; everything else wraps inline content directly.
        if (in_array($type, ['bulletList', 'orderedList'], true))
        {
            $this->flushInline($inline, $content);
        }
        elseif ($content === [])
        {
            $content = $inline;
            $inline = [];
        }
        else
        {
            $this->flushInline($inline, $content);
        }

        if ($content !== [])
        {
            $result['content'] = $content;
        }

        return $result;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function convertInline(DOMNode $node, array $marks): array
    {
        if ($node instanceof DOMText)
        {
            $text = $node->textContent;

            if ($text === '')
            {
                return [];
            }

            $textNode = ['type' => 'text', 'text' => $text];

            if ($marks !== [])
            {
                $textNode['marks'] = $marks;
            }

            return [$textNode];
        }

        if (!$node instanceof DOMElement)
        {
            return [];
        }

        $name = strtolower($node->nodeName);

        if ($name === 'br')
        {
            return [['type' => 'hardBreak']];
        }

        if (isset(self::MARKS[$name]))
        {
            $mark = ['type' => self::MARKS[$name]];

            if ($name === 'a')
            {
                $href = $node->getAttribute('href');

                if ($href === '')
                {
                    $mark = null;
                }
                else
                {
                    $mark['attrs'] = ['href' => $href];
                }
            }

            if ($mark !== null)
            {
                $marks = [...$marks, $mark];
            }
        }

        $result = [];

        foreach (iterator_to_array($node->childNodes) as $child)
        {
            $result = array_merge($result, $this->convertInline($child, $marks));
        }

        return $result;
    }
}
