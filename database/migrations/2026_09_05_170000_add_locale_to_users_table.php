<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which language a person reads the panel in (TASKS.md #96).
 *
 * On the user rather than in settings, because it is a preference and not a
 * configuration: a Greek owner and an English-speaking colleague share one
 * installation and one content set. Null means "whatever this installation is
 * set to", which is where a new account starts.
 *
 * Five characters, which is what `languages.code` uses and what BCP 47 needs
 * for `pt-BR`. Deliberately no foreign key: interface locales are files in
 * `lang/`, not rows - see `InterfaceLocales` for why the two axes are
 * separate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table)
        {
            $table->string('locale', 5)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table)
        {
            $table->dropColumn('locale');
        });
    }
};
