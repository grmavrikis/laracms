<?php

namespace App\Console\Commands;

use App\Http\Controllers\UploadController;
use App\Services\SchemaLimits;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Is every column still wide enough for the rule that fills it, and can PHP
 * receive what the panel accepts?** (TASKS.md #98.)
 *
 * The limits are constants on the models; the columns are literals in
 * migrations, which are records of what the schema became on the day each one
 * ran. That leaves the gaps no test can close: editing a constant does not
 * alter a column that already exists, and nothing in this repository edits a
 * server's `php.ini`. Widen `Enquiry::NAME_MAX_LENGTH` without a migration and
 * validation starts accepting what MySQL refuses with a 1406 - a 500 on the
 * public form, on that installation only, while the developer's own fresh
 * database is correct.
 *
 * Run it on a deployment, beside `pages:doctor`.
 *
 * **It answers honestly where it cannot answer.** SQLite records no width at
 * all - Laravel's grammar writes `varchar` with no length - so on that driver
 * it names the columns it could not read rather than passing. A column that is
 * *missing*, though, is a failure and not an unknown: that is the completest
 * way for a schema to fall behind the code, and reading it as "no width
 * reported" is how the first version of this passed a database with a column
 * gone.
 *
 * The arithmetic is in `SchemaLimits`, so it can be tested on the driver that
 * reports nothing. This is the part that talks.
 */
class DoctorSchema extends Command
{
    protected $signature = 'schema:doctor';

    protected $description = 'Check that the database and PHP can hold what the code allows';

    public function handle(): int
    {
        [$declared, $absentTables] = $this->declaredTypes();

        $report = SchemaLimits::compare($declared, $absentTables);

        // The limit is the controller's, and it is read here rather than inside
        // the service: a console command naming an HTTP constant is ordinary,
        // a service depending on `app/Http` is a direction this application
        // does not otherwise have.
        $uploads = SchemaLimits::uploadProblems(
            ini_get('upload_max_filesize') ?: null,
            ini_get('post_max_size') ?: null,
            UploadController::MAX_KILOBYTES
        );

        $failed = false;

        $headings = [
            'tables' => 'These tables are not in the database - has it been migrated?',
            'missing' => 'These are checked against a limit and are not in the database:',
            'unnamed' => 'These name a constant that no longer exists:',
            'narrow' => 'These columns are narrower than what may be written into them:',
        ];

        foreach ($headings as $kind => $heading)
        {
            if ($report[$kind] === [])
            {
                continue;
            }

            $failed = true;

            $this->error($heading);

            foreach ($report[$kind] as $line)
            {
                $this->line('  - ' . $line);
            }

            $this->line('');
        }

        if ($uploads !== [])
        {
            $failed = true;

            $this->error('PHP will not accept an upload the panel says it accepts:');

            foreach ($uploads as $line)
            {
                $this->line('  - ' . $line);
            }

            $this->line('');
            $this->line('The file never reaches the rule: the upload arrives empty and the');
            $this->line('owner is told the image is missing. Raise them in php.ini.');
            $this->line('');
        }

        if ($failed)
        {
            $this->line('A value that passes validation will be refused before it is stored.');
            $this->line('Write a migration that widens the column, or fix the setting.');

            return self::FAILURE;
        }

        if ($report['unknown'] !== [])
        {
            $driver = DB::connection()->getDriverName();

            // Out of what it looked at, not out of every expectation: the
            // columns of an absent table were never candidates, and counting
            // them here invites the reader to hunt for problems that are
            // already reported above as a missing table.
            $this->warn(count($report['unknown']) . ' of ' . count($declared)
                . " could not be checked - {$driver} declares no width for them:");

            foreach ($report['unknown'] as $line)
            {
                $this->line('  - ' . $line);
            }

            return self::SUCCESS;
        }

        $this->info('Every column is wide enough for its rule, and PHP can receive an upload.');

        return self::SUCCESS;
    }

    /**
     * The type of each column an expectation names, or null when there is no
     * such column.
     *
     * One read per table rather than one per expectation, and **every** gap is
     * collected rather than the first: a database several migrations behind
     * should be described in one run, not one table per invocation.
     *
     * A table that is absent comes back as such rather than as a handful of
     * absent columns: the cause is the table, and saying it once per column
     * buries it under twelve lines about constants.
     *
     * @return array{0: array<string, string|null>, 1: array<int, string>}
     */
    private function declaredTypes(): array
    {
        $wanted = [];

        foreach (SchemaLimits::expectations() as [$table, $column])
        {
            $wanted[$table][] = $column;
        }

        $declared = [];
        $absent = [];

        foreach ($wanted as $table => $columns)
        {
            if (!Schema::hasTable($table))
            {
                $absent[] = $table;

                continue;
            }

            $types = collect(Schema::getColumns($table))->pluck('type', 'name');

            foreach ($columns as $column)
            {
                $declared["{$table}.{$column}"] = $types->get($column);
            }
        }

        return [$declared, $absent];
    }
}
