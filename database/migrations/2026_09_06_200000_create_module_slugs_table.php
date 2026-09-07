<?php

use App\Models\Language;
use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A Module's name and address, per language (TASKS.md #114).
 *
 * `modules` held one `name` and one `slug`, so `/fr/ypiresies/petit-dejeuner`
 * carried a Greek transliteration in the middle of a French URL - and the page
 * it served was titled *Υπηρεσίες*. The entry was translated and the thing
 * containing it was not.
 *
 * **Rows rather than a JSON column**, for the same reason `entry_slugs` are
 * rows: the public lookup resolves a module by a translated value on every
 * cache miss, and #58 already settled that this has to be one read of one
 * index rather than a scan. The rule is not "everything in tables", it is
 * "whatever you search by goes in a table".
 *
 * `modules.slug` **stays** and keeps its meaning: it is the admin API's route
 * key (`/api/modules/{module}`), which is language-independent because the
 * panel is. What is added here is what the *public* side resolves and prints.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('module_slugs', function (Blueprint $table)
        {
            $table->id();
            $table->foreignId('module_id')->constrained()->cascadeOnDelete();

            // A code, not a relation to `languages` - the same choice
            // `entry_slugs` and `Entry.data` make.
            $table->string('language_code', 5);

            // What the visitor reads. `modules.name` is what the panel reads.
            $table->string('name', Module::NAME_MAX_LENGTH);
            $table->string('slug', Module::SLUG_MAX_LENGTH);

            // A module has one address per language, and no two modules share
            // one: this is the first segment of the path, so `/fr/prestations`
            // has to mean exactly one module. Per language, though - `/el/x`
            // and `/en/x` are different pages, and a client whose Greek and
            // English names coincide is ordinary.
            $table->unique(['module_id', 'language_code']);
            $table->unique(['language_code', 'slug']);
        });

        $this->backfill();
    }

    /**
     * Every existing module keeps working in every language it already served.
     *
     * Without this the site goes dark the moment this lands: the public side
     * resolves through `module_slugs` from here on, and a module with no rows
     * has no page anywhere. Giving each one its current slug and name in every
     * active language leaves every URL exactly as it was - the translating is
     * then something the owner does, page by page, when they choose to.
     */
    private function backfill(): void
    {
        if (!Schema::hasTable('modules') || !Schema::hasTable('languages'))
        {
            return;
        }

        $codes = Language::query()->pluck('code');

        if ($codes->isEmpty())
        {
            return;
        }

        foreach (Module::query()->get(['id', 'name', 'slug']) as $module)
        {
            foreach ($codes as $code)
            {
                DB::table('module_slugs')->insert([
                    'module_id' => $module->id,
                    'language_code' => $code,
                    'name' => $module->name,
                    'slug' => $module->slug,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('module_slugs');
    }
};
