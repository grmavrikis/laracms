<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What can be reached, and by whom.
 *
 * This file used to pin the opposite model: an Entry was reachable only
 * through a Module the user owned, and a second account was an attacker. That
 * was correct while the product might have been multi-tenant. It is not.
 *
 * One installation serves one site (docs/TASKS.md -> Decisions). Its users are
 * colleagues, not tenants: they share one content space, and the modules are
 * created by the master admin, so ownership cannot distinguish them. Two
 * boundaries remain and both are tested below:
 *
 *   - signing in, which separates the installation from the public;
 *   - the scoped route binding, which separates one Module's Entries from
 *     another's. With ownership gone, this is the only structural check left
 *     on which Entry a request can address, so it matters more than before.
 */
class EntryAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function makeModule(User $creator, string $slug): Module
    {
        return Module::create([
            'user_id' => $creator->id,
            'name' => ucfirst($slug),
            'slug' => $slug,
            'schema' => [
                ['name' => 'title', 'type' => 'string', 'translatable' => false],
            ],
        ]);
    }

    private function makeEntry(Module $module, string $title): Entry
    {
        return $module->entries()->create(['data' => ['title' => $title]]);
    }

    public function test_a_colleague_can_list_entries_in_a_module_somebody_else_created(): void
    {
        $master = User::factory()->create();
        $staff = User::factory()->create();
        $module = $this->makeModule($master, 'rooms');
        $entry = $this->makeEntry($module, 'Sea view');

        $this->actingAs($staff)
            ->getJson("/api/modules/{$module->slug}/entries")
            ->assertOk()
            ->assertJsonPath('data.0.id', $entry->id);
    }

    public function test_a_colleague_can_read_an_entry(): void
    {
        $master = User::factory()->create();
        $staff = User::factory()->create();
        $module = $this->makeModule($master, 'rooms');
        $entry = $this->makeEntry($module, 'Sea view');

        $this->actingAs($staff)
            ->getJson("/api/modules/{$module->slug}/entries/{$entry->id}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Sea view');
    }

    public function test_a_colleague_can_create_update_and_delete_entries(): void
    {
        $master = User::factory()->create();
        $staff = User::factory()->create();
        $module = $this->makeModule($master, 'rooms');

        $this->actingAs($staff)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['title' => 'Sea view']])
            ->assertCreated();

        $entry = $module->entries()->sole();

        $this->actingAs($staff)
            ->putJson("/api/modules/{$module->slug}/entries/{$entry->id}", ['data' => ['title' => 'Garden view']])
            ->assertOk();

        $this->assertSame('Garden view', $entry->fresh()->data['title']);

        $this->actingAs($staff)
            ->deleteJson("/api/modules/{$module->slug}/entries/{$entry->id}")
            ->assertNoContent();

        $this->assertDatabaseCount('entries', 0);
    }

    /**
     * The original bug: show/update/destroy did Entry::findOrFail($id) and
     * ignored the module segment entirely, so passing one module slug with an
     * Entry id belonging to another returned that other Entry.
     *
     * Scoped route binding fixed it, and this is now the only structural limit
     * on which Entry a request can name - ownership no longer backs it up.
     */
    public function test_an_entry_id_from_another_module_is_not_reachable_through_this_one(): void
    {
        $user = User::factory()->create();

        $rooms = $this->makeModule($user, 'rooms');
        $articles = $this->makeModule($user, 'articles');
        $article = $this->makeEntry($articles, 'Secret');

        $this->actingAs($user)
            ->getJson("/api/modules/{$rooms->slug}/entries/{$article->id}")
            ->assertNotFound();

        $this->actingAs($user)
            ->putJson("/api/modules/{$rooms->slug}/entries/{$article->id}", ['data' => ['title' => 'Defaced']])
            ->assertNotFound();

        $this->actingAs($user)
            ->deleteJson("/api/modules/{$rooms->slug}/entries/{$article->id}")
            ->assertNotFound();

        $this->assertSame('Secret', $article->fresh()->data['title']);
    }

    public function test_entry_endpoints_require_authentication(): void
    {
        $module = $this->makeModule(User::factory()->create(), 'rooms');
        $entry = $this->makeEntry($module, 'Sea view');

        $this->getJson("/api/modules/{$module->slug}/entries")->assertUnauthorized();
        $this->getJson("/api/modules/{$module->slug}/entries/{$entry->id}")->assertUnauthorized();
        $this->postJson("/api/modules/{$module->slug}/entries", ['data' => []])->assertUnauthorized();
        $this->putJson("/api/modules/{$module->slug}/entries/{$entry->id}", ['data' => []])->assertUnauthorized();
        $this->deleteJson("/api/modules/{$module->slug}/entries/{$entry->id}")->assertUnauthorized();

        $this->assertDatabaseCount('entries', 1);
    }

    /**
     * Without a JSON Accept header Laravel tries to redirect a guest to a
     * route named `login`, which this API-only app does not define - turning a
     * 401 into a 500. The React client always sends the header, so this only
     * showed up when opening an API URL in a browser or reaching for curl.
     */
    public function test_an_unauthenticated_request_is_401_even_without_a_json_header(): void
    {
        $module = $this->makeModule(User::factory()->create(), 'rooms');

        $this->get("/api/modules/{$module->slug}/entries", ['Accept' => 'text/html'])
            ->assertUnauthorized();

        $this->get('/api/user', ['Accept' => 'text/html'])
            ->assertUnauthorized();
    }
}
