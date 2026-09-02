<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A public URL is `/el/rooms/thea-sti-thalassa`, so every request resolves an
 * entry by a **translated** value (TASKS.md #58).
 *
 * Inside `Entry.data` that would be an unindexed scan on every page view of
 * every page. This is the storage complaint's valid core in miniature: the
 * rule is not "everything in tables", it is "whatever you search by goes in a
 * table".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entry_slugs', function (Blueprint $table)
        {
            $table->id();
            $table->foreignId('entry_id')->constrained()->cascadeOnDelete();

            // Copied from the entry rather than reached through it. Two
            // reasons, and both need it here: uniqueness has to be per Module,
            // since the module slug is already in the path and
            // `/el/rooms/about` and `/el/pages/about` are different pages; and
            // the public lookup is then one read of one index instead of a
            // join.
            $table->foreignId('module_id')->constrained()->cascadeOnDelete();

            // Not a foreign key to `languages`, matching how `Entry.data` keys
            // its translations: the language is a code, not a relation
            // (ARCHITECTURE.md - "flat list, no DB relation to Entry").
            $table->string('language_code', 5);
            $table->string('slug');

            $table->unique(['module_id', 'language_code', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entry_slugs');
    }
};
