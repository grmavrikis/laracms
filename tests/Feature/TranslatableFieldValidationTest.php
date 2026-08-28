<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A translatable field stores a map of language code to value, so it produces
 * two levels of rules: the map itself and each value inside it. Only the inner
 * level was ever built from the field's own `validation` string - the outer one
 * was hardcoded as required, which made every translatable field mandatory no
 * matter how it was configured.
 */
class TranslatableFieldValidationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    /**
     * `title` is a plain field kept in every payload: `data` itself carries a
     * `required` rule, and Laravel treats an empty array as absent, so a
     * payload with nothing in it would fail for an unrelated reason.
     */
    private function moduleWithSubtitle(string $validation): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [
                ['name' => 'title', 'type' => 'string', 'translatable' => false],
                [
                    'name' => 'subtitle',
                    'type' => 'string',
                    'translatable' => true,
                    'validation' => $validation,
                ],
            ],
        ]);
    }

    public function test_an_optional_translatable_field_may_be_omitted(): void
    {
        $module = $this->moduleWithSubtitle('');

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['title' => 'Hello']])
            ->assertCreated();
    }

    public function test_an_optional_translatable_field_may_be_null(): void
    {
        $module = $this->moduleWithSubtitle('');

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['title' => 'Hello', 'subtitle' => null],
            ])
            ->assertCreated();
    }

    public function test_a_required_translatable_field_must_still_be_present(): void
    {
        $module = $this->moduleWithSubtitle('required');

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => ['title' => 'Hello']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.subtitle');
    }

    public function test_rules_for_each_language_still_apply(): void
    {
        $module = $this->moduleWithSubtitle('required|max:5');

        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => [
                    'title' => 'Hello',
                    'subtitle' => ['en' => 'fine', 'el' => 'far too long'],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.subtitle.el');
    }

    public function test_an_optional_translatable_field_is_nullable_at_both_levels(): void
    {
        $rules = SchemaRuleBuilder::build([
            ['name' => 'subtitle', 'type' => 'string', 'translatable' => true],
        ]);

        $this->assertSame(['nullable', 'array'], $rules['data.subtitle']);
        $this->assertContains('nullable', $rules['data.subtitle.*']);
    }

    public function test_a_required_translatable_field_is_required_at_both_levels(): void
    {
        $rules = SchemaRuleBuilder::build([
            ['name' => 'subtitle', 'type' => 'string', 'translatable' => true, 'validation' => 'required'],
        ]);

        $this->assertSame(['required', 'array'], $rules['data.subtitle']);
        $this->assertContains('required', $rules['data.subtitle.*']);
    }
}
