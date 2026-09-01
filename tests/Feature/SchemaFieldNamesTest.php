<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A field's name is the key its value is stored under in `Entry.data`, so two
 * fields sharing one are two fields fighting over the same value.
 *
 * Nothing rejected that. The rules of the later field replaced the earlier
 * one's for `data.{name}`, while any sub-rules the earlier one had added -
 * a gallery's `data.{name}.*.url`, for instance - stayed behind. The result
 * was a value required to be both a string and a list of image objects, so no
 * entry could ever be saved, and nothing said why.
 */
class SchemaFieldNamesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    public function test_two_fields_cannot_share_a_name(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Rooms',
                'schema' => [
                    ['name' => 'title', 'type' => 'string', 'translatable' => false],
                    ['name' => 'title', 'type' => 'integer', 'translatable' => false],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema');
    }

    /**
     * The combination that made it worst: the gallery's sub-rules survive the
     * later field replacing `data.photos`, so the value has to be a string and
     * a list of objects at once.
     */
    public function test_a_repeated_name_across_different_types_is_refused(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Rooms',
                'schema' => [
                    ['name' => 'photos', 'type' => 'gallery', 'translatable' => false],
                    ['name' => 'photos', 'type' => 'string', 'translatable' => false],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema');
    }

    public function test_distinct_names_are_still_fine(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Rooms',
                'schema' => [
                    ['name' => 'title', 'type' => 'string', 'translatable' => true],
                    ['name' => 'photos', 'type' => 'gallery', 'translatable' => false],
                ],
            ])
            ->assertCreated();
    }

    /**
     * A schema written straight to the database bypasses the API, so the check
     * has to sit where entry validation passes through too - otherwise the
     * contradiction shows up as an unsatisfiable rule set instead of a reason.
     */
    public function test_an_entry_against_a_duplicated_schema_says_why(): void
    {
        $module = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [
                ['name' => 'photos', 'type' => 'gallery', 'translatable' => false],
                ['name' => 'photos', 'type' => 'string', 'translatable' => false],
            ],
        ]);

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['photos' => 'anything'],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data');
    }
}
