<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * entry_translations belonged to a translation model this CMS did not adopt.
 *
 * Translatable content lives inside Entry.data, keyed by language code (see
 * docs/ARCHITECTURE.md). Nothing ever wrote to this table - it was empty when
 * dropped - but leaving it in the schema suggested it was the active model to
 * anyone reading the database.
 *
 * The create migration is deliberately left in place: it is the record of what
 * existed, and removing a migration that has already run elsewhere would make
 * that history unreproducible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('entry_translations');
    }

    /**
     * Recreated exactly as the original migration defined it, so this step is
     * reversible even though the table has no use.
     */
    public function down(): void
    {
        Schema::create('entry_translations', function (Blueprint $table)
        {
            $table->id();
            $table->foreignId('entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('language_id')->constrained('languages')->cascadeOnDelete();
            $table->json('data');
            $table->timestamps();

            $table->unique(['entry_id', 'language_id']);
        });
    }
};
