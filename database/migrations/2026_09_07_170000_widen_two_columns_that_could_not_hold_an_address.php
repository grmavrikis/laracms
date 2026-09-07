<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two columns were narrower than the addresses this application generates
 * (TASKS.md #98, found by the review of it).
 *
 * The sum nobody had done: a public path is `/{language}/{module}/{slug}`, and
 * the two slug columns are 255 characters each, so an address can reach 518 -
 * plus a scheme and a host when it is written out in full.
 *
 * - **`enquiries.source_url` was 512.** The form fills it with
 *   `url()->current()`, so a page with long slugs made every submission from
 *   it a 422 - and the message named a hidden field the visitor can neither
 *   see nor fix. 2048 is the conventional practical ceiling for a URL.
 * - **`redirects.from_path` and `to_path` were 512.** A rename of a module
 *   with long slugs could not record where its pages went: `Redirects::remember`
 *   logged and skipped, so the old address stayed dead. 640 clears 518 and
 *   stays under InnoDB's 3072-byte key limit, which utf8mb4 reaches at 768.
 *
 * Widening loses nothing, so this direction needs no check against the data.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enquiries', function (Blueprint $table)
        {
            $table->string('source_url', 2048)->nullable()->change();
        });

        Schema::table('redirects', function (Blueprint $table)
        {
            $table->string('from_path', 640)->change();
            $table->string('to_path', 640)->change();
        });
    }

    /**
     * **Narrowing, which is the direction that can lose something.**
     *
     * `up()` is safe because widening never drops a character. Going back is
     * not: by then a visitor may have written from a page whose address is
     * longer than 512, and a rename may have recorded one. MySQL in strict mode
     * would answer 1406 half way through and leave one table changed and the
     * other not; a server that is not strict would truncate a redirect to an
     * address that goes somewhere else.
     *
     * So it refuses rather than guesses, and says what to do about it.
     */
    public function down(): void
    {
        foreach ([['enquiries', 'source_url'], ['redirects', 'from_path'], ['redirects', 'to_path']] as [$table, $column])
        {
            $longest = (int) DB::table($table)->max(DB::raw("char_length({$column})"));

            if ($longest > 512)
            {
                throw new RuntimeException(
                    "Cannot roll back: {$table}.{$column} holds a value of {$longest} characters, "
                    . 'and this would narrow the column to 512. Shorten or delete those rows first.'
                );
            }
        }

        Schema::table('enquiries', function (Blueprint $table)
        {
            $table->string('source_url', 512)->nullable()->change();
        });

        Schema::table('redirects', function (Blueprint $table)
        {
            $table->string('from_path', 512)->change();
            $table->string('to_path', 512)->change();
        });
    }
};
