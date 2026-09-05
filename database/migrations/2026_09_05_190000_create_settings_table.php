<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a client may change about their own site (TASKS.md #67).
 *
 * **One row.** The values are one form, saved together, and the fields are
 * declared in PHP by `SiteSettings` rather than by rows - so a key/value table
 * would only add a way for the two to disagree. A `data` column also means the
 * same JSON shape an Entry uses, which is what lets `SchemaRuleBuilder`
 * validate settings without a second set of rules.
 *
 * No `user_id`: the settings belong to the installation, not to whoever
 * happened to open the screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table)
        {
            $table->id();
            $table->json('data');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
