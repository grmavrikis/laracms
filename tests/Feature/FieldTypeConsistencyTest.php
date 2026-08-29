<?php

namespace Tests\Feature;

use App\Console\Commands\SyncFieldTypes;
use App\Services\RichTextDocument;
use App\Services\SchemaRuleBuilder;
use Tests\TestCase;

/**
 * Field types are defined in PHP and consumed in JS, so something has to stop
 * the two drifting apart - which they had: the API accepted `textarea` and
 * `richtext` while the form offered neither.
 *
 * This used to scrape the JS source with a regex, which would have broken on
 * any reformatting of those literals and could have parsed the wrong list
 * without saying so. The JS now imports `fieldTypes.json`, written from these
 * same constants, so the check is a file comparison.
 */
class FieldTypeConsistencyTest extends TestCase
{
    public function test_the_generated_file_matches_the_php_constants(): void
    {
        $path = SyncFieldTypes::path();

        $this->assertFileExists($path, 'Run: php artisan schema:sync-field-types');

        $this->assertSame(
            SyncFieldTypes::encode(),
            file_get_contents($path),
            'fieldTypes.json is stale. Run: php artisan schema:sync-field-types'
        );
    }

    public function test_the_generated_file_carries_the_lists_the_frontend_needs(): void
    {
        $generated = json_decode(file_get_contents(SyncFieldTypes::path()), true);

        $this->assertSame(SchemaRuleBuilder::SUPPORTED_TYPES, $generated['supported']);
        $this->assertSame(RichTextDocument::FIELD_TYPES, $generated['richText']);
        $this->assertSame(RichTextDocument::LEGACY_FIELD_TYPES, $generated['legacyRichText']);
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

    /**
     * Legacy types are readable, not creatable. If one reappeared in
     * SUPPORTED_TYPES the module form would start offering two names for the
     * same behaviour again.
     */
    public function test_legacy_rich_text_types_are_not_creatable(): void
    {
        foreach (RichTextDocument::LEGACY_FIELD_TYPES as $type)
        {
            $this->assertNotContains(
                $type,
                SchemaRuleBuilder::SUPPORTED_TYPES,
                "Legacy type '{$type}' should not be offered as a creatable field type."
            );
        }
    }

    /**
     * Deliberately not run through `artisan`: invoking the command would write
     * the real resources/js/lib/fieldTypes.json, so a test would be editing a
     * tracked source file - and would happily persist a mutation that another
     * test was about to report as drift.
     */
    public function test_the_generated_contents_are_deterministic(): void
    {
        $this->assertSame(SyncFieldTypes::encode(), SyncFieldTypes::encode());
    }
}
