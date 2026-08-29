<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The free-text `validation` box is merged straight into the rules the field's
 * `type` produces, with nothing checking that the two can coexist.
 *
 * Two ways that goes wrong. A rule can contradict the type outright - a `text`
 * field validates as an array, so adding `string` is a rule no value can ever
 * satisfy. Or it can quietly mean something else: `max:255` on a document
 * counts nodes rather than characters, so a field that looks limited to 255
 * characters is not.
 */
class SchemaValidationRulesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    private int $counter = 0;

    /**
     * Each module gets its own name so a duplicate slug can never be mistaken
     * for a rejected validation rule.
     */
    private function createModule(string $type, string $validation)
    {
        $this->counter++;

        return $this->actingAs($this->owner)->postJson('/api/modules', [
            'name' => 'Posts ' . $this->counter,
            'schema' => [[
                'name' => 'body',
                'type' => $type,
                'translatable' => false,
                'validation' => $validation,
            ]],
        ]);
    }

    public function test_a_rule_that_contradicts_a_rich_text_type_is_rejected(): void
    {
        // ['array', 'string'] - nothing can satisfy both.
        $response = $this->createModule('text', 'string');

        $response->assertStatus(422);
        $this->assertStringContainsString('body', $response->getContent());
    }

    public function test_a_rule_that_contradicts_a_numeric_type_is_rejected(): void
    {
        $this->createModule('integer', 'string')->assertStatus(422);
    }

    public function test_a_size_rule_on_a_rich_text_field_is_rejected(): void
    {
        // Laravel would read this as "at most 255 nodes", not characters.
        $this->createModule('text', 'max:255')->assertStatus(422);
    }

    public function test_a_size_rule_on_a_plain_field_is_still_allowed(): void
    {
        // The box exists for exactly this.
        $this->createModule('string', 'max:60')->assertCreated();
    }

    public function test_required_and_nullable_are_not_treated_as_type_rules(): void
    {
        // Neither asserts a data type, so both must survive the check.
        $this->createModule('text', 'required')->assertCreated();
        $this->createModule('string', 'nullable')->assertCreated();
    }

    public function test_a_field_with_no_validation_is_unaffected(): void
    {
        $this->createModule('text', '')->assertCreated();
    }

    public function test_the_check_is_case_insensitive(): void
    {
        $this->createModule('text', 'STRING')->assertStatus(422);
    }
}
