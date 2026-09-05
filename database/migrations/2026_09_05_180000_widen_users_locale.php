<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users.locale` was five characters, which is what `languages.code` holds -
 * but that is a *content* language and this is an interface locale, and the
 * two are not the same kind of value (TASKS.md #96).
 *
 * An interface locale is a filename in `lang/`, so nothing bounded it: the
 * picker would offer `zh-Hant-TW`, the rule would accept it, and MySQL would
 * answer 1406 on the write. #76, one column along, and invisible to the
 * SQLite the suite runs on.
 *
 * The width lives on the model now, so the rule and the column cannot drift.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table)
        {
            $table->string('locale', User::LOCALE_MAX_LENGTH)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table)
        {
            $table->string('locale', 5)->nullable()->change();
        });
    }
};
