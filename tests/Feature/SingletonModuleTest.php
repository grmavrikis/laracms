<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "About" is one entry; "Blog" is many (TASKS.md #60).
 *
 * Without the distinction a client opening About finds a list and a "new
 * entry" button that must never be pressed - and if they press it, the site
 * has two About pages and no way to say which one is the About page.
 *
 * The flag is therefore **enforced on the server**, not merely used to hide a
 * button. That is #75's lesson: a rule the panel promises and the API does not
 * check is a rule that holds only for as long as nobody uses the API.
 */
class SingletonModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);

        $this->owner = User::factory()->create();
    }

    private function makeModule(string $slug, bool $singleton): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => ucfirst($slug),
            'slug' => $slug,
            'is_singleton' => $singleton,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);
    }

    private function addEntry(Module $module, string $title, ?string $slug = null)
    {
        return $this->actingAs($this->owner)->postJson(
            "/api/modules/{$module->slug}/entries",
            array_filter([
                'data' => ['title' => ['el' => $title]],
                'status' => Entry::STATUS_PUBLISHED,
                'slugs' => $slug ? ['el' => $slug] : null,
            ])
        );
    }

    // -------------------------------------------------------------- the flag

    public function test_a_module_is_a_collection_unless_it_says_otherwise(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Blog',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ])->assertCreated();

        $this->assertFalse($response->json('data.is_singleton'));
    }

    public function test_a_module_can_be_created_as_a_singleton(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'About',
            'is_singleton' => true,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ])->assertCreated();

        $this->assertTrue($response->json('data.is_singleton'));
        $this->assertTrue(Module::where('slug', 'about')->sole()->is_singleton);
    }

    public function test_the_flag_has_to_be_a_boolean(): void
    {
        $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'About',
            'is_singleton' => 'perhaps',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ])->assertStatus(422)->assertJsonValidationErrors('is_singleton');
    }

    public function test_the_listing_says_which_modules_are_singletons(): void
    {
        $this->makeModule('about', true);

        $this->actingAs($this->owner)
            ->getJson('/api/modules')
            ->assertOk()
            // The listing is a bare array; only `store` wraps its answer.
            ->assertJsonPath('0.is_singleton', true);
    }

    // ------------------------------------------------------ the server holds

    public function test_a_singleton_accepts_one_entry(): void
    {
        $module = $this->makeModule('about', true);

        $this->addEntry($module, 'Σχετικά')->assertCreated();
    }

    public function test_a_singleton_refuses_a_second_entry(): void
    {
        $module = $this->makeModule('about', true);

        $this->addEntry($module, 'Σχετικά')->assertCreated();

        $this->addEntry($module, 'Και άλλο')
            ->assertStatus(422)
            ->assertJsonValidationErrors('data');

        $this->assertSame(1, $module->entries()->count());
    }

    public function test_a_collection_still_takes_as_many_as_it_likes(): void
    {
        $module = $this->makeModule('blog', false);

        $this->addEntry($module, 'One')->assertCreated();
        $this->addEntry($module, 'Two')->assertCreated();

        $this->assertSame(2, $module->entries()->count());
    }

    /**
     * The one entry has to stay editable, or a singleton could be written once
     * and never corrected.
     */
    public function test_the_single_entry_can_still_be_updated(): void
    {
        $module = $this->makeModule('about', true);
        $this->addEntry($module, 'Σχετικά')->assertCreated();

        $entry = $module->entries()->sole();

        $this->actingAs($this->owner)->putJson(
            "/api/modules/{$module->slug}/entries/{$entry->id}",
            ['data' => ['title' => ['el' => 'Σχετικά με εμάς']]]
        )->assertOk();
    }

    public function test_deleting_the_entry_makes_room_for_another(): void
    {
        $module = $this->makeModule('about', true);
        $this->addEntry($module, 'Σχετικά')->assertCreated();

        $this->actingAs($this->owner)
            ->deleteJson("/api/modules/{$module->slug}/entries/{$module->entries()->sole()->id}")
            ->assertNoContent();

        $this->addEntry($module, 'Ξανά')->assertCreated();
    }

    // ------------------------------------------------------------- in public

    public function test_a_singleton_serves_its_entry_at_the_module_address(): void
    {
        $module = $this->makeModule('sxetika', true);
        $this->addEntry($module, 'Σχετικά με εμάς', 'sxetika-entry')->assertCreated();

        $response = $this->get('/el/sxetika')->assertOk();

        // Not merely "the title appears" - a one-item list would satisfy that.
        // The page has to *be* the entry: an article, and no link to a second
        // address for the same content.
        $response->assertSee('<article>', false);
        $response->assertSee('Σχετικά με εμάς', false);
        $response->assertDontSee(url('/el/sxetika/sxetika-entry'), false);
    }

    /**
     * One page, one address. The entry's own URL would be a second one for the
     * same content, so it redirects rather than serving it - a 404 would break
     * any link that already exists if a module is made a singleton later.
     */
    public function test_the_entry_address_redirects_to_the_module_address(): void
    {
        $module = $this->makeModule('sxetika', true);
        $this->addEntry($module, 'Σχετικά με εμάς', 'sxetika-entry')->assertCreated();

        $this->get('/el/sxetika/sxetika-entry')
            ->assertRedirect('/el/sxetika')
            ->assertStatus(301);
    }

    public function test_a_singleton_page_is_canonical_to_the_module_address(): void
    {
        $module = $this->makeModule('sxetika', true);
        $this->addEntry($module, 'Σχετικά με εμάς', 'sxetika-entry')->assertCreated();

        $this->get('/el/sxetika')
            ->assertOk()
            ->assertSee('<link rel="canonical" href="' . url('/el/sxetika') . '">', false);
    }

    public function test_an_empty_singleton_is_not_a_page(): void
    {
        $this->makeModule('sxetika', true);

        $this->get('/el/sxetika')->assertNotFound();
    }

    public function test_a_singleton_holding_only_a_draft_is_not_a_page(): void
    {
        $module = $this->makeModule('sxetika', true);

        $module->entries()->create([
            'data' => ['title' => ['el' => 'Κρυφό']],
            'status' => Entry::STATUS_DRAFT,
        ]);

        $this->get('/el/sxetika')->assertNotFound();
    }

    public function test_a_collection_still_lists(): void
    {
        $module = $this->makeModule('blog', false);
        $this->addEntry($module, 'Πρώτο', 'proto')->assertCreated();

        $this->get('/el/blog')
            ->assertOk()
            ->assertSee(url('/el/blog/proto'), false);
    }

    /**
     * A sitemap advertising an address that redirects wastes the crawl on a
     * hop, and tells a search engine the site has two pages where it has one.
     */
    public function test_the_sitemap_lists_a_singleton_once(): void
    {
        $module = $this->makeModule('sxetika', true);
        $this->addEntry($module, 'Σχετικά με εμάς', 'sxetika-entry')->assertCreated();

        $response = $this->get('/sitemap.xml')->assertOk();

        $response->assertSee(url('/el/sxetika'), false);
        $response->assertDontSee('sxetika-entry', false);
    }

    public function test_the_sitemap_still_lists_a_collection_entry_by_entry(): void
    {
        $module = $this->makeModule('blog', false);
        $this->addEntry($module, 'Πρώτο', 'proto')->assertCreated();

        $this->get('/sitemap.xml')
            ->assertOk()
            ->assertSee(url('/el/blog/proto'), false);
    }
}
