<?php

namespace App\Services;

use App\Models\Entry;
use App\Models\Module;
use Illuminate\Support\HtmlString;

/**
 * A Module's schema turned into something a public template can loop over.
 *
 * The template cannot ask "what type is this field?" for itself: rich text is
 * a document that only `RichTextRenderer` may turn into HTML, a gallery is a
 * list of objects, and a translatable field is a map keyed by language. Doing
 * that in Blade would mean the type rules living in two places, and one of
 * them would be a template with `{!! !!}` in it.
 *
 * So the decision is made here, once, and each field arrives already resolved
 * to the language being rendered - either as escaped text, as an `HtmlString`
 * the renderer produced, or as a list of images.
 */
class EntryPresenter
{
    public function __construct(private readonly RichTextRenderer $richText)
    {
    }

    /**
     * @return array<int, array{name: string, type: string, kind: string, text: ?string, html: ?HtmlString, images: array}>
     */
    public function fields(Module $module, Entry $entry, string $language): array
    {
        $fields = [];

        foreach ($module->schema ?? [] as $field)
        {
            $name = $field['name'] ?? null;

            if ($name === null)
            {
                continue;
            }

            $type = $field['type'] ?? 'string';
            $value = $entry->data[$name] ?? null;

            $fields[] = match (true)
            {
                in_array($type, RichTextDocument::FIELD_TYPES, true),
                in_array($type, RichTextDocument::LEGACY_FIELD_TYPES, true) => [
                    'name' => $name,
                    'type' => $type,
                    'kind' => 'html',
                    'text' => null,
                    // The renderer normalises before it escapes, and returns an
                    // HtmlString - so the template never writes `{!! !!}`.
                    'html' => $this->richText->toHtml($value, $language),
                    'images' => [],
                ],

                in_array($type, SchemaRuleBuilder::GALLERY_FIELD_TYPES, true) => [
                    'name' => $name,
                    'type' => $type,
                    'kind' => 'images',
                    'text' => null,
                    'html' => null,
                    'images' => $this->images($value, $language),
                ],

                default => [
                    'name' => $name,
                    'type' => $type,
                    'kind' => $type === 'image' ? 'image' : 'text',
                    'text' => $this->text($value, $field, $language),
                    'html' => null,
                    'images' => [],
                ],
            };
        }

        return $fields;
    }

    /**
     * What to call the entry on a listing and in the <title>.
     *
     * The first plain-text field the schema declares, because that is what a
     * schema builder puts first - there is no `title` the system can rely on,
     * and inventing one would be a rule the Module builder does not enforce.
     */
    public function title(Module $module, Entry $entry, string $language): string
    {
        foreach ($this->fields($module, $entry, $language) as $field)
        {
            if ($field['kind'] === 'text' && $field['text'] !== null && $field['text'] !== '')
            {
                return $field['text'];
            }
        }

        return '#' . $entry->id;
    }

    /**
     * @return array<int, array{url: string, alt: string}>
     */
    private function images(mixed $value, string $language): array
    {
        if (!is_array($value))
        {
            return [];
        }

        $images = [];

        foreach ($value as $item)
        {
            if (!is_array($item) || !is_string($item['url'] ?? null))
            {
                continue;
            }

            // Alt text is per language inside a field that is not itself
            // translatable - see SchemaRuleBuilder's gallery rules.
            $alt = $item['alt'][$language] ?? '';

            $images[] = ['url' => $item['url'], 'alt' => is_string($alt) ? $alt : ''];
        }

        return $images;
    }

    private function text(mixed $value, array $field, string $language): ?string
    {
        if (($field['translatable'] ?? false) && is_array($value))
        {
            $value = $value[$language] ?? null;
        }

        if (is_bool($value))
        {
            return $value ? 'yes' : 'no';
        }

        if ($value === null || is_array($value))
        {
            return null;
        }

        return (string) $value;
    }
}
