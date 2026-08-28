<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The slug is the Module's route key, so it has to be unique and non-empty.
 *
 * A slug the client supplies is validated for uniqueness like any other input.
 * A slug the server derives from the name never went through that validation,
 * which is what this covers.
 */
class ModuleSlugTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    private function payload(string $name, ?string $slug = null): array
    {
        $payload = [
            'name' => $name,
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ];

        if ($slug !== null)
        {
            $payload['slug'] = $slug;
        }

        return $payload;
    }

    public function test_a_generated_slug_does_not_collide_with_an_existing_one(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('Products'))
            ->assertCreated();

        // Same name again, still without a slug: the client asked the server to
        // pick one, so it must pick a free one rather than crash on the unique
        // index.
        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('Products'))
            ->assertCreated();

        $this->assertSame(
            ['products', 'products-2'],
            Module::orderBy('id')->pluck('slug')->all()
        );
    }

    public function test_generated_slugs_keep_counting_past_the_second_collision(): void
    {
        foreach (range(1, 3) as $ignored)
        {
            $this->actingAs($this->owner)
                ->postJson('/api/modules', $this->payload('Products'))
                ->assertCreated();
        }

        $this->assertSame(
            ['products', 'products-2', 'products-3'],
            Module::orderBy('id')->pluck('slug')->all()
        );
    }

    /**
     * An explicitly requested slug is a different case: the client asked for
     * that exact value, so a collision is an error rather than something to
     * silently rename.
     */
    public function test_an_explicit_duplicate_slug_is_rejected(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('Products', 'products'))
            ->assertCreated();

        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('Other', 'products'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('slug');

        $this->assertDatabaseCount('modules', 1);
    }

    public function test_a_name_that_slugifies_to_nothing_still_gets_a_usable_slug(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('???'))
            ->assertCreated();

        $slug = Module::sole()->slug;

        // An empty slug would make the module unreachable, since the slug is
        // the route key.
        $this->assertNotSame('', $slug);
        $this->assertSame($slug, trim($slug));
    }

    public function test_a_greek_name_is_transliterated_by_the_backend(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', $this->payload('Εστιατόρια'))
            ->assertCreated();

        $this->assertSame('estiatoria', Module::sole()->slug);
    }
}
