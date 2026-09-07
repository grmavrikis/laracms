<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The columns catch up with the constants (TASKS.md #98).
 *
 * `enquiries.name` and `enquiries.email` were created with Laravel's default
 * 255 while the rules that fill them said 120 and 180 - two numbers per field,
 * unconnected, which is the whole finding. Now that the migration reads
 * `Enquiry::NAME_MAX_LENGTH`, a **fresh** installation gets the narrower
 * column; this is what brings an existing one to the same place, because
 * editing a constant does not alter a table that already exists.
 *
 * **Narrowing is safe here and would not be in general.** Every value in
 * those columns passed a rule that has capped them at 120 and 180 since the
 * table was created, so nothing stored can be too long for the new width. It
 * was checked on the live database before this was written rather than
 * reasoned about: one row, longest name 15 characters, longest email 20.
 *
 * `phone` and `source_url` are already at their constants and are not touched.
 * `message` is `text` and `guests` a small integer: those two constants are
 * rules about what an enquiry means, not widths - see the model.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Requires doctrine/dbal on Laravel 10 and earlier; on 11+ `change()`
        // is native. SQLite rebuilds the table, which is why the suite's
        // in-memory database sees this at all.
        Schema::table('enquiries', function (Blueprint $table)
        {
            $table->string('name', 120)->change();
            $table->string('email', 180)->change();
        });
    }

    /**
     * Back to Laravel's default width, which is what these columns were.
     *
     * Widening never loses anything, so a rollback is safe in a way the
     * forward direction had to be checked for.
     */
    public function down(): void
    {
        Schema::table('enquiries', function (Blueprint $table)
        {
            $table->string('name', 255)->change();
            $table->string('email', 255)->change();
        });
    }
};
