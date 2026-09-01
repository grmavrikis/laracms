<?php

namespace App\Console\Commands;

use App\Services\RichTextDocument;
use App\Services\SchemaRuleBuilder;
use Illuminate\Console\Command;

/**
 * Write the field-type lists the frontend needs, from the PHP constants that
 * define them.
 *
 * The backend decides which field types exist - it is what validates them and
 * turns them into rules. The frontend previously restated the same lists by
 * hand, and a test kept the two honest by reading the JS source with a regex,
 * which broke on any reformatting of those literals. The JS now imports what
 * this writes, so there is one definition and the check is a file comparison.
 */
class SyncFieldTypes extends Command
{
    protected $signature = 'schema:sync-field-types';

    protected $description = 'Regenerate resources/js/lib/fieldTypes.json from the PHP field-type constants';

    public static function path(): string
    {
        return resource_path('js/lib/fieldTypes.json');
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function contents(): array
    {
        return [
            'supported' => SchemaRuleBuilder::SUPPORTED_TYPES,
            'richText' => RichTextDocument::FIELD_TYPES,
            'legacyRichText' => RichTextDocument::LEGACY_FIELD_TYPES,
            'gallery' => SchemaRuleBuilder::GALLERY_FIELD_TYPES,
        ];
    }

    public static function encode(): string
    {
        return json_encode(self::contents(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    }

    public function handle(): int
    {
        $path = self::path();
        $before = is_file($path) ? file_get_contents($path) : null;
        $after = self::encode();

        file_put_contents($path, $after);

        $this->line($before === $after
            ? 'fieldTypes.json already matched the PHP constants.'
            : 'fieldTypes.json regenerated.');

        return self::SUCCESS;
    }
}
