<?php

namespace App\Services;

/**
 * Rich-text fields store the editor's document as JSON (a ProseMirror/Tiptap
 * document), not as an HTML string.
 *
 * That removes the sanitization problem at the source: HTML is an open
 * language that can express <script> and event handlers, so accepting it means
 * accepting everything and then trying to remove the dangerous parts. A
 * document tree is a closed vocabulary - there is no "script" node type - so
 * anything unknown simply has nowhere to live.
 *
 * This class rebuilds an incoming document from scratch, keeping only known
 * node types, known marks and known attributes with validated values.
 * Whatever is not explicitly allowed is dropped rather than escaped.
 *
 * The vocabulary matches the editor's extensions: StarterKit + Highlight +
 * TextAlign (see resources/js/components/RichTextEditor.jsx).
 */
class RichTextDocument
{
    /** Node types that may contain other nodes, mapped to their allowed attrs. */
    private const NODES = [
        'paragraph' => ['textAlign'],
        'heading' => ['level', 'textAlign'],
        'bulletList' => [],
        'orderedList' => ['start'],
        'listItem' => [],
        'blockquote' => [],
        'codeBlock' => ['language'],
        'horizontalRule' => [],
        'hardBreak' => [],
    ];

    /** Inline marks, mapped to their allowed attrs. */
    private const MARKS = [
        'bold' => [],
        'italic' => [],
        'strike' => [],
        'underline' => [],
        'code' => [],
        'highlight' => ['color'],
        'link' => ['href', 'target', 'rel'],
    ];

    private const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

    /** Schemes a link may point at. Blocks javascript: and data: payloads. */
    private const LINK_SCHEMES = ['http', 'https', 'mailto'];

    /** Guards against deeply nested or oversized payloads. */
    private const MAX_DEPTH = 20;
    private const MAX_NODES = 5000;

    private int $nodeBudget = self::MAX_NODES;

    /**
     * The field type whose value is a rich-text document, and the only one
     * offered when building a Module. `richtext` and `textarea` were once
     * listed here too, but all three behaved identically and three names for
     * one behaviour is worse than one.
     */
    public const FIELD_TYPES = ['text'];

    /**
     * Types that can no longer be chosen but may still appear in a schema
     * written before they were collapsed into `text`.
     *
     * Reading and creation are deliberately different questions here. Dropping
     * these outright left such a Module unable to save an entry *and* unable
     * to be migrated, since the rich-text migration selects fields through
     * isRichTextField(). They are recognised so that data keeps working; they
     * stay out of SchemaRuleBuilder::SUPPORTED_TYPES so no new one is created.
     */
    public const LEGACY_FIELD_TYPES = ['richtext', 'textarea'];

    public static function isRichTextField(array $field): bool
    {
        $type = $field['type'] ?? null;

        return in_array($type, self::FIELD_TYPES, true)
            || in_array($type, self::LEGACY_FIELD_TYPES, true);
    }

    public static function empty(): array
    {
        return ['type' => 'doc', 'content' => [['type' => 'paragraph']]];
    }

    /**
     * Return a document containing only what this CMS understands. Anything
     * unrecognised - unknown node types, unknown marks, unsafe link schemes -
     * is discarded.
     */
    public function normalize(mixed $document): array
    {
        $this->nodeBudget = self::MAX_NODES;

        if (!is_array($document) || ($document['type'] ?? null) !== 'doc')
        {
            return self::empty();
        }

        $content = $this->normalizeChildren($document['content'] ?? null, 1);

        return $content === []
            ? self::empty()
            : ['type' => 'doc', 'content' => $content];
    }

    /**
     * Walk an Entry payload against its Module schema and normalize every
     * rich-text field. Translatable fields hold a per-language map, so each
     * language is normalized on its own.
     */
    public function normalizeEntryData(array $schema, array $data): array
    {
        foreach ($schema as $field)
        {
            $name = $field['name'] ?? null;

            if (!$name || !self::isRichTextField($field) || !array_key_exists($name, $data))
            {
                continue;
            }

            $value = $data[$name];

            // A translatable field is a map of language code => document. A
            // document is itself an array, so the two are told apart by
            // looking for the document marker rather than by is_array().
            if (is_array($value) && ($value['type'] ?? null) !== 'doc')
            {
                $data[$name] = array_map(
                    fn($perLanguage) => $perLanguage === null ? null : $this->normalize($perLanguage),
                    $value
                );

                continue;
            }

            $data[$name] = $value === null ? null : $this->normalize($value);
        }

        return $data;
    }

    /**
     * Flatten a document to its text, used for previews and excerpts.
     */
    public function toPlainText(mixed $document): string
    {
        if (!is_array($document))
        {
            return '';
        }

        $pieces = [];
        $this->collectText($document, $pieces);

        return trim(preg_replace('/\s+/u', ' ', implode(' ', $pieces)));
    }

