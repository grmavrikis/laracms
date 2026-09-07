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

    // ------------------------------------------------------- the panel API

    /**
     * **The name is typed per language and the slug is derived from it.**
     *
     * `Str::slug` transliterates, it does not translate: from Υπηρεσίες it
     * produces `ypiresies` whatever language you ask for, which is how
     * `/fr/ypiresies` came about in the first place. PHP cannot translate and
     * must not try. The human supplies the translated name, and the derivation
     * runs once per language on that language own words.
     */
    public function test_each_language_derives_its_slug_from_its_own_name(): void
    {
        $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Υπηρεσίες',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
            'translations' => [
                'el' => ['name' => 'Υπηρεσίες'],
                'en' => ['name' => 'Services'],
                'fr' => ['name' => 'Prestations'],
            ],
        ])->assertCreated();

        $module = Module::latest('id')->first();

        $this->assertSame('ypiresies', $module->slugFor('el'));
        $this->assertSame('services', $module->slugFor('en'));
        $this->assertSame('prestations', $module->slugFor('fr'));
        $this->assertSame('Prestations', $module->nameFor('fr'));
    }

    public function test_a_slug_can_be_given_instead_of_derived(): void
    {
        $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Services',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
            'translations' => [
                'el' => ['name' => 'Υπηρεσίες', 'slug' => 'ypiresies-mas'],
                'en' => ['name' => 'Services'],
                'fr' => ['name' => 'Prestations'],
            ],
        ])->assertCreated();

        $this->assertSame('ypiresies-mas', Module::latest('id')->first()->slugFor('el'));
    }

    /**
     * A module created the old way - no `translations` at all - still works.
     * The API is public and every client that exists sends that shape.
     */
    public function test_a_module_created_without_translations_still_gets_them(): void
    {
        $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Δωμάτια',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ])->assertCreated();

        $module = Module::latest('id')->first();

        $this->assertSame('domatia', $module->slugFor('el'));
        $this->assertSame('domatia', $module->slugFor('fr'));
    }

    /**
     * There was **no endpoint that updates a Module at all** before this -
     * `ModuleController` had `store` and `index`, so translating one meant a
     * hand-written UPDATE.
     */
    public function test_a_module_can_be_translated_after_it_exists(): void
    {
        $module = $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies']]);

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => [
                'el' => ['name' => 'Υπηρεσίες'],
                'fr' => ['name' => 'Prestations'],
            ],
        ])->assertOk();

        $module = $module->fresh();

        $this->assertSame('prestations', $module->slugFor('fr'));
        $this->assertSame('Prestations', $module->nameFor('fr'));
        $this->get('/fr/prestations')->assertOk();
    }

    /**
     * A language left out of the payload loses its translation, which is what
     * "these are the module addresses" has to mean - the same rule
     * `EntryController::syncSlugs` follows for an entry.
     */
    public function test_a_language_left_out_of_the_payload_is_removed(): void
    {
        $module = $this->translated();

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => ['el' => ['name' => 'Υπηρεσίες']],
        ])->assertOk();

        $this->assertNull($module->fresh()->slugFor('fr'));
        $this->get('/fr/prestations')->assertNotFound();
    }

    /**
     * **Renaming a section retires the pages it used to serve.**
     *
     * Found live rather than by reading: after renaming the French section,
     * its old address still answered 200. Nothing had invalidated anything -
     * `syncTranslations` deletes the slug rows en masse, which fires no model
     * events, and the module row itself is never saved, so the observer never
     * runs. The old file simply stayed on disk and Apache went on serving it.
     *
     * Exactly the trap `EntryController::syncSlugs` is commented for, walked
     * into again in the endpoint written a day later.
     */
    public function test_renaming_a_module_retires_its_old_addresses(): void
    {
        $directory = storage_path('framework/testing/module-rename-' . getmypid());

        config(['site.pages' => $directory, 'site.page_cache' => true]);
        File::deleteDirectory($directory);

        try
        {
            $module = $this->translated();
            $this->anEntry($module, ['fr' => 'petit-dejeuner']);

            $this->get('/fr/prestations')->assertOk();
            $this->get('/fr/prestations/petit-dejeuner')->assertOk();
            $this->assertFileExists($directory . '/fr/prestations.html');

            $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
                'translations' => [
                    'el' => ['name' => 'Υπηρεσίες', 'slug' => 'ypiresies'],
                    'fr' => ['name' => 'Manifestations'],
                ],
            ])->assertOk();

            $this->assertFileDoesNotExist(
                $directory . '/fr/prestations.html',
                'The old address is still on disk and still being served.'
            );
            $this->assertFileDoesNotExist(
                $directory . '/fr/prestations/petit-dejeuner.html',
                'An entry page under the old address survived the rename.'
            );

            // A 301 since step three (#69): the file is gone, PHP runs, and
            // the address it used to serve now names where it went. It was a
            // 404 here until redirects landed, which is what that step exists
            // to stop - the client keeps the rankings the old address earned.
            $this->get('/fr/prestations')->assertRedirect('/fr/manifestations');
            $this->get('/fr/manifestations')->assertOk();
        }
        finally
        {
            File::deleteDirectory($directory);
        }
    }

    /**
     * The panel own key never moves. `/api/modules/{module}` resolves by
     * `modules.slug`, and a key that changed when somebody renamed the module
     * would break every address the panel is holding at that moment.
     */
    public function test_translating_a_module_does_not_move_the_panel_key(): void
    {
        $module = $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies']]);

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => ['el' => ['name' => 'Εντελώς άλλο']],
        ])->assertOk();

        $this->assertSame('ypiresies', $module->fresh()->slug);
    }

    public function test_two_modules_are_refused_the_same_address_in_one_language(): void
    {
        $this->aModule(['fr' => ['Prestations', 'prestations']], 'ypiresies');
        $other = $this->aModule(['fr' => ['Autre', 'autre']], 'allo');

        $this->actingAs($this->owner)->putJson("/api/modules/{$other->slug}", [
            'translations' => ['fr' => ['name' => 'Autre', 'slug' => 'prestations']],
        ])->assertStatus(422)->assertJsonValidationErrors('translations.fr.slug');
    }

    public function test_translating_a_module_needs_a_session(): void
    {
        $module = $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies']]);

        $this->putJson("/api/modules/{$module->slug}", [
            'translations' => ['fr' => ['name' => 'Prestations']],
        ])->assertStatus(401);
    }

    /**
     * **The panel sees a language the public site does not.**
     *
     * `LanguageController::index` filtered `is_active`, so one endpoint served
     * two audiences that need different answers: an active language links the
     * public switcher to a half-empty site while the client is still
     * translating, and an inactive one is invisible in the panel, so they
     * cannot translate at all. The agency adds a language, the client fills it
     * in, and only then does it go live - adding one is a billable service
     * (BUSINESS.md 5), which is why there is no endpoint for it.
     */
    public function test_the_panel_is_offered_a_language_that_is_not_published_yet(): void
    {
        Language::create(['name' => 'German', 'code' => 'de', 'is_active' => false]);

        $codes = collect($this->actingAs($this->owner)->getJson('/api/languages')->json())
            ->pluck('code')
            ->all();

        $this->assertContains('de', $codes, 'The panel cannot translate into a language it is not shown.');

        // And the public side is untouched by that.
        $this->get('/de')->assertNotFound();
    }

    /**
     * **The list carries each module translations**, so the panel can show
     * which languages a section is missing without asking once per row.
     *
     * This is the half that was missing when the endpoint landed: a module was
     * created with French left blank and there was no way to see that, and no
     * screen to go back and fill it in. An API nothing can reach is not a
     * feature.
     */
    public function test_the_module_list_says_which_languages_each_one_has(): void
    {
        $this->aModule(['el' => ['Υπηρεσίες', 'ypiresies'], 'en' => ['Services', 'services']]);

        $listed = $this->actingAs($this->owner)->getJson('/api/modules')->assertOk()->json();

        $codes = collect($listed[0]['slugs'] ?? [])->pluck('language_code')->all();

        $this->assertSame(['el', 'en'], $codes, 'The panel cannot tell which languages a section is missing.');
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
