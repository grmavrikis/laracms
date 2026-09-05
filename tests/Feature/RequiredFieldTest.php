<?php

namespace Tests\Feature;

use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `required` is a first-class part of a schema field.
 *
 * It was written into schemas long before anything read it, while the only
 * mechanism that worked was typing the word `required` into a free-text
 * validation box - which no field in the database ever did.
 */
class RequiredFieldTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    /**
     * `filler` is always sent: `data` itself carries a required rule and
     * Laravel treats an empty array as absent.
     */
    private function moduleWith(array $field): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [
                ['name' => 'filler', 'type' => 'string', 'translatable' => false],
                $field + ['type' => 'string', 'translatable' => false],
            ],
        ]);
    }

    private function postEntry(Module $module, array $data)
    {
        return $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", ['data' => $data + ['filler' => 'x']]);
    }

    public function test_a_field_flagged_required_must_be_sent(): void
    {
        $module = $this->moduleWith(['name' => 'title', 'required' => true]);

        $this->postEntry($module, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title');
    }

    public function test_a_field_not_flagged_required_may_be_omitted(): void
    {
        $module = $this->moduleWith(['name' => 'title', 'required' => false]);

        $this->postEntry($module, [])->assertCreated();
    }

    public function test_a_field_with_no_flag_at_all_is_optional(): void
    {
        $module = $this->moduleWith(['name' => 'title']);

        $this->postEntry($module, [])->assertCreated();
    }

    /**
     * The flag has to reach both levels of a translatable field: the map of
     * languages, and each value inside it.
     */
    public function test_the_flag_applies_to_a_translatable_field(): void
    {
        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        $this->postEntry($module, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title');

        $this->postEntry($module, ['title' => ['en' => 'present']])->assertCreated();
    }

    public function test_the_validation_string_still_works(): void
    {
        // The older way of saying it must keep working for schemas that use it.
        $module = $this->moduleWith(['name' => 'title', 'validation' => 'required']);

        $this->postEntry($module, [])->assertStatus(422);
    }

    public function test_the_flag_and_the_validation_string_do_not_duplicate_the_rule(): void
    {
        $rules = SchemaRuleBuilder::build([
            ['name' => 'title', 'type' => 'string', 'required' => true, 'validation' => 'required'],
        ]);

        $this->assertSame(['required', 'string'], $rules['data.title']);
    }

    public function test_the_api_accepts_and_stores_the_flag(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Posts',
                'schema' => [[
                    'name' => 'title',
                    'type' => 'string',
                    'translatable' => false,
                    'required' => true,
                ]],
            ])
            ->assertCreated();

        $this->assertTrue(Module::sole()->schema[0]['required']);
    }

    public function test_the_api_rejects_a_non_boolean_flag(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Posts',
                'schema' => [[
                    'name' => 'title',
                    'type' => 'string',
                    'translatable' => false,
                    'required' => 'yes please',
                ]],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema.0.required');
    }

    // ------------------------------- required, across more than one language

    private function seedLanguages(): void
    {
        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);
        Language::create(['name' => 'French', 'code' => 'fr']);
    }

    /**
     * `required` on a translatable field means **the default language**, not
     * every active one (TASKS.md, Decisions 2026-09-05).
     *
     * Demanding all of them made adding a language retroactively unsaveable:
     * every existing entry failed on the new language until somebody wrote it,
     * so an author could not correct a typo without inventing a translation.
     *
     * None of the earlier cases here caught it, because this database had no
     * languages at all - the wildcard only ever saw the keys that were sent.
     */
    public function test_required_means_the_default_language(): void
    {
        $this->seedLanguages();

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        $this->postEntry($module, ['title' => ['el' => 'Παρών']])->assertCreated();
    }

    public function test_the_other_languages_may_be_left_empty(): void
    {
        $this->seedLanguages();

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        // What the panel actually sends: every language, most of them blank.
        $this->postEntry($module, ['title' => ['el' => 'Παρών', 'en' => null, 'fr' => '']])
            ->assertCreated();
    }

    public function test_the_default_language_is_still_demanded(): void
    {
        $this->seedLanguages();

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        $this->postEntry($module, ['title' => ['el' => '', 'en' => 'present']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title.el');

        $this->postEntry($module, ['title' => ['en' => 'present']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title.el');
    }

    public function test_the_map_itself_is_still_demanded(): void
    {
        $this->seedLanguages();

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        $this->postEntry($module, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title');
    }

    /**
     * The rule follows whichever language carries the flag, so a site that
     * changes its default does not keep demanding the old one.
     */
    public function test_it_follows_the_flag_rather_than_the_first_row(): void
    {
        $this->seedLanguages();
        Language::where('code', 'el')->update(['is_default' => false]);
        Language::where('code', 'fr')->update(['is_default' => true]);

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => true,
        ]);

        $this->postEntry($module, ['title' => ['fr' => 'Présent']])->assertCreated();

        $this->postEntry($module, ['title' => ['el' => 'Παρών']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('data.title.fr');
    }

    public function test_a_field_that_is_not_required_is_untouched_by_any_of_this(): void
    {
        $this->seedLanguages();

        $module = $this->moduleWith([
            'name' => 'title',
            'translatable' => true,
            'required' => false,
        ]);

        $this->postEntry($module, [])->assertCreated();
        $this->postEntry($module, ['title' => ['el' => null]])->assertCreated();
    }
}
