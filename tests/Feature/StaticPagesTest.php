<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use App\Services\StaticPages;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * The public site is **files on disk**, and the web server hands them over
 * before PHP starts (TASKS.md #97).
 *
 * The measurement that caused this: a cache *hit* through the real kernel
 * against the real `.env` cost **four queries** - a session read, two cache
 * reads and a session write. The test that said none ran under
 * `CACHE_STORE=array` and `SESSION_DRIVER=array`, which exist only in
 * `phpunit.xml`. #59 asked for finished HTML without a query, and this is that
 * sentence taken literally.
 *
 * **What these tests can and cannot prove.** They go through Laravel's kernel,
 * not through Apache, so a *hit* never happens here - by the time PHP runs,
 * the file has already been bypassed in production. What is pinned is
 * everything either side of that: the file is written, at an address built
 * from database rows, holding the finished page; a write removes exactly the
 * files it invalidates; the switch stops writing and empties the directory.
 * The Apache half is a deployment dependency and is checked by `pages:doctor`
 * against a running site, plus the rule's presence in `public/.htaccess`.
 */
class StaticPagesTest extends TestCase
{
    use RefreshDatabase;

    private string $directory;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        // Not `public/cache`: a test run must not leave files in the served
        // directory of the machine it runs on.
        $this->directory = storage_path('framework/testing/pages-' . getmypid());

        config(['site.pages' => $this->directory, 'site.page_cache' => true]);

        File::deleteDirectory($this->directory);

        $this->owner = User::factory()->create();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->directory);

        parent::tearDown();
    }

    // ------------------------------------------------------------- fixtures

    private function aModule(string $name = 'Rooms', string $slug = 'rooms'): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => $name,
            'slug' => $slug,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);
    }

    private function anEntry(Module $module, array $slugs = ['el' => 'thea']): Entry
    {
        $entry = $module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['el' => 'Θέα', 'en' => 'View']],
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

    private function file(string $page): string
    {
        return $this->directory . '/' . $page;
    }

    private function assertBaked(string $page, ?string $contains = null): void
    {
        $this->assertFileExists($this->file($page));

        if ($contains !== null)
        {
            $this->assertStringContainsString($contains, File::get($this->file($page)));
        }
    }

    // -------------------------------------------------------- what is baked

    public function test_a_visited_page_becomes_a_file(): void
    {
        $this->aModule();

        $this->get('/el')->assertOk();

        $this->assertBaked('el.html', '<!DOCTYPE html>');
    }

    /**
     * The address is composed from the language row, the module's slug and the
     * entry's slug - never from the request path. A request path is something
     * a visitor writes, and writing files inside `public/` from what a visitor
     * writes is how a crafted URL puts a file where it should not be.
     */
    public function test_the_address_is_built_from_the_rows_it_came_from(): void
    {
        $module = $this->aModule();
        $this->anEntry($module);

        $this->get('/el/rooms')->assertOk();
        $this->get('/el/rooms/thea')->assertOk();

        $this->assertBaked('el/rooms.html');
        $this->assertBaked('el/rooms/thea.html', 'Θέα');
    }

    /**
     * **A row cannot choose a path outside the directory**, and the dangerous
     * direction is *deleting*, not writing.
     *
     * Writing is protected twice over: every segment a page is baked under has
     * already been through a route pattern on the way in, because that is how
     * the row was found. Invalidation has no such protection - `forgetModule`
     * composes addresses straight from a slug column and hands them to
     * `File::delete`, so a row holding `../../something` would reach outside
     * the cache directory entirely. A slug like that is not hypothetical: the
     * development database of this project holds a module whose slug is
     * `τεστ κεις`, with a space in it.
     *
     * An unsafe address is refused rather than sanitised. Sanitising invents
     * a different address, which is a file this did not mean to touch.
     */
    public function test_an_address_from_a_bad_row_cannot_reach_outside_the_directory(): void
    {
        $module = $this->aModule();

        $this->get('/el')->assertOk();
        $this->assertBaked('el.html');

        // Stands in for anything else on the disk of the machine this runs on.
        $outside = dirname($this->directory) . '/zz-must-survive.html';
        File::put($outside, 'not ours to delete');

        $module->forceFill(['slug' => '../../zz-must-survive'])->saveQuietly();

        try
        {
            app(StaticPages::class)->forgetModule($module);

            $this->assertFileExists($outside, 'A slug column deleted a file outside the cache directory.');
        }
        finally
        {
            File::delete($outside);
        }
    }

    public function test_a_page_that_does_not_exist_is_never_written(): void
    {
        $this->aModule();

        $this->get('/el/rooms/nothing-here')->assertNotFound();

        $this->assertFileDoesNotExist($this->file('el/rooms/nothing-here.html'));
    }

    /**
     * A singleton's entry address answers a permanent redirect (#60), and a
     * redirect is not a document. Baking one would need a file that says "go
     * somewhere else", which is what the web server's own rules are for.
     */
    public function test_a_redirect_is_not_baked(): void
    {
        $module = $this->aModule('About', 'about');
        $module->forceFill(['is_singleton' => true])->saveQuietly();
        $this->anEntry($module, ['el' => 'peri']);

        $this->get('/el/about/peri')->assertRedirect();

        $this->assertFileDoesNotExist($this->file('el/about/peri.html'));
    }

    public function test_the_sitemap_is_baked_as_xml_rather_than_html(): void
    {
        $this->aModule();

        $this->get('/sitemap.xml')->assertOk();

        $this->assertBaked('sitemap.xml', '<urlset');
        $this->assertFileDoesNotExist($this->file('sitemap.xml.html'));
    }

    // ------------------------------------- what may never become a file

    /**
     * **A page carrying a CSRF token is never written**, whoever rendered it.
     *
     * A token belongs to one visitor's session and a file is handed to
     * everybody, so a baked one means 419 for every visitor after the first -
     * CHANGELOG §25, found by posting the live form. Since #97 it is a guard
     * rather than the normal case: the shipped theme's form carries no token,
     * and what is left for this to catch is a client route rendering its own
     * Blade form with `@csrf` (#61).
     *
     * **This nearly did not survive the rewrite.** `PageCache` was replaced by
     * `StaticPages` and the check went with it, silently, because the three
     * tests pinning it lived in the test file that was replaced too - the same
     * defect the review of the first half of #97 had just found and fixed.
     * Exercised through `write()` rather than through a route, because
     * producing a page that carries a token now means writing a whole client
     * theme, and the guard is about what is handed to the writer.
     */
    public function test_a_page_carrying_a_csrf_token_is_never_written(): void
    {
        app(StaticPages::class)->write(
            'el/probe.html',
            '<form><input type="hidden" name="_token" value="one-visitor"></form>'
        );

        $this->assertFileDoesNotExist($this->file('el/probe.html'), 'A page carrying a token was baked.');
    }

    /**
     * The meta tag too: a theme putting the token there for its own script has
     * the same problem as one putting it in a form.
     */
    public function test_a_page_carrying_a_csrf_meta_tag_is_never_written(): void
    {
        app(StaticPages::class)->write('el/probe.html', '<meta name="csrf-token" content="one-visitor">');

        $this->assertFileDoesNotExist($this->file('el/probe.html'));
    }

    /**
     * And the other half, so the guard cannot be made to refuse everything -
     * "write nothing, ever" would satisfy the two tests above.
     */
    public function test_a_page_carrying_no_token_is_written(): void
    {
        app(StaticPages::class)->write('el/probe.html', '<p>Nothing here belongs to anybody.</p>');

        $this->assertBaked('el/probe.html', 'belongs to anybody');
    }

    // ------------------------------------------------------ what is removed

    public function test_saving_an_entry_removes_its_own_page(): void
    {
        $module = $this->aModule();
        $entry = $this->anEntry($module);

        $this->get('/el/rooms/thea')->assertOk();
        $this->assertBaked('el/rooms/thea.html');

        $entry->touch();

        $this->assertFileDoesNotExist($this->file('el/rooms/thea.html'));
    }

    /**
     * The listing it appears in, and the home page that links to the listing,
     * go with it: a published entry changes all three.
     */
    public function test_saving_an_entry_removes_the_pages_that_list_it(): void
    {
        $module = $this->aModule();
        $entry = $this->anEntry($module);

        $this->get('/el')->assertOk();
        $this->get('/en')->assertOk();
        $this->get('/el/rooms')->assertOk();
        $this->get('/sitemap.xml')->assertOk();

        $entry->touch();

        $this->assertFileDoesNotExist($this->file('el/rooms.html'));
        $this->assertFileDoesNotExist($this->file('el.html'));
        $this->assertFileDoesNotExist($this->file('en.html'), 'Only one language was dropped.');
        $this->assertFileDoesNotExist($this->file('sitemap.xml'));
    }

    /**
     * **The case the version counter could not handle.** A renamed slug leaves
     * a file at the old address, and the row that would have told anybody it
     * was there has been overwritten. So it is removed *before* the write,
     * while the rows still hold the addresses the site is serving.
     */
    public function test_renaming_a_slug_removes_the_old_address(): void
    {
        $module = $this->aModule();
        $entry = $this->anEntry($module);

        $this->get('/el/rooms/thea')->assertOk();
        $this->assertBaked('el/rooms/thea.html');

        $this->actingAs($this->owner)->putJson("/api/modules/rooms/entries/{$entry->id}", [
            'data' => ['title' => ['el' => 'Θέα', 'en' => 'View']],
            'slugs' => ['el' => 'nea-thea'],
        ])->assertOk();

        $this->assertFileDoesNotExist(
            $this->file('el/rooms/thea.html'),
            'The old address is still on disk and still being served.'
        );
    }

    /**
     * A module rename moves every address underneath it, so there is nothing
     * finer to be precise about.
     */
    public function test_saving_a_module_empties_everything(): void
    {
        $module = $this->aModule();
        $this->anEntry($module);

        $this->get('/el/rooms/thea')->assertOk();
        $this->get('/en')->assertOk();

        $module->touch();

        $this->assertSame([], File::exists($this->directory) ? File::allFiles($this->directory) : []);
    }

    /**
     * **Not observed before #97**, and it had to be once pages became files.
     * A language switched on or off changes the hreflang set of every page,
     * and `PageCache` had a seven-day TTL underneath it that quietly cleaned
     * up after anything nobody thought to drop. A file has no such backstop.
     */
    public function test_changing_a_language_empties_everything(): void
    {
        $this->aModule();
        $this->get('/el')->assertOk();

        Language::where('code', 'en')->first()->update(['is_active' => false]);

        $this->assertFileDoesNotExist($this->file('el.html'), 'Every page still advertises a language that is gone.');
    }

    /**
     * The footer is on every page, so a settings save is a site-wide write.
     */
    public function test_saving_the_settings_empties_everything(): void
    {
        $this->aModule();
        $this->get('/el')->assertOk();

        app(\App\Services\SiteSettings::class)->save(['phone' => '1']);

        $this->assertFileDoesNotExist($this->file('el.html'));
    }

    public function test_deleting_an_entry_removes_its_page(): void
    {
        $module = $this->aModule();
        $entry = $this->anEntry($module);

        $this->get('/el/rooms/thea')->assertOk();

        $entry->delete();

        $this->assertFileDoesNotExist($this->file('el/rooms/thea.html'));
    }

    /**
     * A reorder writes one mass UPDATE, which fires no model events - the same
     * trap the observer has always had to work around.
     */
    public function test_reordering_removes_the_listing_it_reordered(): void
    {
        $module = $this->aModule();
        $first = $this->anEntry($module, ['el' => 'ena']);
        $second = $this->anEntry($module, ['el' => 'dyo']);

        $this->get('/el/rooms')->assertOk();
        $this->assertBaked('el/rooms.html');

        $this->actingAs($this->owner)->putJson('/api/modules/rooms/entries/order', [
            'ids' => [$second->id, $first->id],
        ])->assertNoContent();

        $this->assertFileDoesNotExist($this->file('el/rooms.html'));
    }

    // ------------------------------------------------------------ the switch

    /**
     * Off means **flush and stop writing**. An empty directory is what sends
     * every request to PHP, so the fast path needs to read no setting and run
     * no query to know the cache is off - there is nothing there to serve.
     */
    public function test_turning_the_cache_off_empties_it_and_stops_writing(): void
    {
        $this->aModule();

        $this->get('/el')->assertOk();
        $this->assertBaked('el.html');

        config(['site.page_cache' => false]);
        app(StaticPages::class)->flush();

        $this->get('/el')->assertOk();

        $this->assertFileDoesNotExist($this->file('el.html'));
    }

    public function test_the_page_is_still_served_with_the_cache_off(): void
    {
        config(['site.page_cache' => false]);

        $this->aModule('Rooms', 'rooms');

        $this->get('/el')->assertOk()->assertSee('Rooms', false);
    }

    /**
     * The owner's own switch, which is the one a client actually reaches
     * (#67). Saving it off also empties the directory, because the settings
     * row is observed - so "off" arrives complete rather than as "stop writing
     * and leave yesterday's pages there".
     */
    public function test_the_owner_can_turn_it_off_from_the_settings(): void
    {
        $this->aModule();
        $this->get('/el')->assertOk();
        $this->assertBaked('el.html');

        $this->actingAs($this->owner)->putJson('/api/settings', ['data' => ['page_cache' => false]])->assertOk();

        $this->assertFileDoesNotExist($this->file('el.html'), 'Turning it off left the old pages on disk.');

        $this->get('/el')->assertOk();

        $this->assertFileDoesNotExist($this->file('el.html'), 'It is off and still writing.');
    }

    // ---------------------------------------------------------- the commands

    public function test_flush_empties_the_directory(): void
    {
        $this->aModule();
        $this->get('/el')->assertOk();
        $this->assertBaked('el.html');

        $this->artisan('pages:flush')->assertSuccessful();

        $this->assertFileDoesNotExist($this->file('el.html'));
    }

    /**
     * Warming walks the sitemap, so every address the site advertises is on
     * disk before the first visitor - which after a deployment is often a
     * crawler rather than a person.
     */
    public function test_warm_bakes_every_page_the_sitemap_lists(): void
    {
        $module = $this->aModule();
        $this->anEntry($module, ['el' => 'thea', 'en' => 'view']);

        $this->artisan('pages:warm')->assertSuccessful();

        $this->assertBaked('el.html');
        $this->assertBaked('en.html');
        $this->assertBaked('el/rooms.html');
        $this->assertBaked('el/rooms/thea.html');
        $this->assertBaked('en/rooms/view.html');
        $this->assertBaked('sitemap.xml');
    }

    /**
     * Warming with the switch off would render the whole site and keep none of
     * it, then report success. Refusing is the honest answer.
     */
    public function test_warm_refuses_when_baking_is_off(): void
    {
        config(['site.page_cache' => false]);

        $this->artisan('pages:warm')->assertFailed();
    }

    // ------------------------------------------ the deployment dependency

    /**
     * **A missing rewrite does not break the site**, which is exactly the
     * problem: every page is served through PHP and it looks like nothing at
     * all. The rule is asserted here so that deleting it fails loudly, and
     * `pages:doctor` checks the same thing against a running server, where
     * nginx - which `.htaccess` cannot reach - is the case this cannot see.
     */
    public function test_the_web_server_is_told_to_serve_the_files(): void
    {
        $htaccess = File::get(public_path('.htaccess'));

        $this->assertStringContainsString('cache', $htaccess, 'The rewrite that serves baked pages is gone.');
        $this->assertMatchesRegularExpression(
            '/RewriteCond\s+%\{REQUEST_METHOD\}\s+=GET/',
            $htaccess,
            'Baked pages would be served for a POST as well.'
        );
    }
}
