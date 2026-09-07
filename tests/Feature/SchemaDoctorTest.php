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
 * The suite runs on SQLite, which declares no width at all, so the healthy path
 * here is the *honest warning* one: it names the columns it could not read and
 * still succeeds. Everything that must fail is arranged by taking the schema
 * apart, which is exactly the state the command exists to describe.
 */
class SchemaDoctorTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_migrated_database_passes_with_the_columns_it_could_not_read(): void
    {
        $this->artisan('schema:doctor')
            ->expectsOutputToContain('could not be checked')
            ->assertExitCode(0);
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
