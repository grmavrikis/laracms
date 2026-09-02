<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every entry was public the moment it was saved (TASKS.md #56).
 *
 * There was no draft, no publication date and no Publish action, so a
 * half-written text was live - which is the first call an unhappy client
 * makes. `status` gates what a public page may show; `published_at` records
 * when it went out, for ordering a blog by publication rather than by the
 * accident of when the row was created.
 *
 * Both are real indexed columns rather than schema fields, because they mean
 * the same thing for every Module and they are what the public side filters
 * on.
 */
class EntryPublicationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Module $module;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->module = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ]);
    }

    private function createEntry(array $payload)
    {
        return $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", $payload);
    }

    /**
     * The safe direction. Anything a client is still typing stays off the site
     * until they say otherwise.
     */
    public function test_a_new_entry_is_a_draft_unless_it_says_otherwise(): void
    {
        $this->createEntry(['data' => ['title' => 'Half written']])->assertCreated();

        $entry = $this->module->entries()->sole();

        $this->assertSame(Entry::STATUS_DRAFT, $entry->status);
        $this->assertNull($entry->published_at);
    }

    public function test_an_entry_can_be_created_published(): void
    {
        $this->createEntry(['data' => ['title' => 'Ready'], 'status' => Entry::STATUS_PUBLISHED])
            ->assertCreated();

        $entry = $this->module->entries()->sole();

        $this->assertSame(Entry::STATUS_PUBLISHED, $entry->status);
        $this->assertNotNull($entry->published_at);
    }

    public function test_publishing_a_draft_stamps_the_moment_it_went_out(): void
    {
        $this->createEntry(['data' => ['title' => 'Draft']])->assertCreated();

        $entry = $this->module->entries()->sole();
        $this->assertNull($entry->published_at);

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'Draft'],
                'status' => Entry::STATUS_PUBLISHED,
            ])
            ->assertOk();

        $this->assertNotNull($entry->fresh()->published_at);
    }

    /**
     * The date says when it *first* went out. Editing a published entry, or
     * republishing one that was pulled, must not rewrite its history.
     */
    public function test_republishing_does_not_move_the_original_date(): void
    {
        $this->createEntry(['data' => ['title' => 'Live'], 'status' => Entry::STATUS_PUBLISHED])
            ->assertCreated();

        $entry = $this->module->entries()->sole();
        $first = $entry->published_at;

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'Live, edited'],
                'status' => Entry::STATUS_PUBLISHED,
            ])
            ->assertOk();

        $this->assertTrue($first->equalTo($entry->fresh()->published_at));
    }

    public function test_a_status_nobody_declared_is_rejected(): void
    {
        $this->createEntry(['data' => ['title' => 'x'], 'status' => 'live'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('status');
    }

    /**
     * The scope the public side reads through. The admin listing keeps showing
     * everything - that is the whole point of a draft being visible to its
     * author and to nobody else.
     */
    public function test_the_published_scope_returns_only_published_entries(): void
    {
        $this->createEntry(['data' => ['title' => 'Draft']])->assertCreated();
        $this->createEntry(['data' => ['title' => 'Live'], 'status' => Entry::STATUS_PUBLISHED])->assertCreated();

        $this->assertSame(2, $this->module->entries()->count());
        $this->assertSame(1, $this->module->entries()->published()->count());
        $this->assertSame('Live', $this->module->entries()->published()->sole()->data['title']);
    }

    public function test_the_admin_listing_still_shows_drafts(): void
    {
        $this->createEntry(['data' => ['title' => 'Draft']])->assertCreated();

        $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries")
            ->assertOk()
            ->assertJsonPath('total', 1);
    }

    /**
     * Pulling something back off the site keeps the date it first went out -
     * it is a record of what happened, not of the current state.
     */
    public function test_unpublishing_keeps_the_entry_and_its_date(): void
    {
        $this->createEntry(['data' => ['title' => 'Live'], 'status' => Entry::STATUS_PUBLISHED])
            ->assertCreated();

        $entry = $this->module->entries()->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'Live'],
                'status' => Entry::STATUS_DRAFT,
            ])
            ->assertOk();

        $entry->refresh();

        $this->assertSame(Entry::STATUS_DRAFT, $entry->status);
        $this->assertNotNull($entry->published_at);
        $this->assertSame(0, $this->module->entries()->published()->count());
    }
}
