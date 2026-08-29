<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A schema field may only carry keys the CMS knows.
 *
 * Laravel validates the keys it is told about and ignores the rest, so
 * `requred: true` was accepted, stored, and did nothing - the field stayed
 * optional and nobody was told why. That is the same silent acceptance removed
 * from field types in #5 and #25, one level up.
 */
class SchemaFieldKeysTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private int $counter = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    private function createWith(array ...$fields)
    {
        $this->counter++;

        return $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Posts ' . $this->counter,
            'schema' => $fields,
        ]);
    }

    public function test_a_misspelled_key_is_rejected(): void
    {
        $response = $this->createWith([
            'name' => 'title',
            'type' => 'string',
            'translatable' => false,
            'requred' => true,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('schema.0');

        // Naming the key is the point: the whole failure was that a typo said
        // nothing at all.
        $this->assertStringContainsString('requred', $response->getContent());
        $this->assertDatabaseCount('modules', 0);
    }

    public function test_every_unknown_key_is_reported_not_just_the_first(): void
    {
        $response = $this->createWith([
            'name' => 'title',
            'type' => 'string',
            'translatable' => false,
            'requred' => true,
            'lable' => 'Title',
        ]);

        $response->assertStatus(422);
        $this->assertStringContainsString('requred', $response->getContent());
        $this->assertStringContainsString('lable', $response->getContent());
    }

    public function test_the_error_points_at_the_offending_field(): void
    {
        $this->createWith(
            ['name' => 'fine', 'type' => 'string', 'translatable' => false],
            ['name' => 'broken', 'type' => 'string', 'translatable' => false, 'nonsense' => 1],
        )->assertStatus(422)->assertJsonValidationErrors('schema.1');
    }

    public function test_a_minimal_field_is_accepted(): void
    {
        // Everything but name/type/translatable is optional, and the form omits
        // `options` entirely for a non-select field.
        $this->createWith(['name' => 'title', 'type' => 'string', 'translatable' => false])
            ->assertCreated();
    }

    /**
     * The exact shape ModuleBuilder posts, so strictness cannot break the one
     * client there is.
     */
    public function test_the_full_set_of_known_keys_is_accepted(): void
    {
        $this->createWith([
            'name' => 'status',
            'type' => 'select',
            'translatable' => false,
            'required' => true,
            'validation' => 'max:20',
            'options' => ['draft', 'published'],
        ])->assertCreated();

        $this->assertSame('status', Module::sole()->schema[0]['name']);
    }
}
