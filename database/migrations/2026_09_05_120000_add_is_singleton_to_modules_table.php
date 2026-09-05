<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "About" is one entry; "Blog" is many (TASKS.md #60).
 *
 * A column rather than a key inside `schema`, for the same reason `status` and
 * `sort_order` are columns: it means the same thing for every Module, it is
 * asked about on the read path, and `schema` describes an Entry's *fields*
 * rather than the Module's own shape.
 *
 * Defaults to false, so every Module that exists stays a collection and
 * nothing is silently reinterpreted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table)
        {
            $table->boolean('is_singleton')->default(false)->after('slug');
        });
    }

    public function down(): void
    {
        Schema::table('modules', function (Blueprint $table)
        {
            $table->dropColumn('is_singleton');
        });
    }
};
