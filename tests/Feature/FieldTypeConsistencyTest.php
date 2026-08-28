<?php

namespace Tests\Feature;

use App\Services\RichTextDocument;
use App\Services\SchemaRuleBuilder;
use Tests\TestCase;

/**
 * Field types are declared in PHP and consumed in JS, so nothing stops the two
 * from drifting apart - which is exactly what happened: the API accepted
 * `textarea` and `richtext` while the form never offered them.
 *
 * There is no JS test runner yet (TASKS.md #22), so these read the frontend
 * source and compare. That makes them sensitive to reformatting of those two
 * literals; if one fails after a purely cosmetic edit, fix the pattern here
 * rather than the list.
 */
class FieldTypeConsistencyTest extends TestCase
{
    /**
     * @return array<int, string>
     */
    private function jsStringArray(string $relativePath, string $constant): array
    {
        $source = file_get_contents(base_path($relativePath));

        $this->assertIsString($source, "Could not read {$relativePath}");

        preg_match('/' . preg_quote($constant, '/') . '\s*=\s*\[(.*?)\]/s', $source, $block);

        $this->assertNotEmpty(
            $block[1] ?? '',
            "Could not locate {$constant} in {$relativePath}"
        );

        preg_match_all("/'([^']+)'/", $block[1], $matches);

        $values = $matches[1] ?? [];

        $this->assertNotEmpty($values, "{$constant} in {$relativePath} parsed as empty");

        return $values;
    }

    public function test_the_module_form_offers_exactly_the_types_the_backend_supports(): void
    {
        // The form stores its list as objects: { value: 'string', label: 'String' }.
        // Only the values matter here, and labels are single-quoted too, so the
        // value key is matched explicitly.
        $source = file_get_contents(base_path('resources/js/components/ModuleBuilder.jsx'));

        preg_match('/const FIELD_TYPES\s*=\s*\[(.*?)\];/s', $source, $block);
        $this->assertNotEmpty($block[1] ?? '', 'Could not locate FIELD_TYPES in ModuleBuilder.jsx');

        preg_match_all("/value:\s*'([^']+)'/", $block[1], $matches);
        $frontend = $matches[1];

        $this->assertNotEmpty($frontend, 'FIELD_TYPES in ModuleBuilder.jsx parsed as empty');

        $backend = SchemaRuleBuilder::SUPPORTED_TYPES;

        sort($frontend);
        sort($backend);

        $this->assertSame(
            $backend,
            $frontend,
            'The types offered by ModuleBuilder.jsx and SchemaRuleBuilder::SUPPORTED_TYPES have drifted apart.'
        );
    }

    public function test_the_frontend_agrees_on_which_types_are_rich_text(): void
    {
        $frontend = $this->jsStringArray('resources/js/lib/richText.js', 'export const FIELD_TYPES');
        $backend = RichTextDocument::FIELD_TYPES;

        sort($frontend);
        sort($backend);

        $this->assertSame($backend, $frontend);
    }

    public function test_every_rich_text_type_is_a_supported_type(): void
    {
        foreach (RichTextDocument::FIELD_TYPES as $type)
        {
            $this->assertContains(
                $type,
                SchemaRuleBuilder::SUPPORTED_TYPES,
                "Rich-text type '{$type}' is not a creatable field type."
            );
        }
    }
}
