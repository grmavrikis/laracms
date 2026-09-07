<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\Redirect;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
     * **A status that is not a redirect must not become a 500.**
     *
     * Symfony's `RedirectResponse` throws on anything that is not 3xx, and this
     * runs while a 404 is already being rendered - so one mistyped hand-written
     * row would answer 500 where the site used to answer 404 politely.
     */
    public function test_a_status_that_is_not_a_redirect_is_served_as_301(): void
    {
        Redirect::create(['from_path' => '/typo.html', 'to_path' => '/en/services', 'status' => 200]);

        $this->get('/typo.html')->assertStatus(301)->assertRedirect('/en/services');
    }

    /**
     * **An address is matched decoded.** `getPathInfo()` is percent-encoded and
     * a person writing a row types what they read - and the first market is
     * Greek accommodation, so a Greek address in a client's old site is the
     * ordinary case rather than an exotic one.
     */
    public function test_an_encoded_address_matches_a_row_written_as_it_reads(): void
    {
        Redirect::create(['from_path' => '/δωμάτια', 'to_path' => '/en/services']);
        Redirect::create(['from_path' => '/rooms/deluxe suite.html', 'to_path' => '/en/services']);

        $this->get('/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%B1')->assertRedirect('/en/services');
        $this->get('/rooms/deluxe%20suite.html')->assertRedirect('/en/services');
    }

    /**
     * Stored decoded, sent encoded: a `Location` header is not the place for
     * raw UTF-8, however comparable it makes the table.
     */
    public function test_the_location_header_is_encoded_again(): void
    {
        Redirect::create(['from_path' => '/old', 'to_path' => '/el/δωμάτια']);

        $location = $this->get('/old')->headers->get('Location');

        $this->assertStringEndsWith('/el/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%B1', (string) $location);
    }

    /** And a row written the other way round is matched too. */
    public function test_a_row_written_encoded_is_matched_as_well(): void
    {
        Redirect::create(['from_path' => '/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%B1', 'to_path' => '/en/services']);

        $this->get('/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%B1')->assertRedirect('/en/services');
    }

    /**
     * A site addressed by query is one page per query, not one page in total -
     * `/index.php?p=17` is every pre-permalink WordPress and Joomla.
     */
    public function test_a_row_may_be_keyed_by_its_query_string(): void
    {
        Redirect::create(['from_path' => '/index.php?p=17', 'to_path' => '/en/services/breakfast']);
        Redirect::create(['from_path' => '/index.php', 'to_path' => '/en/services']);

        $this->get('/index.php?p=17')->assertRedirect('/en/services/breakfast');
        $this->get('/index.php')->assertRedirect('/en/services');
    }

    /**
     * A campaign link to a page that has since been renamed should still tell
     * the client where the visit came from.
     */
    public function test_the_query_a_visitor_arrived_with_survives_the_move(): void
    {
        $this->renameEnglishTo('facilities');

        $this->get('/en/services?utm_source=newsletter')
            ->assertRedirect('/en/facilities?utm_source=newsletter');
    }

    /**
     * A 301 makes a browser replay a POST as a GET and drop the body, so a
     * submission is never answered with one. Nothing pinned this guard, and an
     * unpinned guard is how `carriesSessionState` was lost (CHANGELOG §27).
     */
    public function test_a_post_to_a_moved_address_is_not_redirected(): void
    {
        Redirect::create(['from_path' => '/rooms/breakfast.html', 'to_path' => '/en/services/breakfast']);

        $this->post('/rooms/breakfast.html')->assertNotFound();
    }

    /** The other half of the same guard: a screen reading an answer. */
    public function test_a_request_that_wants_json_is_left_alone(): void
    {
        Redirect::create(['from_path' => '/rooms/breakfast.html', 'to_path' => '/en/services/breakfast']);

        $this->get('/rooms/breakfast.html', ['Accept' => 'application/json'])
            ->assertNotFound();
    }

    /**
     * Addresses are matched exactly. The column carries a binary collation so
     * MySQL agrees with the SQLite this runs on - without it the two engines
     * disagree about whether `/Rooms` and `/rooms` are one row.
     */
    public function test_the_lookup_is_case_sensitive(): void
    {
        Redirect::create(['from_path' => '/old-page', 'to_path' => '/en/services']);

        $this->get('/OLD-PAGE')->assertNotFound();
        $this->get('/old-page')->assertRedirect('/en/services');
    }

    /**
     * **Three statements, not three per page.**
     *
     * A rename moves the listing and every published page underneath it, so a
     * real catalogue is hundreds of moves - and one transaction each would hold
     * the panel's Rename button open for seconds and roll the whole rename back
     * on a timeout. `EntryOrderingTest` pins the same promise for reordering.
     */
    public function test_a_rename_writes_its_redirects_in_a_fixed_number_of_statements(): void
    {
        for ($i = 0; $i < 20; $i++)
        {
            $this->anEntry(['en' => 'room-' . $i]);
        }

        $statements = 0;

        DB::listen(function ($query) use (&$statements)
        {
            if (str_contains($query->sql, 'redirects'))
            {
                $statements++;
            }
        });

        $this->renameEnglishTo('facilities');

        // Read before asserting anything about the table, or the assertion's
        // own SELECT is counted as part of the rename.
        $writes = $statements;

        $this->assertDatabaseHas('redirects', ['from_path' => '/en/services/room-19']);
        $this->assertLessThanOrEqual(3, $writes, 'A rename should cost three writes, whatever the catalogue.');
    }

    // ----------------------------------------------------- pages that go away

    /**
     * **A 301 into a 404 is worse than a plain 404**: a crawler follows it and
     * records the new address as broken, where a missing page is a clean
     * signal.
     */
    public function test_deleting_an_entry_removes_what_pointed_at_it(): void
    {
        $entry = $this->module->entries()->first();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => ['el' => 'Πρωινό', 'en' => 'Breakfast']],
                'slugs' => ['el' => 'proino', 'en' => 'brunch'],
            ])
            ->assertOk();

        $this->assertDatabaseHas('redirects', ['from_path' => '/en/services/breakfast']);

        $this->actingAs($this->owner)
            ->deleteJson("/api/modules/{$this->module->slug}/entries/{$entry->id}")
            ->assertSuccessful();

        $this->assertDatabaseMissing('redirects', ['from_path' => '/en/services/breakfast']);
        $this->get('/en/services/breakfast')->assertNotFound();
    }

    /** The same for a module, which is deleted by hand because nothing else can. */
    public function test_deleting_a_module_removes_what_pointed_underneath_it(): void
    {
        $this->renameEnglishTo('facilities');

        $this->assertDatabaseHas('redirects', ['from_path' => '/en/services']);

        $this->module->fresh()->delete();

        $this->assertDatabaseCount('redirects', 0);
    }

    /**
     * A draft has no public page at either address, so a row for it would be a
     * redirect from a 404 to a 404 - and on a site being written over a winter
     * that is a dozen of them per rename per language.
     */
    public function test_a_draft_gets_no_redirect_when_its_module_moves(): void
    {
        $draft = $this->module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['en' => 'zz unfinished']],
            'status' => Entry::STATUS_DRAFT,
        ]);

        $draft->slugs()->create([
            'module_id' => $this->module->id,
            'language_code' => 'en',
            'slug' => 'unfinished',
        ]);

        $this->renameEnglishTo('facilities');

        $this->assertDatabaseMissing('redirects', ['from_path' => '/en/services/unfinished']);
        $this->assertDatabaseHas('redirects', ['from_path' => '/en/services/breakfast']);
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
