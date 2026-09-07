<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **What `schema:doctor` says, and what it exits with** (TASKS.md #98).
 *
 * `SchemaLimits` carries the arithmetic and is covered by `ColumnWidthTest`.
 * This is the other half: the sections the command prints and - the part a
 * deployment actually depends on - **the exit code**. A script runs
 * `schema:doctor && pages:warm`, so a command that answered 0 on a failing
 * report would carry a deployment straight past the check built to stop it.
 *
 * **The exit code rather than the wording**, because which line the healthy
 * path prints depends on the driver: SQLite declares no width at all, so it
 * names the columns it could not read and still succeeds, while MySQL says
 * everything is wide enough. What the states read like belongs to
 * `ColumnWidthTest`, which asks `SchemaLimits` directly and needs no database
 * to do it. Everything that must fail is arranged here by taking the schema
 * apart, which is exactly the state the command exists to describe.
 */
class SchemaDoctorTest extends TestCase
{
    use RefreshDatabase;

    /**
     * **The exit code, not the wording.** Which line this prints depends on the
     * driver - SQLite declares no widths, so it names the columns it could not
     * read - and asserting that here would fail the day the suite ran against
     * MySQL, at the moment the command started answering properly. What the
     * three states read like is `ColumnWidthTest`'s subject, against
     * `SchemaLimits` directly.
     */
    public function test_a_migrated_database_passes(): void
    {
        $this->artisan('schema:doctor')->assertExitCode(0);
    }

    /**
     * A column that is not there is a failure, not an unknown - the defect the
     * first version of this command had, and the completest way for a schema to
     * fall behind the code.
     */
    public function test_a_missing_column_fails(): void
    {
        Schema::table('enquiries', function ($table)
        {
            $table->dropColumn('source_url');
        });

        $this->artisan('schema:doctor')
            ->expectsOutputToContain('enquiries.source_url')
            ->assertExitCode(1);
    }

    /** And a missing table is named as a table, once. */
    public function test_a_missing_table_fails_and_says_so(): void
    {
        Schema::drop('redirects');

        $this->artisan('schema:doctor')
            ->expectsOutputToContain('has it been migrated?')
            ->expectsOutputToContain('redirects')
            ->assertExitCode(1);
    }
}
