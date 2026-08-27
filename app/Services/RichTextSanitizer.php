<?php

namespace App\Services;

use HTMLPurifier;
use HTMLPurifier_Config;

/**
 * Rich-text fields arrive as HTML from the Tiptap editor, but the editor is
 * not a security boundary: anything can POST to the entry endpoints directly.
 * So the HTML is cleaned server-side, on write, before it is persisted.
 *
 * The allowlist mirrors what the editor can actually produce
 * (StarterKit + Highlight + TextAlign), so legitimate content survives
 * untouched and everything else is dropped.
 */
class RichTextSanitizer
{
    /**
     * Schema field types whose value is HTML. EntryForm.jsx renders
     * RichTextEditor for exactly these; every other type is plain data and is
     * escaped by React on render, so it must NOT be passed through the
     * purifier (that would mangle legitimate text like "a < b").
     */
    private const RICH_TEXT_TYPES = ['text', 'richtext', 'textarea'];

    private ?HTMLPurifier $purifier = null;

    public function clean(string $html): string
    {
        return $this->purifier()->purify($html);
    }

    /**
     * Clean every rich-text field of an Entry payload, according to its
     * Module schema. Translatable fields hold a per-language map
     * (['en' => '<p>..</p>', 'el' => '<p>..</p>']), so values are walked
     * recursively rather than assumed to be strings.
     */
    public function sanitizeEntryData(array $schema, array $data): array
    {
        foreach ($schema as $field)
        {
            $name = $field['name'] ?? null;
            $type = $field['type'] ?? null;

            if (!$name || !in_array($type, self::RICH_TEXT_TYPES, true))
            {
                continue;
            }

            if (!array_key_exists($name, $data))
            {
                continue;
            }

            $data[$name] = $this->cleanValue($data[$name]);
        }

        return $data;
    }

    private function cleanValue(mixed $value): mixed
    {
        if (is_string($value))
        {
            return $this->clean($value);
        }

        if (is_array($value))
        {
            return array_map(fn($item) => $this->cleanValue($item), $value);
        }

        return $value;
    }

    private function purifier(): HTMLPurifier
    {
        if ($this->purifier !== null)
        {
            return $this->purifier;
        }

        $config = HTMLPurifier_Config::createDefault();

        // style is allowed only on the elements TextAlign is configured for
        // (heading + paragraph); CSS.AllowedProperties then narrows the
        // attribute's contents to text-align alone.
        $config->set('HTML.Allowed', implode(',', [
            'p[style]', 'br', 'hr',
            'strong', 'em', 'u', 's', 'mark', 'code',
            'h1[style]', 'h2[style]', 'h3[style]',
            'h4[style]', 'h5[style]', 'h6[style]',
            'ul', 'ol', 'li',
            'blockquote', 'pre',
            'a[href|title]',
        ]));

        $config->set('CSS.AllowedProperties', ['text-align']);

        // No javascript:/data: hrefs.
        $config->set('URI.AllowedSchemes', [
            'http' => true,
            'https' => true,
            'mailto' => true,
        ]);
        $config->set('HTML.TargetBlank', true);
        $config->set('HTML.Nofollow', true);

        // Default cache dir lives inside vendor/ and may not be writable.
        $cachePath = storage_path('framework/cache/htmlpurifier');

        if (!is_dir($cachePath))
        {
            mkdir($cachePath, 0o775, true);
        }

        $config->set('Cache.SerializerPath', $cachePath);

        // HTMLPurifier targets HTML 4.01, which has no <mark> - but that is
        // exactly what the editor's Highlight extension emits, so register it.
        $config->set('HTML.DefinitionID', 'mini-cms/rich-text');
        $config->set('HTML.DefinitionRev', 1);

        if ($definition = $config->maybeGetRawHTMLDefinition())
        {
            $definition->addElement('mark', 'Inline', 'Inline', 'Common');
        }

        return $this->purifier = new HTMLPurifier($config);
    }
}
