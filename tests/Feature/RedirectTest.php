<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\Redirect;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **An address that has moved answers 301, not 404** (TASKS.md #69, and step
 * three of #114).
 *
 * Two things arrive at the same door. #114 made a Module's address per
 * language, so translating one *moves every URL underneath it* -
 * `/en/ypiresies/breakfast` becomes `/en/services/breakfast` and the old one
 * dies the moment the owner presses Rename. And #69 is the older need: a
 * client's previous website has URLs Google already ranks, and the day their
 * new site goes live those must not answer 404 - the drop is caused by the
 * delivery, and they will say so.
 *
 * One table answers both. A rename writes its rows itself; the agency writes
 * the old site's by hand, the same way it adds a language (#52).
 */
class RedirectTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Module $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);

        $this->module = $this->aModule([
            'el' => ['Υπηρεσίες', 'ypiresies'],
            'en' => ['Services', 'services'],
        ]);

        $this->anEntry(['el' => 'proino', 'en' => 'breakfast']);
    }

    /** @param array<string, array{0: string, 1: string}> $slugs */
    private function aModule(array $slugs): Module
    {
        $module = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Services',
            'slug' => 'ypiresies',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);

        // The model gives a new module the same name and slug in every
        // language; this test needs one that is already translated.
        $module->slugs()->delete();

        foreach ($slugs as $language => [$name, $slug])
        {
            $module->slugs()->create(['language_code' => $language, 'name' => $name, 'slug' => $slug]);
        }

        return $module->fresh();
    }

    /** @param array<string, string> $slugs */
    private function anEntry(array $slugs): Entry
    {
        $entry = $this->module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['el' => 'Πρωινό', 'en' => 'Breakfast']],
            'status' => Entry::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        foreach ($slugs as $language => $slug)
        {
            $entry->slugs()->create([
                'module_id' => $this->module->id,
                'language_code' => $language,
                'slug' => $slug,
            ]);
        }

        return $entry->fresh();
    }

    /** Rename the English section, leaving the Greek one where it is. */
    private function renameEnglishTo(string $slug): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}", [
                'translations' => [
                    'el' => ['name' => 'Υπηρεσίες', 'slug' => 'ypiresies'],
                    'en' => ['name' => 'Services', 'slug' => $slug],
                ],
            ])
            ->assertOk();
    }

    // ------------------------------------------------- a module that moved

    public function test_a_renamed_module_redirects_its_old_address(): void
    {
        $this->renameEnglishTo('facilities');

        $this->get('/en/services')->assertStatus(301)->assertRedirect('/en/facilities');
        $this->get('/en/facilities')->assertOk();
    }

    /**
     * **Every page underneath it moves too**, which is the part that costs a
     * client their rankings: one rename retires the listing *and* every entry
     * address in that language.
     */
    public function test_an_entry_under_a_renamed_module_redirects_as_well(): void
    {
        $this->renameEnglishTo('facilities');

        $this->get('/en/services/breakfast')
            ->assertStatus(301)
            ->assertRedirect('/en/facilities/breakfast');

        $this->get('/en/facilities/breakfast')->assertOk();
    }

    /** The language that did not move is not touched. */
    public function test_a_language_left_alone_keeps_serving_its_pages(): void
    {
        $this->renameEnglishTo('facilities');

        $this->get('/el/ypiresies')->assertOk();
        $this->get('/el/ypiresies/proino')->assertOk();
    }

    /**
     * A module that has no translation in a language never had a page there,
     * so there is nothing to redirect - the rule #114 settled, and a 301 to
     * the default language's page would be exactly the fallback it refused.
     */
    public function test_a_language_that_loses_its_translation_answers_404(): void
    {
        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}", [
                'translations' => ['el' => ['name' => 'Υπηρεσίες', 'slug' => 'ypiresies']],
            ])
            ->assertOk();

        $this->get('/en/services')->assertNotFound();
    }

    // ------------------------------------------------------ an entry that moved

    public function test_a_renamed_entry_redirects_its_old_address(): void
    {
        $entry = $this->module->entries()->first();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => ['el' => 'Πρωινό', 'en' => 'Breakfast']],
                'slugs' => ['el' => 'proino', 'en' => 'brunch'],
            ])
            ->assertOk();

        $this->get('/en/services/breakfast')
            ->assertStatus(301)
            ->assertRedirect('/en/services/brunch');
    }

    // ------------------------------------------------------------- chains

    /**
     * **Two renames leave one hop, not two.** A chain is not broken, but each
     * extra hop is latency for the visitor and dilution for the crawler - and
     * a client who cannot settle on a name would build one indefinitely.
     */
    public function test_a_second_rename_repoints_the_first_redirect(): void
    {
        $this->renameEnglishTo('facilities');
        $this->renameEnglishTo('amenities');

        $this->get('/en/services')->assertRedirect('/en/amenities');
        $this->get('/en/facilities')->assertRedirect('/en/amenities');
        $this->get('/en/services/breakfast')->assertRedirect('/en/amenities/breakfast');
    }

    /**
     * **Renaming back must not leave a loop.** `services -> facilities`
     * followed by `facilities -> services` would otherwise leave a row saying
     * the live address redirects to itself, and a browser would report too
     * many redirects on the page the owner just restored.
     */
    public function test_renaming_back_leaves_the_live_address_serving(): void
    {
        $this->renameEnglishTo('facilities');
        $this->renameEnglishTo('services');

        $this->get('/en/services')->assertOk();
        $this->get('/en/facilities')->assertRedirect('/en/services');

        // And the row itself is gone rather than merely inert. Repointing the
        // chain turns the first rename's row into `/en/services` pointing at
        // itself; `answer()` refuses to serve that, but a table quietly
        // filling with self-references is one hand-written edit away from
        // being read as a real destination.
        $this->assertDatabaseMissing('redirects', ['from_path' => '/en/services']);
    }

    // --------------------------------------------- the old site's addresses

    /**
     * #69's own case: a row written by hand for a URL this application has no
     * route for at all, because it belonged to the site being replaced.
     */
    public function test_a_row_written_by_hand_redirects_a_path_no_route_matches(): void
    {
        Redirect::create(['from_path' => '/rooms/breakfast.html', 'to_path' => '/en/services/breakfast']);

        $this->get('/rooms/breakfast.html')
            ->assertStatus(301)
            ->assertRedirect('/en/services/breakfast');
    }

    /** A temporary move is a 302, and the row says which it is. */
    public function test_a_row_may_ask_for_a_temporary_redirect(): void
    {
        Redirect::create([
            'from_path' => '/offers.html',
            'to_path' => '/en/services',
            'status' => 302,
        ]);

        $this->get('/offers.html')->assertStatus(302)->assertRedirect('/en/services');
    }

    public function test_an_address_nothing_knows_about_is_still_a_404(): void
    {
        $this->get('/en/nowhere')->assertNotFound();
        $this->get('/nowhere-at-all.html')->assertNotFound();
    }

    // ------------------------------------------------------------- refusals

    /**
     * **A destination is a path on this site, never somewhere else.** A row
     * reading `//evil.example` starts with a slash and would send every
     * visitor who hits that address off the site - the classic open redirect,
     * one hand-written UPDATE away.
     */
    public function test_a_destination_pointing_off_the_site_is_ignored(): void
    {
        Redirect::create(['from_path' => '/old', 'to_path' => '//evil.example/']);
        Redirect::create(['from_path' => '/older', 'to_path' => 'https://evil.example/']);

        $this->get('/old')->assertNotFound();
        $this->get('/older')->assertNotFound();
    }

    /**
     * The panel and the API answer JSON, and a 404 there is an answer the
     * screen reads - not an address a visitor typed.
     */
    public function test_an_api_404_is_left_alone(): void
    {
        Redirect::create(['from_path' => '/api/nothing', 'to_path' => '/en/services']);

        $this->actingAs($this->owner)->getJson('/api/nothing')->assertNotFound();
    }

    /**
     * **A lookup that cannot run leaves the 404 alone.**
     *
     * This is the last thing between a visitor and the page saying there is
     * nothing here, and it runs while an error is already being rendered. A
     * database that is down - or a deployment where nobody ran the migrations,
     * which is how this was found - must not turn every missing address into a
     * 500.
     */
    public function test_a_broken_lookup_still_answers_404(): void
    {
        Schema::drop('redirects');

        $this->get('/en/nowhere')->assertNotFound();
    }
}
