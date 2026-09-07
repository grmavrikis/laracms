<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\ModuleSlug;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **A Module's schema can be edited, up to the point where it would change the
 * shape of data already stored** (TASKS.md #115).
 *
 * Raised by the owner: "why can I only rename? I might want to add a column,
 * or make a field required after the fact." Correct - and the line is not
 * "editing is dangerous", it is one question asked per change:
 *
 *     does this change the shape of what is already in `entries.data`?
 *
 * **No** - add a field, reorder them, change `required`, `validation` or
 * `options`. Nothing stored becomes wrong: `EntryPresenter` reads
 * `$entry->data[$name] ?? null`, so a field nobody has filled renders empty.
 *
 * **Yes** - rename a field, remove one, change its `type`, or change
 * `translatable`. The stored values are keyed by name and shaped by type, and
 * nothing migrates them. `translatable` is the one that looks harmless and is
 * not: false-to-true leaves a scalar where the code expects a map per
 * language, so the Greek text would print on the French page; true-to-false
 * hands an array to something expecting a string.
 *
 * Those four stay a hand-written migration, which is what TASKS.md → *To
 * discuss* has always said about them.
 */
class ModuleSchemaEditTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();

        $this->languages('el', 'en');
    }

    private function aModule(?array $schema = null): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => $schema ?? [
                ['name' => 'title', 'type' => 'string', 'translatable' => true],
                ['name' => 'price', 'type' => 'string', 'translatable' => false],
            ],
        ]);
    }

    private function putSchema(Module $module, array $schema)
    {
        return $this->actingAs($this->owner)
            ->putJson("/api/modules/{$module->slug}", ['schema' => $schema]);
    }

    private function schemaOf(Module $module): array
    {
        return array_map(
            fn(array $f) => $f['name'] . ':' . $f['type'] . ($f['required'] ?? false ? ':required' : ''),
            $module->fresh()->schema
        );
    }

    // ------------------------------------------------------ what is allowed

    public function test_a_field_can_be_added(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
            ['name' => 'view', 'type' => 'text', 'translatable' => true],
        ])->assertOk();

        $this->assertContains('view:text', $this->schemaOf($module));
    }

    /**
     * The question the owner asked by name. Nothing stored is lost; what
     * changes is that an entry which lacks it can no longer be **saved** until
     * it is filled, which is what "required" means.
     */
    public function test_a_field_can_be_made_required_after_the_fact(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true, 'required' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
        ])->assertOk();

        $this->assertContains('title:string:required', $this->schemaOf($module));
    }

    public function test_validation_and_options_can_be_changed(): void
    {
        $module = $this->aModule([
            ['name' => 'title', 'type' => 'string', 'translatable' => false],
            ['name' => 'board', 'type' => 'select', 'translatable' => false, 'options' => ['bb', 'hb']],
        ]);

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => false, 'validation' => 'max:80'],
            ['name' => 'board', 'type' => 'select', 'translatable' => false, 'options' => ['bb', 'hb', 'ai']],
        ])->assertOk();

        $schema = $module->fresh()->schema;

        $this->assertSame('max:80', $schema[0]['validation']);
        $this->assertSame(['bb', 'hb', 'ai'], $schema[1]['options']);
    }

    public function test_fields_can_be_reordered(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
        ])->assertOk();

        $this->assertSame(['price:string', 'title:string'], $this->schemaOf($module));
    }

    /**
     * An entry written before the field existed keeps working: it renders with
     * the new field empty, and it can still be saved as long as the addition
     * is not required.
     */
    public function test_an_entry_written_before_the_new_field_still_works(): void
    {
        $module = $this->aModule();

        $entry = $module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['el' => 'Σουίτα'], 'price' => '90'],
            'status' => Entry::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $entry->slugs()->create(['module_id' => $module->id, 'language_code' => 'el', 'slug' => 'souita']);

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
            ['name' => 'view', 'type' => 'text', 'translatable' => true],
        ])->assertOk();

        $this->get('/el/rooms/souita')->assertOk()->assertSee('Σουίτα', false);

        $this->actingAs($this->owner)
            ->putJson("/api/modules/rooms/entries/{$entry->id}", [
                'data' => ['title' => ['el' => 'Σουίτα'], 'price' => '95'],
            ])->assertOk();
    }

    /**
     * **The cost the decision rests on**, asserted rather than only written
     * down: an entry that predates a newly required field can no longer be
     * saved until it is filled.
     *
     * Nothing is lost and un-requiring the field undoes it, which is why this
     * was accepted - but if it silently stopped happening, a client who set a
     * field required would go on saving incomplete entries believing
     * otherwise, and only the documentation would say so.
     */
    public function test_making_a_field_required_stops_older_entries_saving(): void
    {
        $module = $this->aModule();

        $entry = $module->entries()->create([
            'user_id' => $this->owner->id,
            'data' => ['title' => ['el' => 'Σουίτα']],
            'status' => Entry::STATUS_DRAFT,
        ]);

        // Saveable before, with `price` left out entirely.
        $this->actingAs($this->owner)
            ->putJson("/api/modules/rooms/entries/{$entry->id}", ['data' => ['title' => ['el' => 'Σουίτα']]])
            ->assertOk();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false, 'required' => true],
        ])->assertOk();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/rooms/entries/{$entry->id}", ['data' => ['title' => ['el' => 'Σουίτα']]])
            ->assertStatus(422);
    }

    // ------------------------------------------------------ what is refused

    /**
     * **An empty schema is refused, not ignored.** Laravel drops an empty
     * array from `validated()`, so reading the key from there answered 200
     * having done nothing - telling the caller their destructive request had
     * succeeded. The same behaviour `SettingController` had to work around
     * with `present`.
     */
    public function test_an_empty_schema_is_refused_rather_than_ignored(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('schema');

        $this->assertSame(['title:string', 'price:string'], $this->schemaOf($module));
    }

    /**
     * A payload naming one field twice is refused before the immutability
     * check can be fooled by it: `keyBy('name')` keeps only the last of a
     * repeated name, so the type comparison would otherwise run against a
     * collapsed view of what was actually sent.
     */
    public function test_a_field_named_twice_is_refused(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'text', 'translatable' => true],
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
        ])->assertStatus(422);

        $this->assertSame(['title:string', 'price:string'], $this->schemaOf($module));
    }

    // ------------------------------------------------- one write, or none

    /**
     * **The schema and the addresses are one write.**
     *
     * `syncTranslations` deletes every slug row before re-inserting them, so a
     * failure part way through left the module with fewer addresses than it
     * had, or none - and since #114 a module with no addresses has no public
     * page anywhere. TASKS.md #77 is the same defect one level down, and
     * `EntryController` wraps the identical delete-then-insert for that reason.
     *
     * The insert is made to fail from a model event rather than by contriving
     * a constraint violation, because the realistic trigger is a race the test
     * cannot stage: another request taking `/fr/prestations` between this
     * request's validation and its insert. What is being pinned is that *any*
     * failure leaves the module as it was.
     */
    public function test_a_failed_save_leaves_the_module_as_it_was(): void
    {
        $module = $this->aModule();

        $addresses = fn() => $module->fresh()->slugs()->orderBy('language_code')->pluck('slug', 'language_code')->all();

        $before = $addresses();
        $this->assertNotEmpty($before);

        $written = 0;

        ModuleSlug::creating(function () use (&$written)
        {
            if (++$written === 2)
            {
                throw new \RuntimeException('the second insert fails');
            }
        });

        try
        {
            $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
                'translations' => [
                    'el' => ['name' => 'Δωμάτια', 'slug' => 'domatia'],
                    'en' => ['name' => 'Rooms', 'slug' => 'rooms-en'],
                ],
            ]);
        }
        catch (\Throwable $e)
        {
            // Failing is the point. What matters is what is left behind.
        }

        $this->assertSame(
            $before,
            $addresses(),
            'A failed save left the module with a different set of addresses than it started with.'
        );
    }

    /**
     * **A translation key is a language this site has.**
     *
     * `module_slugs.language_code` is `varchar(5)` and nothing checked the
     * keys, so a key longer than that was a **500 on MySQL** rather than a
     * 422 - and a short unknown one silently created an address in a language
     * nothing will ever serve. CHANGELOG §17 records exactly this for an
     * entry's slugs; the module's translations were written without it.
     *
     * Membership rather than length, and **any** language rather than the
     * active ones: the panel has to be able to translate into a language that
     * is not published yet, which is the whole point of #114's second step.
     */
    public function test_a_translation_key_has_to_be_a_language_this_site_has(): void
    {
        $module = $this->aModule();

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => ['not-a-language-code' => ['name' => 'Rooms']],
        ])->assertStatus(422)->assertJsonValidationErrors('translations');

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => ['de' => ['name' => 'Zimmer']],
        ])->assertStatus(422);
    }

    public function test_a_language_that_is_not_published_yet_can_still_be_translated(): void
    {
        $this->inactiveLanguage('de');

        $module = $this->aModule();

        $this->actingAs($this->owner)->putJson("/api/modules/{$module->slug}", [
            'translations' => [
                'el' => ['name' => 'Δωμάτια'],
                'de' => ['name' => 'Zimmer'],
            ],
        ])->assertOk();

        $this->assertSame('zimmer', $module->fresh()->slugFor('de'));
    }



    public function test_a_field_cannot_be_renamed(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'headline', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
        ])->assertStatus(422)->assertJsonValidationErrors('schema');
    }

    public function test_a_field_cannot_be_removed(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
        ])->assertStatus(422)->assertJsonValidationErrors('schema');
    }

    public function test_the_type_of_a_field_cannot_be_changed(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'text', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
        ])->assertStatus(422)->assertJsonValidationErrors('schema');
    }

    /**
     * The one that looks harmless. `translatable` decides whether the stored
     * value is a scalar or a map of language to value, and nothing migrates
     * what is already there - so this is a change of type wearing another
     * name.
     */
    public function test_translatable_cannot_be_flipped(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => true],
        ])->assertStatus(422)->assertJsonValidationErrors('schema');
    }

    /**
     * A schema that cannot produce entry rules is refused here rather than the
     * first time somebody tries to save an entry - the same check `store`
     * makes, from the same builder.
     */
    public function test_a_schema_that_cannot_produce_rules_is_refused(): void
    {
        $module = $this->aModule();

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            // `integer` asserts a data type, which the field's own type already
            // decides. The builder refuses the contradiction, and it has to be
            // heard here rather than the first time somebody saves an entry.
            ['name' => 'price', 'type' => 'string', 'translatable' => false, 'validation' => 'integer'],
        ])->assertStatus(422);
    }

    // -------------------------------------------------------- the built site

    /**
     * A schema change changes what every page under this module renders, so
     * the baked ones have to go. The module row is saved, so the observer does
     * it - this pins that the save actually happens rather than the rows being
     * written behind the model's back.
     */
    public function test_changing_the_schema_drops_the_baked_pages(): void
    {
        $module = $this->aModule();

        $this->get('/el/rooms')->assertOk();
        $this->assertTrue(app(\App\Services\StaticPages::class)->has('el/rooms.html'));

        $this->putSchema($module, [
            ['name' => 'title', 'type' => 'string', 'translatable' => true],
            ['name' => 'price', 'type' => 'string', 'translatable' => false],
            ['name' => 'view', 'type' => 'text', 'translatable' => true],
        ])->assertOk();

        $this->assertFalse(
            app(\App\Services\StaticPages::class)->has('el/rooms.html'),
            'The pages still on disk were rendered from the previous schema.'
        );
    }

    // --------------------------------------------------------- and the rest

    public function test_editing_a_schema_needs_a_session(): void
    {
        $module = $this->aModule();

        $this->putJson("/api/modules/{$module->slug}", [
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ])->assertStatus(401);
    }

    /**
     * Sending no schema at all leaves it alone, so the rename screen can post
     * translations without restating a schema it does not show.
     */
    public function test_a_payload_without_a_schema_leaves_it_alone(): void
    {
        $module = $this->aModule();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$module->slug}", [
                'translations' => ['el' => ['name' => 'Δωμάτια']],
            ])->assertOk();

        $this->assertSame(['title:string', 'price:string'], $this->schemaOf($module));
    }
}
