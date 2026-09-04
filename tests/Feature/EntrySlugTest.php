<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\EntrySlug;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A public page is `/el/rooms/thea-sti-thalassa`, so every request resolves an
 * entry by a **translated** value (TASKS.md #58).
 *
 * Inside `data` that would be an unindexed scan on every page view of every
 * page, so slugs live in their own table with a real index. This is the
 * storage complaint's valid core in miniature: the rule is not "everything in
 * tables", it is **"whatever you search by goes in a table"**.
 *
 * Uniqueness is per Module, not per installation: the module slug is already
 * in the path, so `/el/rooms/about` and `/el/pages/about` are different pages
 * and both are legitimate.
 */
class EntrySlugTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Module $rooms;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->rooms = $this->makeModule('rooms');

        // A slug key is a language, so the languages have to exist for one to
        // be written at all - see the key rules below.
        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);
    }

    private function makeModule(string $slug): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => ucfirst($slug),
            'slug' => $slug,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ]);
    }

    private function createEntry(Module $module, array $slugs, string $title = 'x')
    {
        return $this->actingAs($this->owner)->postJson(
            "/api/modules/{$module->slug}/entries",
            ['data' => ['title' => $title], 'slugs' => $slugs]
        );
    }

    public function test_an_entry_carries_a_slug_per_language(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea-sti-thalassa', 'en' => 'sea-view'])
            ->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->assertSame('thea-sti-thalassa', $entry->slugFor('el'));
        $this->assertSame('sea-view', $entry->slugFor('en'));
    }

    public function test_a_language_may_have_no_slug_at_all(): void
    {
        // An untranslated entry simply has no URL in that language.
        $this->createEntry($this->rooms, ['en' => 'sea-view'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->assertSame('sea-view', $entry->slugFor('en'));
        $this->assertNull($entry->slugFor('el'));
    }

    public function test_slugs_are_optional(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->rooms->slug}/entries", ['data' => ['title' => 'x']])
            ->assertCreated();

        $this->assertSame(0, $this->rooms->entries()->sole()->slugs()->count());
    }

    // --------------------------------------------------------- what is refused

    public function test_two_entries_in_one_module_cannot_share_a_slug(): void
    {
        $this->createEntry($this->rooms, ['el' => 'about'])->assertCreated();

        $this->createEntry($this->rooms, ['el' => 'about'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slugs.el');
    }

    /**
     * The module slug is already in the path, so these are different pages.
     */
    public function test_two_modules_may_each_have_the_same_slug(): void
    {
        $pages = $this->makeModule('pages');

        $this->createEntry($this->rooms, ['el' => 'about'])->assertCreated();
        $this->createEntry($pages, ['el' => 'about'])->assertCreated();
    }

    /**
     * `/el/rooms/about` and `/en/rooms/about` are different URLs.
     */
    public function test_one_slug_may_be_used_in_two_languages(): void
    {
        $this->createEntry($this->rooms, ['el' => 'about', 'en' => 'about'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->assertSame('about', $entry->slugFor('el'));
        $this->assertSame('about', $entry->slugFor('en'));
    }

    public function test_a_slug_that_could_never_be_a_url_segment_is_rejected(): void
    {
        foreach (['Θέα', 'two words', 'a/b', 'UPPER', 'trailing-'] as $bad)
        {
            $this->createEntry($this->rooms, ['el' => $bad])
                ->assertStatus(422)
                ->assertJsonValidationErrors('slugs.el');
        }
    }

    public function test_an_entry_keeping_its_own_slug_is_not_a_collision(): void
    {
        $this->createEntry($this->rooms, ['el' => 'about'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->rooms->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'renamed'],
                'slugs' => ['el' => 'about'],
            ])
            ->assertOk();
    }

    // ------------------------------------------------------------- updating

    public function test_sending_slugs_replaces_the_whole_set(): void
    {
        $this->createEntry($this->rooms, ['el' => 'palio', 'en' => 'old'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->rooms->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'x'],
                'slugs' => ['el' => 'neo'],
            ])
            ->assertOk();

        $entry->refresh();

        $this->assertSame('neo', $entry->slugFor('el'));
        $this->assertNull($entry->slugFor('en'), 'A language left out of the payload keeps no slug.');
    }

    public function test_leaving_slugs_out_of_an_update_keeps_them(): void
    {
        $this->createEntry($this->rooms, ['el' => 'meno'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->rooms->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'edited'],
            ])
            ->assertOk();

        $this->assertSame('meno', $entry->fresh()->slugFor('el'));
    }

    public function test_deleting_an_entry_takes_its_slugs_with_it(): void
    {
        $this->createEntry($this->rooms, ['el' => 'fevgei'])->assertCreated();

        $entry = $this->rooms->entries()->sole();

        $this->actingAs($this->owner)
            ->deleteJson("/api/modules/{$this->rooms->slug}/entries/{$entry->id}")
            ->assertNoContent();

        $this->assertDatabaseCount('entry_slugs', 0);
    }

    // -------------------------------------------------------- the public read

    /**
     * The one query a public page makes to find what it is showing.
     */
    public function test_an_entry_can_be_found_by_module_language_and_slug(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea'], 'Sea view')->assertCreated();

        $found = Entry::forSlug($this->rooms, 'el', 'thea')->first();

        $this->assertNotNull($found);
        $this->assertSame('Sea view', $found->data['title']);
    }

    public function test_a_slug_from_another_language_does_not_resolve(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea'])->assertCreated();

        $this->assertNull(Entry::forSlug($this->rooms, 'en', 'thea')->first());
    }

    public function test_a_slug_from_another_module_does_not_resolve(): void
    {
        $pages = $this->makeModule('pages');

        $this->createEntry($this->rooms, ['el' => 'thea'])->assertCreated();

        $this->assertNull(Entry::forSlug($pages, 'el', 'thea')->first());
    }

    /**
     * A scope rather than a finder so the public side can ask for
     * `forSlug(...)->published()`, while a preview leaves the second half off.
     */
    public function test_the_lookup_composes_with_the_published_scope(): void
    {
        $this->createEntry($this->rooms, ['el' => 'peiragmeno'])->assertCreated();

        $this->assertNotNull(Entry::forSlug($this->rooms, 'el', 'peiragmeno')->first());
        $this->assertNull(Entry::forSlug($this->rooms, 'el', 'peiragmeno')->published()->first());
    }

    public function test_an_unknown_slug_resolves_to_nothing(): void
    {
        $this->assertNull(Entry::forSlug($this->rooms, 'el', 'den-yparxei')->first());
    }

    // -------------------------------------------------- the key is a language

    /**
     * `entry_slugs.language_code` is `varchar(5)`, and nothing validated the
     * key - so a longer one passed validation and MySQL answered **500**
     * (TASKS.md #76):
     *
     *   SQLSTATE[22001]: 1406 Data too long for column 'language_code'
     *
     * The suite runs on SQLite, which does not enforce varchar limits, so no
     * assertion on the response body could have caught it. What can be pinned
     * here is the rule that makes it impossible: the key has to be one of the
     * site's active languages, and every active code fits the column.
     */
    public function test_a_slug_key_longer_than_the_column_is_rejected(): void
    {
        $this->createEntry($this->rooms, ['en-GB-oxendict' => 'probe'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slugs');

        $this->assertDatabaseCount('entry_slugs', 0);
    }

    /**
     * The other half of the same hole: `{"zz": "about"}` was accepted and
     * created a public URL in a language the site does not have.
     */
    public function test_a_slug_key_that_is_not_a_language_is_rejected(): void
    {
        $this->createEntry($this->rooms, ['zz' => 'about'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slugs');

        $this->assertDatabaseCount('entry_slugs', 0);
    }

    public function test_a_slug_key_for_a_deactivated_language_is_rejected(): void
    {
        Language::where('code', 'en')->update(['is_active' => false]);

        $this->createEntry($this->rooms, ['en' => 'sea-view'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('slugs');
    }

    public function test_an_active_language_is_still_accepted(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea', 'en' => 'sea-view'])
            ->assertCreated();

        $this->assertDatabaseCount('entry_slugs', 2);
    }

    // -------------------------------------------- one write, or none of it

    /**
     * `syncSlugs` deleted every row and then inserted the new ones, with
     * nothing wrapping the pair (TASKS.md #77). A failed insert therefore left
     * the entry with **no URLs at all**: the author saw a 500 and two live
     * pages went dead.
     *
     * The failure is forced on the insert itself rather than through a
     * particular constraint, because what has to hold is "the write happens
     * whole or not at all" - not "this one collision is handled". The
     * collisions the rules already catch never reach here; a race on the
     * unique index, or any constraint the rules do not restate, does.
     */
    private function makeTheSlugInsertFail(): void
    {
        EntrySlug::creating(function (): void
        {
            throw new \RuntimeException('the slug insert failed');
        });
    }

    public function test_a_failed_slug_write_leaves_the_existing_urls_alone(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea', 'en' => 'sea-view'])->assertCreated();
        $entry = Entry::sole();

        $this->makeTheSlugInsertFail();
        $this->withoutExceptionHandling();

        try
        {
            $this->actingAs($this->owner)->putJson(
                "/api/modules/{$this->rooms->slug}/entries/{$entry->id}",
                ['data' => ['title' => 'x'], 'slugs' => ['el' => 'thea-nea']]
            );
            $this->fail('The slug insert was supposed to throw.');
        }
        catch (\RuntimeException $e)
        {
            // Expected.
        }

        $this->assertSame(
            ['el' => 'thea', 'en' => 'sea-view'],
            $entry->fresh()->slugs->pluck('slug', 'language_code')->all(),
            "A failed slug write must not take the entry's live URLs with it."
        );
    }

    /**
     * The same shape on create: the entry row was committed before the slugs
     * were written, so a slug failure left a saved entry the client was never
     * told about.
     */
    public function test_a_failed_slug_write_does_not_leave_a_half_created_entry(): void
    {
        $this->makeTheSlugInsertFail();
        $this->withoutExceptionHandling();

        try
        {
            $this->actingAs($this->owner)->postJson(
                "/api/modules/{$this->rooms->slug}/entries",
                ['data' => ['title' => 'New'], 'slugs' => ['el' => 'thea']]
            );
            $this->fail('The slug insert was supposed to throw.');
        }
        catch (\RuntimeException $e)
        {
            // Expected.
        }

        $this->assertSame(0, $this->rooms->entries()->count());
    }

    // ------------------------------------ three endpoints, one resource shape

    /**
     * `store()` returned the model straight from `create()`, which never reads
     * the row back - so the 201 omitted every column the database defaulted
     * (TASKS.md #81). A client creating an entry without a status read
     * `response.status` as undefined and showed Draft whatever was stored.
     *
     * And `show()` loaded `slugs` while `store()` and `update()` did not, so
     * three endpoints returned three shapes for one resource.
     */
    private const SHAPE = [
        'id', 'module_id', 'data', 'status', 'published_at', 'sort_order',
        'created_at', 'updated_at', 'slugs',
    ];

    public function test_creating_an_entry_returns_the_whole_resource(): void
    {
        $response = $this->actingAs($this->owner)->postJson(
            "/api/modules/{$this->rooms->slug}/entries",
            ['data' => ['title' => 'x'], 'slugs' => ['el' => 'thea']]
        )->assertCreated();

        $response->assertJsonStructure(self::SHAPE);

        // Not merely present: the values the database chose, not the ones the
        // client happened to send.
        $this->assertSame(Entry::STATUS_DRAFT, $response->json('status'));
        $this->assertNull($response->json('sort_order'));
        $this->assertNull($response->json('published_at'));
        $this->assertSame('thea', $response->json('slugs.0.slug'));
    }

    public function test_updating_an_entry_returns_the_same_shape(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea'])->assertCreated();
        $entry = Entry::sole();

        $this->actingAs($this->owner)->putJson(
            "/api/modules/{$this->rooms->slug}/entries/{$entry->id}",
            ['data' => ['title' => 'y'], 'slugs' => ['el' => 'nea']]
        )
            ->assertOk()
            ->assertJsonStructure(self::SHAPE)
            ->assertJsonPath('slugs.0.slug', 'nea');
    }

    public function test_showing_an_entry_returns_the_same_shape(): void
    {
        $this->createEntry($this->rooms, ['el' => 'thea'])->assertCreated();
        $entry = Entry::sole();

        $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->rooms->slug}/entries/{$entry->id}")
            ->assertOk()
            ->assertJsonStructure(self::SHAPE);
    }

    /**
     * The publication stamp is written by the server, so the 201 has to carry
     * it back or the panel cannot show when the entry went out.
     */
    public function test_publishing_on_create_returns_the_stamp_the_server_wrote(): void
    {
        $response = $this->actingAs($this->owner)->postJson(
            "/api/modules/{$this->rooms->slug}/entries",
            ['data' => ['title' => 'x'], 'status' => Entry::STATUS_PUBLISHED]
        )->assertCreated();

        $this->assertNotNull($response->json('published_at'));
    }

    // ------------------------------------------------------- the read path

    /**
     * $this->slugs lazy-loads, per model and per call, so a public index of
     * fifteen entries with a link each was fifteen SELECTs against
     * entry_slugs - thirty if the template also needs the hreflang alternate
     * (TASKS.md #85).
     *
     * This is the read path #59 is about to build on, so the scope that makes
     * it one query exists before rather than after.
     */
    public function test_a_list_of_entries_reads_its_slugs_in_one_query(): void
    {
        foreach (range(1, 15) as $n)
        {
            $entry = $this->rooms->entries()->create(['data' => ['title' => "E{$n}"]]);
            $entry->slugs()->create([
                'module_id' => $this->rooms->id,
                'language_code' => 'el',
                'slug' => "room-{$n}",
            ]);
            $entry->slugs()->create([
                'module_id' => $this->rooms->id,
                'language_code' => 'en',
                'slug' => "room-en-{$n}",
            ]);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        try
        {
            $entries = Entry::query()->where('module_id', $this->rooms->id)->withSlugs()->get();

            // Two languages per row, which is what a page with an hreflang
            // alternate actually asks for.
            $greek = $entries->map(fn(Entry $e) => $e->slugFor('el'));
            $english = $entries->map(fn(Entry $e) => $e->slugFor('en'));

            $queries = count(DB::getQueryLog());
        }
        finally
        {
            DB::disableQueryLog();
        }

        $this->assertCount(15, $greek->filter());
        $this->assertCount(15, $english->filter());

        // The entries and their slugs: two queries, whatever the row count.
        $this->assertLessThanOrEqual(
            2,
            $queries,
            "Reading fifteen entries and both of their slugs took {$queries} queries."
        );
    }

    public function test_slug_for_still_answers_on_a_model_loaded_without_them(): void
    {
        $entry = $this->rooms->entries()->create(['data' => ['title' => 'x']]);
        $entry->slugs()->create([
            'module_id' => $this->rooms->id,
            'language_code' => 'el',
            'slug' => 'thea',
        ]);

        // No eager load anywhere: the convenience has to keep working, it
        // just must not be the only way to use it.
        $this->assertSame('thea', Entry::query()->findOrFail($entry->id)->slugFor('el'));
        $this->assertNull(Entry::query()->findOrFail($entry->id)->slugFor('fr'));
    }
}
