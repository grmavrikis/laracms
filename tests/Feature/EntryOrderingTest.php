<?php

namespace Tests\Feature;

use App\Models\Entry;
use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $this->createEntry('Other', 2)->assertCreated();

        $entry = $this->module->entries()->where('sort_order', 9)->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'Mover'],
                'sort_order' => 1,
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

        // Reported against `ids` rather than `ids.0`: existence is now checked
        // by comparing the body against the module's own ids in one query,
        // not by an `exists` rule per element (TASKS.md #84).
        $this->reorder([$stranger->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');

        $this->assertNull($stranger->fresh()->sort_order);
    }

    public function test_an_id_that_does_not_exist_is_refused(): void
    {
        $this->reorder([999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');
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

    /**
     * `ids.*` fired one `exists` per id and the write fired one UPDATE per id,
     * so fifteen rows were thirty statements for one swap (TASKS.md #84).
     *
     * Existence is now the completeness rule's job - it compares against the
     * module's own ids, so a foreign or missing id cannot survive it - and the
     * write is a single CASE. The count is asserted rather than described
     * because that is the only way it stays true.
     */
    public function test_reordering_a_list_is_a_handful_of_queries(): void
    {
        foreach (range(1, 15) as $n)
        {
            $this->createEntry("E{$n}")->assertCreated();
        }

        $ids = $this->module->entries()->inListOrder()->pluck('id')->all();
        [$ids[0], $ids[1]] = [$ids[1], $ids[0]];

        $this->actingAs($this->owner);

        DB::flushQueryLog();
        DB::enableQueryLog();

        try
        {
            $this->reorder($ids)->assertNoContent();
            $queries = count(DB::getQueryLog());
        }
        finally
        {
            // Disabled in a finally, or a failed assertion leaves the log on
            // for every later test in the process (TASKS.md #38).
            DB::disableQueryLog();
        }

        // Measured: 32 before, 3 after - resolving the module by slug, reading
        // its ids, and one UPDATE. A fourth arrived with #67: `SetPanelLocale`
        // asks the settings row for the installation's language, and only
        // when the reader has expressed no preference of their own. That is
        // once per request rather than once per row, which is the line this
        // test defends.
        //
        // **It now sits exactly on the bound.** The next addition fails here,
        // and the answer is to ask why the request needs another query - not
        // to raise the number.
        $this->assertLessThanOrEqual(
            4,
            $queries,
            "Reordering fifteen entries took {$queries} queries; it was 32 before #84 and 3 after."
        );
    }

    public function test_an_absurdly_long_order_is_refused_before_it_is_looked_up(): void
    {
        $this->createEntry('One')->assertCreated();

        $this->reorder(range(1, Entry::MAX_REORDER + 1))
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');
    }

    /**
     * Reordering is a change to position, not to the entries. Writing through
     * the Eloquent builder stamps `updated_at` on every row it touches, so
     * moving one entry rewrote the modification time of the whole module -
     * and #59 is about to key a public page cache on exactly that.
     */
    public function test_reordering_does_not_restamp_the_entries(): void
    {
        $this->createEntry('A')->assertCreated();
        $this->createEntry('B')->assertCreated();
        $this->createEntry('C')->assertCreated();

        $before = $this->module->entries()->orderBy('id')->pluck('updated_at', 'id');

        $this->travel(1)->minutes();

        $this->reorder(array_reverse($this->idsOf(['A', 'B', 'C'])))->assertNoContent();

        $after = $this->module->entries()->orderBy('id')->pluck('updated_at', 'id');

        $this->assertEquals($before->all(), $after->all());

        // ...and the move itself still happened.
        $this->assertSame(['C', 'B', 'A'], $this->listedTitles());
    }

    /**
     * `max:MAX_REORDER` caps the request while the completeness rule demands
     * the module's whole set, so a module past the cap cannot be reordered at
     * all. The panel has to be told that, or it renders arrows that answer 422
     * on every click with nothing to explain why.
     */
    public function test_a_module_too_large_to_reorder_offers_no_order(): void
    {
        $rows = [];

        foreach (range(1, Entry::MAX_REORDER + 1) as $n)
        {
            $rows[] = [
                'module_id' => $this->module->id,
                'data' => json_encode(['title' => "E{$n}"]),
                'status' => Entry::STATUS_DRAFT,
                'sort_order' => Entry::UNPOSITIONED,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        foreach (array_chunk($rows, 500) as $chunk)
        {
            DB::table('entries')->insert($chunk);
        }

        $response = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries/order")
            ->assertOk();

        $this->assertFalse($response->json('reorderable'));
        $this->assertSame([], $response->json('ids'));
    }

    /**
     * The answer needs one id more than the cap allows and nothing beyond it.
     * Without the limit, a module of fifty thousand hydrated fifty thousand
     * ids on every listing load only to discard them.
     */
    public function test_the_order_query_is_bounded_by_the_cap(): void
    {
        $this->createEntry('A')->assertCreated();

        $this->actingAs($this->owner);

        DB::flushQueryLog();
        DB::enableQueryLog();

        try
        {
            $this->getJson("/api/modules/{$this->module->slug}/entries/order")->assertOk();
            $sql = collect(DB::getQueryLog())
                ->pluck('query')
                ->first(fn(string $q) => str_contains($q, 'select "id"') || str_contains($q, 'select `id`'));
        }
        finally
        {
            DB::disableQueryLog();
        }

        $this->assertNotNull($sql, 'The order endpoint no longer selects ids on its own.');
        $this->assertStringContainsString('limit', strtolower($sql));
    }

    public function test_a_module_within_the_cap_is_reorderable(): void
    {
        $this->createEntry('A')->assertCreated();

        $response = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries/order")
            ->assertOk();

        $this->assertTrue($response->json('reorderable'));
        $this->assertCount(1, $response->json('ids'));
    }

    public function test_fetching_the_whole_order_requires_authentication(): void
    {
        $this->getJson("/api/modules/{$this->module->slug}/entries/order")
            ->assertUnauthorized();
    }

    // ------------------------------------------------- the sentinel's edges

    /**
     * The getter cast before it compared, so `(int) null` was 0 and 0 is not
     * the sentinel - an unsaved Entry read as position 0, "pinned to the top",
     * where the docblock promises null (TASKS.md #80).
     *
     * That is the exact inversion the sentinel was introduced to prevent,
     * waiting for the first code that builds an Entry before saving it.
     */
    public function test_an_unsaved_entry_has_no_position(): void
    {
        $this->assertNull((new Entry)->sort_order);
        $this->assertNull((new Entry(['data' => []]))->sort_order);
    }

    /**
     * The cap was `max:` the sentinel itself, so a client could write 100000
     * and read it back as null - a position that silently became "no
     * position" (TASKS.md #82).
     */
    public function test_the_sentinel_itself_is_not_an_acceptable_position(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", [
                'data' => ['title' => 'x'],
                'sort_order' => Entry::UNPOSITIONED,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort_order');

        $this->assertSame(0, $this->module->entries()->count());
    }

    /**
     * Positions start at 1 - every comment in the code says so, and it is what
     * `reorder` writes. 0 validated anyway.
     */
    public function test_zero_is_not_a_position(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", [
                'data' => ['title' => 'x'],
                'sort_order' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('sort_order');
    }

    public function test_the_highest_real_position_is_still_accepted(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/api/modules/{$this->module->slug}/entries", [
                'data' => ['title' => 'x'],
                'sort_order' => Entry::UNPOSITIONED - 1,
            ])
            ->assertCreated();

        $this->assertSame(Entry::UNPOSITIONED - 1, $this->module->entries()->sole()->sort_order);
    }

    /**
     * `null` is still how the panel says "no position", and it has to stay
     * distinct from a number.
     */
    public function test_null_is_still_how_a_position_is_cleared(): void
    {
        $this->createEntry('x', 5)->assertCreated();
        $entry = $this->module->entries()->sole();

        $this->actingAs($this->owner)
            ->putJson("/api/modules/{$this->module->slug}/entries/{$entry->id}", [
                'data' => ['title' => 'x'],
                'sort_order' => null,
            ])
            ->assertOk();

        $this->assertNull($entry->fresh()->sort_order);
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
