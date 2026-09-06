<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * **A Module is translated, like everything else a visitor reads**
 * (TASKS.md #114).
 *
 * Raised by the owner from three live addresses:
 *
 *     /el/ypiresies/proino
 *     /en/ypiresies/breakfast
 *     /fr/ypiresies/petit-dejeuner
 *
 * The entry is translated and the module is not, so every language carries the
 * Greek transliteration in the middle of its URL - and worse, the page's own
 * `<title>` and `<h1>` read *Υπηρεσίες* on the French site, and the French home
 * page lists the Greek name of every module. The one thing this product sells
 * against a cheap WordPress build is multilingual-by-data-model, and this is
 * the first thing a client sees in a demo.
 *
 * **A module with no translation in a language has no page in it** - the rule
 * entries already follow, chosen by the owner over falling back to the default
 * language's slug, which is what produced `/fr/ypiresies` in the first place.
 */
class ModuleTranslationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);
        Language::create(['name' => 'French', 'code' => 'fr']);
    }

    /**
     * A module with a name and an address in each language it is translated
     * into. `$slugs` maps a language code to `[name, slug]`.
     */
    private function aModule(array $slugs, string $key = 'ypiresies'): Module
    {
        $module = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Services',
            'slug' => $key,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);

        $module->slugs()->delete();

        foreach ($slugs as $language => [$name, $slug])
        {
            $module->slugs()->create([
                'language_code' => $language,
                'name' => $name,
                'slug' => $slug,
            ]);
        }

        return $module->fresh();
    }

    private function anEntry(Module $module, array $slugs): Entry
    {
        $entry = $module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['el' => 'Πρωινό', 'en' => 'Breakfast', 'fr' => 'Petit déjeuner']],
            'status' => Entry::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        foreach ($slugs as $language => $slug)
        {
            $entry->slugs()->create([
                'module_id' => $module->id,
                'language_code' => $language,
                'slug' => $slug,
            ]);
        }

        return $entry->fresh();
    }

    private function translated(): Module
    {
        return $this->aModule([
            'el' => ['Υπηρεσίες', 'ypiresies'],
            'en' => ['Services', 'services'],
            'fr' => ['Services', 'prestations'],
        ]);
    }

    // ------------------------------------------------------- the whole URL

    /**
     * The address the owner asked for: **entirely French**, not a French entry
     * hanging off a Greek module.
     */
    public function test_every_segment_of_the_address_is_in_the_page_s_language(): void
    {
        $module = $this->translated();
        $this->anEntry($module, ['el' => 'proino', 'en' => 'breakfast', 'fr' => 'petit-dejeuner']);

        $this->get('/el/ypiresies/proino')->assertOk();
        $this->get('/en/services/breakfast')->assertOk();
        $this->get('/fr/prestations/petit-dejeuner')->assertOk();
    }

    /**
     * And the Greek address is not a French one. Without this the old shape
     * keeps working beside the new, which is two URLs for one page - the thing
     * #59 exists to prevent.
     */
    public function test_another_language_s_module_address_is_not_an_address_here(): void
    {
        $module = $this->translated();
        $this->anEntry($module, ['el' => 'proino', 'fr' => 'petit-dejeuner']);

        $this->get('/fr/ypiresies')->assertNotFound();
        $this->get('/fr/ypiresies/petit-dejeuner')->assertNotFound();
    }

    // ------------------------------------------------- what the page says

    public function test_the_module_page_is_titled_in_its_own_language(): void
    {
        $this->translated();

        $this->get('/fr/prestations')->assertOk()->assertSee('Services', false)->assertDontSee('Υπηρεσίες', false);
        $this->get('/el/ypiresies')->assertOk()->assertSee('Υπηρεσίες', false);
    }

    public function test_the_home_page_lists_each_module_in_the_reader_s_language(): void
    {
        $this->translated();

        $this->get('/fr')
            ->assertOk()
            ->assertSee('/fr/prestations', false)
            ->assertDontSee('Υπηρεσίες', false)
            ->assertDontSee('/fr/ypiresies', false);
    }

    // --------------------------------------------- a language it has not got

    /**
     * **Decided by the owner** over falling back to the default language: a
     * module nobody has translated into French simply does not exist there.
     * Falling back is what produced `/fr/ypiresies`, and it tells a search
     * engine that a Greek address is a French page.
     */
    public function test_a_module_with_no_translation_has_no_page_in_that_language(): void
    {
        $module = $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies'], 'en' => ['Services', 'services']]);
        $this->anEntry($module, ['el' => 'proino', 'fr' => 'petit-dejeuner']);

        $this->get('/fr/ypiresies')->assertNotFound();
        $this->get('/fr/services')->assertNotFound();

        // Not even the entry, which is translated: it has no address without
        // a module segment to hang from.
        $this->get('/fr/services/petit-dejeuner')->assertNotFound();
    }

    public function test_a_module_with_no_translation_is_not_listed_there(): void
    {
        $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies']]);

        $this->get('/fr')->assertOk()->assertDontSee('ypiresies', false);
        $this->get('/el')->assertOk()->assertSee('ypiresies', false);
    }

    // --------------------------------------------------- what search engines get

    /**
     * The alternates are what tell Google the three pages are one page in
     * three languages. Built from one slug they were three URLs sharing a
     * Greek segment; built per language they are the real addresses.
     */
    public function test_the_alternates_carry_each_language_s_own_address(): void
    {
        $module = $this->translated();
        $this->anEntry($module, ['el' => 'proino', 'en' => 'breakfast', 'fr' => 'petit-dejeuner']);

        $this->get('/fr/prestations/petit-dejeuner')
            ->assertOk()
            ->assertSee('hreflang="el" href="http://mini-cms.test/el/ypiresies/proino"', false)
            ->assertSee('hreflang="en" href="http://mini-cms.test/en/services/breakfast"', false)
            ->assertSee('hreflang="fr" href="http://mini-cms.test/fr/prestations/petit-dejeuner"', false);
    }

    /**
     * An entry **is** translated into French, its module is not: there is no
     * French address to declare, and declaring one would point a search engine
     * at a 404. The check has to be on both segments, and this is the only
     * test where the second one matters.
     */
    public function test_an_entry_declares_no_alternate_where_its_module_has_none(): void
    {
        $module = $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies'], 'en' => ['Services', 'services']]);
        $this->anEntry($module, ['el' => 'proino', 'fr' => 'petit-dejeuner']);

        $this->get('/el/ypiresies/proino')
            ->assertOk()
            ->assertSee('hreflang="el"', false)
            ->assertDontSee('hreflang="fr"', false);
    }

    public function test_the_sitemap_advertises_each_language_s_own_address(): void
    {
        $module = $this->translated();
        $this->anEntry($module, ['el' => 'proino', 'fr' => 'petit-dejeuner']);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('/fr/prestations/petit-dejeuner', false)
            ->assertSee('/el/ypiresies/proino', false)
            ->assertDontSee('/fr/ypiresies', false);
    }

    /**
     * A module untranslated into a language must not reach the sitemap either
     * - advertising an address that answers 404 is worse than omitting it.
     */
    public function test_the_sitemap_leaves_out_a_language_a_module_has_not_got(): void
    {
        $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies']]);

        $this->get('/sitemap.xml')->assertOk()->assertDontSee('/fr/', false);
    }

    /**
     * **"No translation" is about a language the owner has not got to**, not
     * about the moment a module is created. A module that appeared nowhere
     * until somebody translated it would be a module the owner cannot find, so
     * a new one starts with its own name and slug in every active language.
     */
    public function test_a_new_module_is_reachable_in_every_language_at_once(): void
    {
        Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'domatia',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);

        $this->get('/el/domatia')->assertOk();
        $this->get('/en/domatia')->assertOk();
        $this->get('/fr/domatia')->assertOk();
    }

    // ------------------------------------------------- the files on disk

    /**
     * The baked page lives at the address that was served, and invalidation
     * removes that one - not a path composed from the panel's slug, which the
     * site never answered.
     */
    public function test_the_page_is_baked_and_dropped_at_its_translated_address(): void
    {
        $directory = storage_path('framework/testing/module-translation-' . getmypid());

        config(['site.pages' => $directory, 'site.page_cache' => true]);
        File::deleteDirectory($directory);

        try
        {
            $module = $this->translated();
            $entry = $this->anEntry($module, ['fr' => 'petit-dejeuner']);

            $this->get('/fr/prestations/petit-dejeuner')->assertOk();

            $this->assertFileExists(
                $directory . '/fr/prestations/petit-dejeuner.html',
                'The page was not baked where it was served.'
            );

            $entry->touch();

            $this->assertFileDoesNotExist(
                $directory . '/fr/prestations/petit-dejeuner.html',
                'The address the site actually serves was left on disk.'
            );
        }
        finally
        {
            File::deleteDirectory($directory);
        }
    }

    // ------------------------------------------------------------ the rules

    public function test_two_modules_cannot_share_an_address_in_one_language(): void
    {
        $this->aModule(['fr' => ['Services', 'prestations']], 'ypiresies');

        $this->expectException(\Illuminate\Database\QueryException::class);

        $this->aModule(['fr' => ['Autre', 'prestations']], 'allo');
    }

    /**
     * The same word in two languages is fine, and has to be: `/el/services`
     * and `/en/services` are different pages, and a client whose Greek and
     * English names coincide is ordinary.
     */
    public function test_the_same_address_in_two_languages_is_allowed(): void
    {
        $this->aModule(['el' => ['Services', 'services'], 'en' => ['Services', 'services']]);

        $this->get('/el/services')->assertOk();
        $this->get('/en/services')->assertOk();
    }
}
