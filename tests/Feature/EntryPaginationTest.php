<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The entries index is paginated, so its ordering has to be a total order.
 * `latest()` alone sorts by created_at, and entries created in the same second
 * tie - leaving the database free to return them in any order, which is how a
 * paginated list ends up repeating or skipping rows between pages.
 */
class EntryPaginationTest extends TestCase
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
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => false]],
        ]);
    }

    /**
     * @return array<int, int> ids in creation order
     */
    private function seedEntries(int $count): array
    {
        $ids = [];
        // One fixed timestamp for all of them, so created_at cannot break the
        // tie and the ordering has to come from somewhere else.
        $at = now()->subDay();

        foreach (range(1, $count) as $n)
        {
            $entry = $this->module->entries()->create(['data' => ['title' => "entry {$n}"]]);
            $entry->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
            $ids[] = $entry->id;
        }

        return $ids;
    }

    public function test_entries_are_listed_newest_first_even_when_timestamps_tie(): void
    {
        $ids = $this->seedEntries(5);

        $response = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries")
            ->assertOk();

        $returned = array_column($response->json('data'), 'id');

        $this->assertSame(array_reverse($ids), $returned);
    }

    public function test_the_index_reports_the_real_total_not_the_page_size(): void
    {
        $this->seedEntries(18);

        $response = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries")
            ->assertOk();

        $this->assertCount(15, $response->json('data'));
        $this->assertSame(18, $response->json('total'));
        $this->assertSame(2, $response->json('last_page'));
        $this->assertSame(1, $response->json('from'));
        $this->assertSame(15, $response->json('to'));
    }

    public function test_the_second_page_returns_the_remainder_without_overlap(): void
    {
        $this->seedEntries(18);

        $first = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries?page=1")
            ->json('data');

        $second = $this->actingAs($this->owner)
            ->getJson("/api/modules/{$this->module->slug}/entries?page=2")
            ->json('data');

        $firstIds = array_column($first, 'id');
        $secondIds = array_column($second, 'id');

        $this->assertCount(3, $secondIds);
        $this->assertEmpty(array_intersect($firstIds, $secondIds), 'A row appeared on both pages');
        $this->assertCount(18, array_unique(array_merge($firstIds, $secondIds)));
    }
}
