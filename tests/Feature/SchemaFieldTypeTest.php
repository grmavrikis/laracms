<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Module schema drives entry validation, so the set of field types has to
 * mean the same thing everywhere. A type the rule builder does not recognise
 * must fail loudly instead of quietly validating as a string.
 */
class SchemaFieldTypeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    private function moduleWith(array $field): Module
    {
        // Created directly, bypassing the controller, so a schema can be given
        // a type the API would reject.
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [$field + ['translatable' => false]],
        ]);
    }

    public function test_datetime_is_validated_as_a_date(): void
    {
        $module = $this->moduleWith(['name' => 'published_at', 'type' => 'datetime']);

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['published_at' => 'definitely-not-a-date'],
            ])
            ->assertStatus(422);
    }

    /**
     * A field with no `type` at all used to resolve to 'string' and never
     * reach the throw, so the silent fallback that this whole item removed
     * survived for the one case the API cannot catch: the API requires
     * `schema.*.type`, but the seeder writes schemas with DB::table and a
     * schema can be edited straight in the database.
     */
    public function test_a_field_with_no_type_fails_loudly(): void
    {
        $module = $this->moduleWith(['name' => 'mystery']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['mystery' => 'anything at all'],
            ]);

        $response->assertStatus(422);

        // Naming the field is the difference between a usable error and the
        // silence it replaced.
        $this->assertStringContainsString('mystery', $response->getContent());
        $this->assertDatabaseCount('entries', 0);
    }

    public function test_a_null_type_fails_loudly(): void
    {
        $module = $this->moduleWith(['name' => 'mystery', 'type' => null]);

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['mystery' => 'x']])
            ->assertStatus(422);
    }

    public function test_unknown_field_type_fails_loudly(): void
    {
        $module = $this->moduleWith(['name' => 'mystery', 'type' => 'bogus']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['mystery' => 'anything at all'],
            ]);

        $response->assertStatus(422);

        // The message has to name the offending type, otherwise a schema typo
        // is just as opaque as the silent fallback it replaced.
        $this->assertStringContainsString('bogus', $response->getContent());
        $this->assertDatabaseCount('entries', 0);
    }

    /**
     * `richtext` and `textarea` stopped being creatable when they were
     * collapsed into `text`, but a schema written before that may still
     * declare one. Such a module must keep working - it only ever meant
     * `text` - even though it can no longer be chosen.
     *
     * @param string $legacyType
     */
    #[DataProvider('legacyRichTextTypeProvider')]
    public function test_a_legacy_rich_text_type_still_accepts_entries(string $legacyType): void
    {
        $module = $this->moduleWith(['name' => 'body', 'type' => $legacyType]);

        $document = [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'content' => [['type' => 'text', 'text' => 'legacy content']],
            ]],
        ];

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['body' => $document]])
            ->assertCreated();

        $stored = $module->entries()->sole()->data['body'];

        // Treated as a document, not coerced to a string.
        $this->assertSame('doc', $stored['type']);
        $this->assertSame('legacy content', $stored['content'][0]['content'][0]['text']);
    }

    /**
     * Recognising them for reading must not make them selectable again.
     *
     * @param string $legacyType
     */
    #[DataProvider('legacyRichTextTypeProvider')]
    public function test_a_legacy_rich_text_type_cannot_be_created(string $legacyType): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Legacy',
                'schema' => [['name' => 'body', 'type' => $legacyType, 'translatable' => false]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema.0.type');
    }

    public static function legacyRichTextTypeProvider(): array
    {
        return [
            'richtext' => ['richtext'],
            'textarea' => ['textarea'],
        ];
    }

    public function test_module_creation_rejects_an_unsupported_type(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Broken',
                'schema' => [['name' => 'x', 'type' => 'bogus', 'translatable' => false]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema.0.type');
    }

    /**
     * Pins the API's accepted types to the rule builder's supported types, so
     * the two lists cannot drift apart again.
     */
    public function test_every_supported_type_can_be_created_and_used(): void
    {
        $schema = [];

        foreach (SchemaRuleBuilder::SUPPORTED_TYPES as $index => $type)
        {
            $field = [
                'name' => 'field_' . $index,
                'type' => $type,
                'translatable' => false,
            ];

            if ($type === 'select')
            {
                $field['options'] = ['one', 'two'];
            }

            $schema[] = $field;
        }

        $this->actingAs($this->owner)
            ->postJson('/api/modules', ['name' => 'Everything', 'schema' => $schema])
            ->assertCreated();

        // Building rules for that schema must not throw for any type.
        $rules = SchemaRuleBuilder::build($schema);

        foreach ($schema as $field)
        {
            $this->assertArrayHasKey("data.{$field['name']}", $rules);
        }
    }
}
