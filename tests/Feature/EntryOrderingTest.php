<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Only `created_at` ordering existed, so "these four rooms, in this order, on
 * the home page" could not be expressed at all (TASKS.md #57).
 *
 * `sort_order` is a real indexed column rather than a schema field: it means
 * the same thing for every Module and it is what listings sort on. The seeder
 * had invented a `sort_order` *field* long before this, which was the same
 * need noticed and never built.
 */
class EntryOrderingTest extends TestCase
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

    private function createEntry(string $title, ?int $order = null)
    {
        return $this->actingAs($this->owner)->postJson(
            "/api/modules/{$this->module->slug}/entries",
            array_filter(['data' => ['title' => $title], 'sort_order' => $order], fn($v) => $v !== null)
        );
    }

    private function listedTitles(): array
    {
        return $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries")
            ->assertOk()
            ->json('data.*.data.title');
    }

    public function test_an_entry_starts_unsorted(): void
    {
        $this->createEntry('First')->assertCreated();

        // `null` above the database; the column holds the sentinel that keeps
        // unpositioned entries sorting last.
        $this->assertNull($this->module->entries()->sole()->sort_order);
        $this->assertDatabaseHas('entries', ['sort_order' => Entry::UNPOSITIONED]);
    }

    /**
     * Everything at 0 has to keep the old behaviour, or adding the column
     * would silently reorder every existing list.
     */
    public function test_unsorted_entries_are_still_newest_first(): void
    {
        $this->createEntry('One')->assertCreated();
        $this->createEntry('Two')->assertCreated();
        $this->createEntry('Three')->assertCreated();

        $this->assertSame(['Three', 'Two', 'One'], $this->listedTitles());
    }

    public function test_a_sort_order_decides_the_listing(): void
    {
        $this->createEntry('Third', 3)->assertCreated();
        $this->createEntry('First', 1)->assertCreated();
        $this->createEntry('Second', 2)->assertCreated();

        $this->assertSame(['First', 'Second', 'Third'], $this->listedTitles());
    }

    /**
     * Ascending, so 1 is the top of the page - which is what somebody typing
     * a position expects.
     */
    public function test_a_sorted_entry_comes_before_an_unsorted_one(): void
    {
        $this->createEntry('Unsorted')->assertCreated();
        $this->createEntry('Pinned', 1)->assertCreated();

        $this->assertSame(['Pinned', 'Unsorted'], $this->listedTitles());
    }

    /**
     * Entries saved in the same second tie on both columns, and without a
     * total order a paginated list can repeat or skip rows - the reason `id`
     * was already the tie-break before this column existed.
     */
    public function test_entries_sharing_a_position_still_have_a_total_order(): void
    {
        $this->createEntry('One', 5)->assertCreated();
        $this->createEntry('Two', 5)->assertCreated();
        $this->createEntry('Three', 5)->assertCreated();

        $this->assertSame(['Three', 'Two', 'One'], $this->listedTitles());
        $this->assertSame(['Three', 'Two', 'One'], $this->listedTitles());
    }

    public function test_the_position_can_be_changed(): void
    {
        $this->createEntry('Mover', 9)->assertCreated();
        $this->createEntry('Other', 1)->assertCreated();

        $entry = $this->module->entries()->where('sort_order', 9)->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'Mover'],
                'sort_order' => 0,
            ])
            ->assertOk();

        $this->assertSame(['Mover', 'Other'], $this->listedTitles());
    }

    // ------------------------------------------------------- reordering a list

    private function idsOf(array $titles): array
    {
        return array_map(
            fn($t) => $this->module->entries()->get()
                ->first(fn($e) => $e->data['title'] === $t)->id,
            $titles
        );
    }

    private function reorder(array $ids)
    {
        return $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/order", ['ids' => $ids]);
    }

    /**
     * One request for the whole list rather than one per row: dragging three
     * rows should not be three round trips, and assigning positions one at a
     * time would leave the list half-ordered if any of them failed.
     */
    public function test_the_whole_order_is_set_in_one_request(): void
    {
        $this->createEntry('A')->assertCreated();
        $this->createEntry('B')->assertCreated();
        $this->createEntry('C')->assertCreated();

        $this->reorder($this->idsOf(['C', 'A', 'B']))->assertNoContent();

        $this->assertSame(['C', 'A', 'B'], $this->listedTitles());
    }

    public function test_positions_start_at_one_so_the_list_sits_above_unpositioned(): void
    {
        $this->createEntry('A')->assertCreated();
        $this->createEntry('B')->assertCreated();

        $ids = $this->idsOf(['B', 'A']);
        $this->reorder($ids)->assertNoContent();

        $this->assertSame(1, $this->module->entries()->find($ids[0])->sort_order);
        $this->assertSame(2, $this->module->entries()->find($ids[1])->sort_order);
    }

    /**
     * The scoped binding cannot help here - the ids are in the body, not the
     * path - so this is the one place the Module has to be checked by hand.
     */
    public function test_an_entry_from_another_module_is_refused(): void
    {
        $this->createEntry('Mine')->assertCreated();

        $other = Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Other',
            'slug' => 'other',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ]);
        $stranger = $other->entries()->create(['data' => ['title' => 'Theirs']]);

        $this->reorder([$stranger->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids.0');

        $this->assertNull($stranger->fresh()->sort_order);
    }

    public function test_an_id_that_does_not_exist_is_refused(): void
    {
        $this->reorder([999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids.0');
    }

    /**
     * Nothing is created first: `actingAs` persists for the rest of a test, so
     * signing in to set the scene would leave this request authenticated and
     * the assertion would pass for the wrong reason.
     */
    public function test_reordering_requires_authentication(): void
    {
        $this->putJson("/api/modules/{$this->module->slug}/entries/order", ['ids' => []])
            ->assertUnauthorized();
    }

    /**
     * The table holds one page of fifteen, so before this the panel could only
     * ever send fifteen ids - and the endpoint numbered exactly those 1..N,
     * writing page 2's rows straight over page 1's (TASKS.md #75).
     *
     * Every other case in this file happens to send the module's whole set,
     * which is why the suite was green while the browser was wrong. This one
     * sends a subset on purpose.
     */
    public function test_a_subset_of_the_module_is_refused(): void
    {
        $this->createEntry('A')->assertCreated();
        $this->createEntry('B')->assertCreated();
        $this->createEntry('C')->assertCreated();

        $ids = $this->idsOf(['C', 'B', 'A']);

        $this->reorder([$ids[0], $ids[1]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');

        // Nothing was renumbered: all three are still unpositioned.
        foreach ($ids as $id)
        {
            $this->assertNull($this->module->entries()->find($id)->sort_order);
        }
    }

    /**
     * The same id twice would consume two positions and write one row, which
     * is the subset problem wearing a different hat.
     */
    public function test_a_repeated_id_is_refused(): void
    {
        $this->createEntry('A')->assertCreated();
        $this->createEntry('B')->assertCreated();

        $ids = $this->idsOf(['A', 'B']);

        $this->reorder([$ids[0], $ids[0]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');
    }

    /**
     * What makes the whole-set rule usable from a paginated table: the panel
     * asks for every id before a move rather than reordering the page it can
     * see. One `select id` on a list somebody hand-orders.
     */
    public function test_the_whole_order_can_be_fetched(): void
    {
        $this->createEntry('Third', 3)->assertCreated();
        $this->createEntry('First', 1)->assertCreated();
        $this->createEntry('Second', 2)->assertCreated();

        $this->assertSame(
            $this->idsOf(['First', 'Second', 'Third']),
            $this->actingAs($this->owner)
                ->getJson("/api/modules/{$this->module->slug}/entries/order")
                ->assertOk()
                ->json('ids')
        );
    }

    /**
     * The arrows swap an entry with the row above it *on screen*, so the id
     * list and the listing have to be the same order. If they drifted, a move
     * would swap the entry with a neighbour it is not next to.
     */
    public function test_the_fetched_order_matches_the_listing_across_pages(): void
    {
        foreach (range(1, 20) as $n)
        {
            $this->createEntry("Entry {$n}")->assertCreated();
        }

        $listed = array_merge(
            $this->listedIds(1),
            $this->listedIds(2),
        );

        $this->assertCount(20, $listed);
        $this->assertSame(
            $listed,
            $this->actingAs($this->owner)
                ->getJson("/api/modules/{$this->module->slug}/entries/order")
                ->assertOk()
                ->json('ids')
        );
    }

    private function listedIds(int $page): array
    {
        return $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries?page={$page}")
            ->assertOk()
            ->json('data.*.id');
    }

    public function test_fetching_the_whole_order_requires_authentication(): void
    {
        $this->getJson("/api/modules/{$this->module->slug}/entries/order")
            ->assertUnauthorized();
    }

    public function test_a_position_that_is_not_a_whole_number_is_rejected(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", [
                'data' => ['title' => 'x'],
                'sort_order' => 'first',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort_order');
    }

    public function test_a_negative_position_is_rejected(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", [
                'data' => ['title' => 'x'],
                'sort_order' => -1,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort_order');
    }
}
