<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * This installation serves one site (docs/TASKS.md -> Decisions).
 *
 * Modules are created only by the master admin, so `Module.user_id` cannot
 * tell two users apart - it records who wrote the row and nothing more. The
 * client's own staff share one content space, which means the listing must
 * show every module to every signed-in user.
 *
 * `ModuleController::index` filtered by `user_id`, so the second account the
 * client was given would have opened the panel and seen nothing at all. It
 * was invisible only because there had never been a second account.
 */
class ModuleAccessTest extends TestCase
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

    public function test_a_user_sees_modules_created_by_somebody_else(): void
    {
        $master = User::factory()->create();
        $staff = User::factory()->create();

        $this->makeModule($master, 'rooms');

        $this->actingAs($staff)
            ->getJson('/api/modules')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.slug', 'rooms');
    }

    public function test_every_module_in_the_installation_is_listed(): void
    {
        $master = User::factory()->create();
        $staff = User::factory()->create();

        $this->makeModule($master, 'rooms');
        $this->makeModule($master, 'articles');
        $this->makeModule($staff, 'gallery');

        // Asserted in the order the endpoint returns them, not sorted: the
        // listing is `latest()->orderByDesc('id')`, and sorting here would
        // discard the tie-break. Rows created inside one test share a
        // `created_at` to the second, so the id is what decides - which is the
        // case the tie-break exists for.
        $slugs = $this->actingAs($staff)
            ->getJson('/api/modules')
            ->assertOk()
            ->json('*.slug');

        $this->assertSame(['gallery', 'articles', 'rooms'], $slugs);
    }

    /**
     * Sharing content is not the same as sharing it with the public. Signing
     * in is still the boundary, and it is the only one left.
     */
    public function test_the_listing_still_requires_authentication(): void
    {
        $this->makeModule(User::factory()->create(), 'rooms');

        $this->getJson('/api/modules')->assertUnauthorized();
    }
}
