<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Entries are owned only indirectly, through Entry -> Module -> User.
 * These tests pin down that an authenticated user can reach an Entry only
 * through a Module they own.
 */
class EntryAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function makeModule(User $owner, string $slug): Module
    {
        return Module::create([
            'user_id' => $owner->id,
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

    public function test_user_cannot_list_entries_of_another_users_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();
        $victimModule = $this->makeModule($victim, 'victim-module');

        $this->actingAs($attacker)
            ->getJson("/api/modules/{$victimModule->slug}/entries")
            ->assertForbidden();
    }

    public function test_user_cannot_read_an_entry_in_another_users_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();
        $victimModule = $this->makeModule($victim, 'victim-module');
        $victimEntry = $this->makeEntry($victimModule, 'Secret');

        $this->actingAs($attacker)
            ->getJson("/api/modules/{$victimModule->slug}/entries/{$victimEntry->id}")
            ->assertForbidden();
    }

    public function test_user_cannot_update_an_entry_in_another_users_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();
        $victimModule = $this->makeModule($victim, 'victim-module');
        $victimEntry = $this->makeEntry($victimModule, 'Secret');

        $this->actingAs($attacker)
            ->putJson(
                "/api/modules/{$victimModule->slug}/entries/{$victimEntry->id}",
                ['data' => ['title' => 'Defaced']]
            )
            ->assertForbidden();

        $this->assertSame('Secret', $victimEntry->fresh()->data['title']);
    }

    public function test_user_cannot_delete_an_entry_in_another_users_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();
        $victimModule = $this->makeModule($victim, 'victim-module');
        $victimEntry = $this->makeEntry($victimModule, 'Secret');

        $this->actingAs($attacker)
            ->deleteJson("/api/modules/{$victimModule->slug}/entries/{$victimEntry->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('entries', ['id' => $victimEntry->id]);
    }

    public function test_user_cannot_create_an_entry_in_another_users_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();
        $victimModule = $this->makeModule($victim, 'victim-module');

        $this->actingAs($attacker)
            ->postJson(
                "/api/modules/{$victimModule->slug}/entries",
                ['data' => ['title' => 'Injected']]
            )
            ->assertForbidden();

        $this->assertDatabaseCount('entries', 0);
    }

    /**
     * The original bug: show/update/destroy did Entry::findOrFail($id) and
     * ignored the module segment entirely, so passing your own module slug
     * with someone else's entry id returned their Entry.
     */
    public function test_entry_id_from_another_module_is_not_reachable_through_own_module(): void
    {
        $attacker = User::factory()->create();
        $victim = User::factory()->create();

        $attackerModule = $this->makeModule($attacker, 'attacker-module');
        $victimModule = $this->makeModule($victim, 'victim-module');
        $victimEntry = $this->makeEntry($victimModule, 'Secret');

        $this->actingAs($attacker)
            ->getJson("/api/modules/{$attackerModule->slug}/entries/{$victimEntry->id}")
            ->assertNotFound();
    }

    public function test_owner_can_fully_manage_entries_in_their_own_module(): void
    {
        $owner = User::factory()->create();
        $module = $this->makeModule($owner, 'own-module');

        $this->actingAs($owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['title' => 'Hello']])
            ->assertCreated();

        $entry = $module->entries()->sole();

        $this->actingAs($owner)
            ->getJson("/api/modules/{$module->slug}/entries/{$entry->id}")
            ->assertOk()
            ->assertJsonPath('data.title', 'Hello');

        $this->actingAs($owner)
            ->putJson("/api/modules/{$module->slug}/entries/{$entry->id}", ['data' => ['title' => 'Updated']])
            ->assertOk();

        $this->assertSame('Updated', $entry->fresh()->data['title']);

        $this->actingAs($owner)
            ->getJson("/api/modules/{$module->slug}/entries")
            ->assertOk()
            ->assertJsonPath('data.0.id', $entry->id);

        $this->actingAs($owner)
            ->deleteJson("/api/modules/{$module->slug}/entries/{$entry->id}")
            ->assertNoContent();

        $this->assertDatabaseCount('entries', 0);
    }

    public function test_entry_endpoints_require_authentication(): void
    {
        $victim = User::factory()->create();
        $module = $this->makeModule($victim, 'victim-module');

        $this->getJson("/api/modules/{$module->slug}/entries")
            ->assertUnauthorized();
    }

    /**
     * Without a JSON Accept header Laravel tries to redirect a guest to a
     * route named `login`, which this API-only app does not define - turning a
     * 401 into a 500. The React client always sends the header, so this only
     * showed up when opening an API URL in a browser or reaching for curl.
     */
    public function test_an_unauthenticated_request_is_401_even_without_a_json_header(): void
    {
        $victim = User::factory()->create();
        $module = $this->makeModule($victim, 'victim-module');

        $this->get("/api/modules/{$module->slug}/entries", ['Accept' => 'text/html'])
            ->assertUnauthorized();

        $this->get('/api/user', ['Accept' => 'text/html'])
            ->assertUnauthorized();
    }
}