    private function collectText(array $node, array &$pieces): void
    {
        if (isset($node['text']) && is_string($node['text']))
        {
            $pieces[] = $node['text'];
        }

        foreach ($node['content'] ?? [] as $child)
        {
            if (is_array($child))
            {
                $this->collectText($child, $pieces);
            }
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function normalizeChildren(mixed $children, int $depth): array
    {
        if (!is_array($children) || $depth > self::MAX_DEPTH)
        {
            return [];
        }

        $result = [];

        foreach ($children as $child)
        {
            if ($this->nodeBudget <= 0)
            {
                break;
            }

            $node = $this->normalizeNode($child, $depth);

            if ($node !== null)
            {
                $result[] = $node;
            }
        }

        return $result;
    }

    private function normalizeNode(mixed $node, int $depth): ?array
    {
        if (!is_array($node))
        {
            return null;
        }

        $type = $node['type'] ?? null;
        $this->nodeBudget--;

        if ($type === 'text')
        {
            return $this->normalizeTextNode($node);
        }

        if (!is_string($type) || !array_key_exists($type, self::NODES))
        {
            return null;
        }

        $result = ['type' => $type];

        $attrs = $this->normalizeAttrs($type, $node['attrs'] ?? null);

        if ($attrs !== [])
        {
            $result['attrs'] = $attrs;
        }

        $content = $this->normalizeChildren($node['content'] ?? null, $depth + 1);

        if ($content !== [])
        {
            $result['content'] = $content;
        }

        return $result;
    }

    private function normalizeTextNode(array $node): ?array
    {
        $text = $node['text'] ?? null;

        // Text is stored as text and escaped at render time, so its contents
        // are never interpreted as markup - no filtering needed here.
        if (!is_string($text) || $text === '')
        {
            return null;
        }

        $result = ['type' => 'text', 'text' => $text];

        $marks = $this->normalizeMarks($node['marks'] ?? null);

        if ($marks !== [])
        {
            $result['marks'] = $marks;
        }

        return $result;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function normalizeMarks(mixed $marks): array
    {
        if (!is_array($marks))
        {
            return [];
        }

        $result = [];

        foreach ($marks as $mark)
        {
            if (!is_array($mark))
            {
                continue;
            }

            $type = $mark['type'] ?? null;

            if (!is_string($type) || !array_key_exists($type, self::MARKS))
            {
                continue;
            }

            $normalized = ['type' => $type];
            $attrs = $this->normalizeMarkAttrs($type, $mark['attrs'] ?? null);

            if ($type === 'link' && !isset($attrs['href']))
            {
                // A link with no usable target is just text.
                continue;
            }

            if ($attrs !== [])
            {
                $normalized['attrs'] = $attrs;
            }

            $result[] = $normalized;
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeAttrs(string $type, mixed $attrs): array
    {
        if (!is_array($attrs))
        {
            return [];
        }

        $result = [];

        foreach (self::NODES[$type] as $name)
        {
            $value = $attrs[$name] ?? null;

            $clean = match ($name)
            {
                'textAlign' => in_array($value, self::ALIGNMENTS, true) ? $value : null,
                'level' => $this->clampHeadingLevel($value),
                'start' => is_numeric($value) && (int) $value >= 1 ? (int) $value : null,
                'language' => is_string($value) && preg_match('/^[A-Za-z0-9#+._-]{1,32}$/', $value) ? $value : null,
                default => null,
            };

            if ($clean !== null)
            {
                $result[$name] = $clean;
            }
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeMarkAttrs(string $type, mixed $attrs): array
    {
        if (!is_array($attrs))
        {
            return [];
        }

        $result = [];

        foreach (self::MARKS[$type] as $name)
        {
            $value = $attrs[$name] ?? null;

            $clean = match ($name)
            {
                'href' => $this->safeUrl($value),
                // Links always open in a new tab; rel is fixed rather than
                // taken from input so it cannot be weakened.
                'target' => '_blank',
                'rel' => 'noopener noreferrer nofollow',
                'color' => is_string($value) && preg_match('/^#[0-9A-Fa-f]{3,8}$/', $value) ? $value : null,
                default => null,
            };

            if ($clean !== null)
            {
                $result[$name] = $clean;
            }
        }

        return $result;
    }

    private function clampHeadingLevel(mixed $value): ?int
    {
        if (!is_numeric($value))
        {
            return null;
        }

        $level = (int) $value;

        return $level >= 1 && $level <= 6 ? $level : null;
    }

    /**
     * Accept only absolute URLs on safe schemes. Entity/whitespace tricks such
     * as "jav&#x09;ascript:" do not survive, because the scheme is compared
     * after parsing rather than by pattern matching the raw string.
     */
    private function safeUrl(mixed $value): ?string
    {
        if (!is_string($value) || $value === '')
        {
            return null;
        }

        $url = trim($value);

        // Strip control characters and whitespace, the classic way of hiding a
        // scheme from a naive check.
        $url = preg_replace('/[\x00-\x20\x7F]/u', '', $url) ?? '';

        if ($url === '')
        {
            return null;
        }

        $scheme = parse_url($url, PHP_URL_SCHEME);

        if (!is_string($scheme) || !in_array(strtolower($scheme), self::LINK_SCHEMES, true))
        {
            return null;
        }

        return $url;
    }
}
