<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('entry_translations', function (Blueprint $table)
        {
            $table->id();
            $table->foreignId('entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('language_id')->constrained('languages')->cascadeOnDelete();
            $table->json('data'); // Holds translatable fields like title, description
            $table->timestamps();

            // Prevents multiple translations for the same entry in the same language
            $table->unique(['entry_id', 'language_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('entry_translations');
    }
};
