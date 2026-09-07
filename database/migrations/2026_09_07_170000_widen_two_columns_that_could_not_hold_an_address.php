<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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

    public function down(): void
    {
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
