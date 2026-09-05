<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\PageCache;
use RuntimeException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A visitor is served finished HTML without a query, and publishing is what
 * puts a new version in front of them (TASKS.md #59).
 *
 * Every test here changes the database **behind the model's back** to prove
 * the page really is cached, then goes through the real write path to prove
 * the cache is dropped. A test that only checked "the page shows the new
 * value" would pass with no cache at all.
 */
class PageCacheTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Module $rooms;
    private Entry $entry;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);

        $this->owner = User::factory()->create();
        $this->rooms = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);

        $this->entry = $this->makeEntry('Πρώτο', 'proto');
    }

    private function makeEntry(string $title, string $slug): Entry
    {
        $entry = $this->rooms->entries()->create([
            'data' => ['title' => ['el' => $title]],
            'status' => Entry::STATUS_PUBLISHED,
            'published_at' => now(),
        ]);

        $entry->slugs()->create([
            'module_id' => $this->rooms->id,
            'language_code' => 'el',
            'slug' => $slug,
        ]);

        return $entry;
    }

    /** Straight to the table, so nothing observes it. */
    private function rewriteBehindTheModel(Entry $entry, string $title): void
    {
        DB::table('entries')
            ->where('id', $entry->id)
            ->update(['data' => json_encode(['title' => ['el' => $title]])]);
    }

    public function test_a_page_is_served_from_cache(): void
    {
        $this->get('/el/rooms/proto')->assertOk()->assertSee('Πρώτο', false);

        $this->rewriteBehindTheModel($this->entry, 'Αλλαγμένο');

        $this->get('/el/rooms/proto')
            ->assertOk()
            ->assertSee('Πρώτο', false)
            ->assertDontSee('Αλλαγμένο', false);
    }

    public function test_saving_an_entry_drops_its_page(): void
    {
        $this->get('/el/rooms/proto')->assertOk()->assertSee('Πρώτο', false);

        $this->rewriteBehindTheModel($this->entry, 'Αλλαγμένο');
        $this->entry->fresh()->save();

        $this->get('/el/rooms/proto')->assertOk()->assertSee('Αλλαγμένο', false);
    }

    public function test_publishing_through_the_api_drops_the_page(): void
    {
        $draft = $this->rooms->entries()->create([
            'data' => ['title' => ['el' => 'Κρυφό']],
            'status' => Entry::STATUS_DRAFT,
        ]);
        $draft->slugs()->create([
            'module_id' => $this->rooms->id,
            'language_code' => 'el',
            'slug' => 'kryfo',
        ]);

        $this->get('/el/rooms/kryfo')->assertNotFound();
        $this->get('/el/rooms')->assertOk()->assertDontSee('Κρυφό', false);

        $this->actingAs($this->owner)->putJson(
            "/api/modules/{$this->rooms->slug}/entries/{$draft->id}",
            ['data' => ['title' => ['el' => 'Κρυφό']], 'status' => Entry::STATUS_PUBLISHED]
        )->assertOk();

        $this->get('/el/rooms/kryfo')->assertOk();
        $this->get('/el/rooms')->assertOk()->assertSee('Κρυφό', false);
    }

    public function test_deleting_an_entry_drops_its_page(): void
    {
        $this->get('/el/rooms/proto')->assertOk();

        $this->actingAs($this->owner)
            ->deleteJson("/api/modules/{$this->rooms->slug}/entries/{$this->entry->id}")
            ->assertNoContent();

        $this->get('/el/rooms/proto')->assertNotFound();
    }

    /**
     * Reordering writes with one mass UPDATE, which fires **no model events**
     * - so the observer that drops the cache never runs and the endpoint has
     * to say so itself. Without this the listing kept its old order until the
     * cache expired.
     */
    public function test_reordering_drops_the_listing(): void
    {
        $second = $this->makeEntry('Δεύτερο', 'deftero');

        $this->get('/el/rooms')->assertOk()->assertSeeInOrder(['Δεύτερο', 'Πρώτο'], false);

        $this->actingAs($this->owner)->putJson(
            "/api/modules/{$this->rooms->slug}/entries/order",
            ['ids' => [$this->entry->id, $second->id]]
        )->assertNoContent();

        $this->get('/el/rooms')->assertOk()->assertSeeInOrder(['Πρώτο', 'Δεύτερο'], false);
    }

    /**
     * A renamed slug is the case key-based invalidation cannot handle: the old
     * URL is not computable afterwards, because the row that held it is gone.
     */
    public function test_renaming_a_slug_retires_the_old_address(): void
    {
        $this->get('/el/rooms/proto')->assertOk();

        $this->actingAs($this->owner)->putJson(
            "/api/modules/{$this->rooms->slug}/entries/{$this->entry->id}",
            ['data' => ['title' => ['el' => 'Πρώτο']], 'slugs' => ['el' => 'proto-neo']]
        )->assertOk();

        $this->get('/el/rooms/proto')->assertNotFound();
        $this->get('/el/rooms/proto-neo')->assertOk();
    }

    public function test_the_sitemap_is_cached_and_dropped_on_a_write(): void
    {
        $this->get('/sitemap.xml')->assertOk()->assertDontSee('deftero', false);

        $this->makeEntry('Δεύτερο', 'deftero');

        $this->get('/sitemap.xml')->assertOk()->assertSee('deftero', false);
    }

    public function test_a_new_module_shows_on_the_home_page(): void
    {
        $this->get('/el')->assertOk()->assertDontSee('Facilities', false);

        Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Facilities',
            'slug' => 'facilities',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ]);

        $this->get('/el')->assertOk()->assertSee('Facilities', false);
    }

    /**
     * #59 asks for finished HTML "without a query", which is stronger than
     * "cached": the first version of this looked the entry up and *then*
     * cached the render, so a hit still cost three indexed queries.
     */
    public function test_a_cache_hit_touches_the_database_not_at_all(): void
    {
        $this->get('/el/rooms/proto')->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();

        try
        {
            $this->get('/el/rooms/proto')->assertOk()->assertSee('Πρώτο', false);
            $queries = DB::getQueryLog();
        }
        finally
        {
            DB::disableQueryLog();
        }

        $this->assertSame(
            [],
            array_column($queries, 'query'),
            'A cached page resolved the language, the module or the entry.'
        );
    }

    /**
     * The counterpart: a miss does the work rather than serving nothing.
     */
    public function test_a_miss_still_builds_the_page(): void
    {
        $this->get('/el/rooms/proto')->assertOk()->assertSee('Πρώτο', false);
    }

    /**
     * A URL nobody has published must not be able to fill the cache - a
     * crawler walking made-up addresses would otherwise grow it without limit.
     */
    public function test_a_missing_page_is_not_cached(): void
    {
        $this->get('/el/rooms/oute-pou-yparxei')->assertNotFound();

        $this->makeEntry('Νέο', 'oute-pou-yparxei');

        $this->get('/el/rooms/oute-pou-yparxei')->assertOk()->assertSee('Νέο', false);
    }

    // ---------------------------------------------- what an old cache holds

    /**
     * `remember()` once answered with the page's HTML and now answers with
     * what the page *is* - `['html' => ...]` or `['redirect' => ...]`. The
     * version counter does not move on a deploy, only on a write, so entries
     * written by the previous shape are still sitting under their old keys.
     *
     * Reading one back through the new signature is a TypeError, which would
     * 500 **every warm page on the site** until somebody published something
     * or the seven-day TTL ran out.
     */
    public function test_a_page_cached_by_an_older_format_is_ignored(): void
    {
        // Exactly what the previous version wrote: a bare string, under the
        // key that version built. The counter is read rather than assumed -
        // setUp has already moved it, and hardcoding 1 made this pass without
        // ever reaching the stale entry.
        $version = app(PageCache::class)->version();

        Cache::put("page:{$version}:home:el", '<html>stale</html>', 600);

        $this->get('/el')
            ->assertOk()
            ->assertDontSee('stale', false)
            ->assertSee('Rooms', false);
    }

    /**
     * A shape the code does not recognise has to fail loudly. Serving an empty
     * 200 would keep monitoring green, cache the blank, and let it be indexed.
     */
    public function test_an_unrecognised_cached_shape_is_not_served_as_an_empty_page(): void
    {
        $this->get('/el/rooms/proto')->assertOk();

        // Reach into the key the current format uses and corrupt it.
        $version = app(PageCache::class)->version();
        Cache::put("page.v2:{$version}:entry:el:rooms:proto", ['nonsense' => true], 600);

        // The **type** is asserted, not the status. Falling through to
        // `$page['html']` also fails here, but only because PHPUnit turns the
        // "undefined array key" warning into an exception - in production that
        // warning is not fatal and the visitor gets an empty 200. Naming the
        // exception is what tells the two apart.
        $this->withoutExceptionHandling();

        $this->expectException(RuntimeException::class);

        $this->get('/el/rooms/proto');
    }
}
