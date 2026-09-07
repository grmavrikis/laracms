<?php

namespace App\Console\Commands;

use App\Models\Enquiry;
use App\Models\EntrySlug;
use App\Models\Module;
use App\Models\ModuleSlug;
use App\Models\Redirect;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Is every column still wide enough for the rule that fills it?**
 * (TASKS.md #98.)
 *
 * The limits live on the models, where the validation rules and the theme read
 * them. The columns live in migrations, which are a record of what the schema
 * became on the day each one ran - deliberately literals, because a migration
 * that read a constant would mean something different on a fresh installation
 * than on one that has already run it, and the two would silently diverge.
 *
 * That leaves exactly one gap, and it is the one no test can close: **editing a
 * constant does not alter a column that already exists.** Widen
 * `Enquiry::NAME_MAX_LENGTH` without a migration and validation starts
 * accepting what MySQL will refuse with a 1406 - a 500 on the public form, on
 * that installation only, while the developer's own fresh database is correct.
 * This is what notices, and it belongs beside `pages:doctor` in a deployment.
 *
 * **It answers honestly where it cannot answer.** SQLite does not record a
 * column's width at all - Laravel's grammar writes `varchar` with no length -
 * so on that driver it says so and reports nothing rather than passing.
 */
class DoctorSchema extends Command
{
    protected $signature = 'schema:doctor';

    protected $description = 'Check that every column is wide enough for the rule that fills it';

    /**
     * Every limit that has a column behind it.
     *
     * A constant that is *not* a width - `Enquiry::MESSAGE_MAX_LENGTH` over a
     * `text` column, `GUESTS_MAX` over an integer - is deliberately absent:
     * there is nothing here for it to be compared against.
     *
     * **The constant is named rather than read.** Several of these are 255, so
     * a list of values could not say which ones are covered - dropping one
     * would leave its number in the list under somebody else's name, which is
     * exactly what `ColumnWidthTest` caught when it was written that way.
     *
     * @return array<int, array{0: string, 1: string, 2: class-string, 3: string}>
     *         table, column, the model, the constant on it
     */
    public static function expectations(): array
    {
        return [
            ['enquiries', 'name', Enquiry::class, 'NAME_MAX_LENGTH'],
            ['enquiries', 'email', Enquiry::class, 'EMAIL_MAX_LENGTH'],
            ['enquiries', 'phone', Enquiry::class, 'PHONE_MAX_LENGTH'],
            ['enquiries', 'source_url', Enquiry::class, 'SOURCE_URL_MAX_LENGTH'],
            ['modules', 'name', Module::class, 'NAME_MAX_LENGTH'],
            ['modules', 'slug', Module::class, 'SLUG_MAX_LENGTH'],
            ['module_slugs', 'name', ModuleSlug::class, 'NAME_MAX_LENGTH'],
            ['module_slugs', 'slug', ModuleSlug::class, 'SLUG_MAX_LENGTH'],
            ['entry_slugs', 'slug', EntrySlug::class, 'SLUG_MAX_LENGTH'],
            ['redirects', 'from_path', Redirect::class, 'PATH_MAX_LENGTH'],
            ['redirects', 'to_path', Redirect::class, 'PATH_MAX_LENGTH'],
            ['users', 'locale', User::class, 'LOCALE_MAX_LENGTH'],
        ];
    }

    /**
     * The declared width in a column type, or null when the driver does not
     * record one.
     *
     * Pure and public so it can be tested on a driver that reports nothing:
     * `varchar(120)` is 120, `varchar` is null, and so is `text`.
     */
    public static function widthOf(string $type): ?int
    {
        return preg_match('/^\s*(?:var)?char\s*\(\s*(\d+)\s*\)/i', $type, $found) === 1
            ? (int) $found[1]
            : null;
    }

    public function handle(): int
    {
        $driver = DB::connection()->getDriverName();

        $unknown = 0;
        $narrow = [];

        foreach (self::expectations() as [$table, $column, $model, $constant])
        {
            $limit = (int) constant($model . '::' . $constant);

            if (!Schema::hasTable($table))
            {
                $this->warn("No `{$table}` table - has this database been migrated?");

                return self::FAILURE;
            }

            $width = self::widthOf($this->typeOf($table, $column));

            if ($width === null)
            {
                $unknown++;

                continue;
            }

            if ($width < $limit)
            {
                $narrow[] = "{$table}.{$column} holds {$width}, and the rule allows {$limit}";
            }
        }

        if ($narrow !== [])
        {
            $this->error('These columns are narrower than what may be written into them:');

            foreach ($narrow as $line)
            {
                $this->line('  - ' . $line);
            }

            $this->line('');
            $this->line('A value that passes validation will be refused by the database.');
            $this->line('Write a migration that widens the column to match the constant.');

            return self::FAILURE;
        }

        if ($unknown > 0)
        {
            $this->warn("The {$driver} driver does not record a column's width, so {$unknown} of "
                . count(self::expectations()) . ' could not be checked.');
        }

        $this->info('Every column that reports a width is wide enough for its rule.');

        return self::SUCCESS;
    }

    private function typeOf(string $table, string $column): string
    {
        foreach (Schema::getColumns($table) as $found)
        {
            if ($found['name'] === $column)
            {
                return (string) ($found['type'] ?? '');
            }
        }

        return '';
    }
}
