<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public side: Blade, served from this same application, with no API in
 * between (TASKS.md #59 and Decisions).
 *
 * A URL is `/{language}/{module}/{slug}`, always with the language prefix -
 * including the default one, so every page has exactly one address and the
 * hreflang set is symmetric.
 */
class PublicPageTest extends TestCase
{
    use RefreshDatabase;

    private Module $rooms;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);

        $this->rooms = Module::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [
                ['name' => 'title', 'type' => 'string', 'translatable' => true],
                ['name' => 'body', 'type' => 'text', 'translatable' => true],
            ],
        ]);
    }

    private function publish(array $slugs, array $data = [], string $status = Entry::STATUS_PUBLISHED): Entry
    {
        $entry = $this->rooms->entries()->create([
            'data' => $data ?: ['title' => ['el' => 'Θέα', 'en' => 'Sea view'], 'body' => []],
            'status' => $status,
            'published_at' => $status === Entry::STATUS_PUBLISHED ? now() : null,
        ]);

        foreach ($slugs as $language => $slug)
        {
            $entry->slugs()->create([
                'module_id' => $this->rooms->id,
                'language_code' => $language,
                'slug' => $slug,
            ]);
        }

        return $entry;
    }

    // ------------------------------------------------------------ the page

    public function test_a_published_entry_is_served_in_its_own_language(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);

        $this->get('/el/rooms/thea')->assertOk()->assertSee('Θέα', false);
        $this->get('/en/rooms/sea-view')->assertOk()->assertSee('Sea view');
    }

    public function test_a_draft_is_not_public(): void
    {
        $this->publish(['el' => 'thea'], status: Entry::STATUS_DRAFT);

        $this->get('/el/rooms/thea')->assertNotFound();
    }

    /**
     * The slug is per language, so one language's address must not resolve
     * under another's prefix - that would serve the same page at two URLs and
     * split its ranking.
     */
    public function test_a_slug_does_not_resolve_under_another_language(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);

        $this->get('/en/rooms/thea')->assertNotFound();
        $this->get('/el/rooms/sea-view')->assertNotFound();
    }

    public function test_an_unknown_language_is_not_a_page(): void
    {
        $this->publish(['el' => 'thea']);

        $this->get('/de/rooms/thea')->assertNotFound();
    }

    public function test_a_deactivated_language_stops_serving(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);

        Language::where('code', 'en')->update(['is_active' => false]);

        $this->get('/en/rooms/sea-view')->assertNotFound();
        $this->get('/el/rooms/thea')->assertOk();
    }

    public function test_an_unknown_module_is_not_a_page(): void
    {
        $this->get('/el/nothing/thea')->assertNotFound();
    }

    /**
     * Rich text is a document, and the renderer is the only thing that turns
     * it into HTML - a template must never be handed a string to echo raw.
     */
    public function test_rich_text_is_rendered_and_script_is_not(): void
    {
        $this->publish(['el' => 'thea'], [
            'title' => ['el' => 'Θέα', 'en' => 'Sea view'],
            'body' => ['el' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'content' => [['type' => 'text', 'text' => 'Καλημέρα <script>alert(1)</script>']],
                ]],
            ]],
        ]);

        $response = $this->get('/el/rooms/thea')->assertOk();

        $response->assertSee('<p>', false);
        $response->assertDontSee('<script>alert(1)</script>', false);
    }

    // ------------------------------------------------------------ hreflang

    public function test_a_page_declares_its_translations(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);

        $response = $this->get('/el/rooms/thea')->assertOk();

        $el = url('/el/rooms/thea');
        $en = url('/en/rooms/sea-view');

        $response->assertSee('<link rel="alternate" hreflang="el" href="' . $el . '">', false);
        $response->assertSee('<link rel="alternate" hreflang="en" href="' . $en . '">', false);
        $response->assertSee('hreflang="x-default" href="' . $el . '"', false);
    }

    /**
     * A language the entry has no slug in is not a translation of it, and
     * claiming otherwise points Google at a 404.
     */
    public function test_a_language_without_a_slug_is_not_declared(): void
    {
        $this->publish(['el' => 'thea']);

        $this->get('/el/rooms/thea')
            ->assertOk()
            ->assertDontSee('hreflang="en"', false);
    }

    // ------------------------------------------------------- module listing

    public function test_a_module_lists_its_published_entries_in_order(): void
    {
        $this->publish(['el' => 'proti'], ['title' => ['el' => 'Πρώτη'], 'body' => []])
            ->update(['sort_order' => 2]);
        $this->publish(['el' => 'defteri'], ['title' => ['el' => 'Δεύτερη'], 'body' => []])
            ->update(['sort_order' => 1]);
        $this->publish(['el' => 'kryfi'], ['title' => ['el' => 'Κρυφή'], 'body' => []], Entry::STATUS_DRAFT);

        $response = $this->get('/el/rooms')->assertOk();

        $response->assertDontSee('Κρυφή', false);
        $response->assertSeeInOrder(['Δεύτερη', 'Πρώτη'], false);
    }

    /**
     * An entry with no slug in this language has no address to be linked to,
     * so it cannot appear in that language's listing.
     */
    public function test_an_entry_without_a_slug_here_is_not_listed(): void
    {
        $this->publish(['en' => 'sea-view'], ['title' => ['el' => 'Θέα', 'en' => 'Sea view'], 'body' => []]);

        $this->get('/el/rooms')->assertOk()->assertDontSee('Θέα', false);
        $this->get('/en/rooms')->assertOk()->assertSee('Sea view');
    }

    // ---------------------------------------------------------------- home

    public function test_the_home_page_lists_the_modules(): void
    {
        $this->get('/el')->assertOk()->assertSee('Rooms');
    }

    public function test_the_root_goes_to_the_default_language(): void
    {
        $this->get('/')->assertRedirect('/el');
    }

    public function test_the_root_follows_the_default_language(): void
    {
        Language::where('code', 'el')->update(['is_default' => false]);
        Language::where('code', 'en')->update(['is_default' => true]);

        $this->get('/')->assertRedirect('/en');
    }

    // ------------------------------------------------------------- sitemap

    public function test_the_sitemap_lists_what_is_public_and_nothing_else(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);
        $this->publish(['el' => 'kryfi'], status: Entry::STATUS_DRAFT);

        $response = $this->get('/sitemap.xml')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/xml');

        $response->assertSee(url('/el/rooms/thea'), false);
        $response->assertSee(url('/en/rooms/sea-view'), false);
        $response->assertSee(url('/el/rooms'), false);
        $response->assertSee(url('/el'), false);
        $response->assertDontSee('kryfi', false);
    }

    public function test_the_sitemap_declares_the_translations_too(): void
    {
        $this->publish(['el' => 'thea', 'en' => 'sea-view']);

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee('rel="alternate" hreflang="en" href="' . url('/en/rooms/sea-view') . '"', false);
    }

    // ------------------------------------------------------ the stock view

    public function test_the_laravel_placeholder_is_gone(): void
    {
        $this->assertFileDoesNotExist(resource_path('views/welcome.blade.php'));
    }
}
