<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Structural columns, not schema fields (TASKS.md #56, #57).
 *
 * These mean the same thing for every Module and they are what routing,
 * filtering and ordering run on, so they are real indexed columns rather than
 * keys inside `data` - which cannot be indexed without generated columns.
 * Content stays in the JSON.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('entries', function (Blueprint $table)
        {
            $table->string('status', 20)->default('draft')->after('data');
            $table->timestamp('published_at')->nullable()->after('status');
            // Default high on purpose. Ordering is ascending so that position
            // 1 is the top of the page, which is what somebody typing a
            // position expects - and with a default of 0 that expectation was
            // exactly inverted: setting an entry to 1 pushed it *below* every
            // entry nobody had positioned. A sentinel beyond any hand-set
            // position keeps "unpositioned sorts last" true without a computed
            // ORDER BY that no index could serve.
            $table->unsignedInteger('sort_order')->default(100000)->after('published_at');

            // Every listing is within one Module, so that is the leading
            // column of both: a bare index on `status` would be almost all of
            // the table on either value.
            $table->index(['module_id', 'status']);
            $table->index(['module_id', 'sort_order']);
        });

        // Rows written before the column existed were live - the site had no
        // other state. Leaving them as drafts would hide a client's existing
        // content the moment public pages arrive, so the old meaning is kept.
        // `created_at` is null on anything the old seeder wrote, and
        // `published_at` is nullable, so that carries over honestly.
        DB::table('entries')->update([
            'status' => 'published',
            'published_at' => DB::raw('created_at'),
        ]);
    }

    public function down(): void
    {
        Schema::table('entries', function (Blueprint $table)
        {
            $table->dropIndex(['module_id', 'status']);
            $table->dropIndex(['module_id', 'sort_order']);
            $table->dropColumn(['status', 'published_at', 'sort_order']);
        });
    }
};
