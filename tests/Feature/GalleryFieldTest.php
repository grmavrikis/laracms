<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An entry could hold one image and no more: `image` stores a single URL and
 * no field type repeats. For the first market that is fatal rather than
 * awkward - a room needs eight to fifteen photographs, because for an
 * apartment the photographs *are* the product (TASKS.md #68).
 *
 * The value is a list of images, and each image carries its own alt text per
 * language:
 *
 *     data.photos = [ ['url' => '...', 'alt' => ['el' => '...', 'en' => '...']], ... ]
 *
 * The nesting is deliberate. Translations otherwise live at
 * `data.{field}.{lang}`, but a translatable gallery would mean a *different
 * set of photographs per language*, which is not what anybody wants: the
 * photographs are one set and only the alt text differs. Selling multilingual
 * SEO while shipping images whose alt text cannot be translated would
 * contradict the pitch, so alt is translatable and the gallery is not.
 */
class GalleryFieldTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
    }

    private function moduleWith(array $overrides = []): Module
    {
        return Module::create([
            'user_id' => $this->owner->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [
                array_merge(
                    ['name' => 'photos', 'type' => 'gallery', 'translatable' => false],
                    $overrides
                ),
            ],
        ]);
    }

    private function postEntry(Module $module, mixed $photos)
    {
        return $this->actingAs($this->owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['photos' => $photos],
            ]);
    }

    public function test_gallery_is_a_creatable_field_type(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Rooms',
                'schema' => [
                    ['name' => 'photos', 'type' => 'gallery', 'translatable' => false],
                ],
            ])
            ->assertCreated();
    }

    public function test_an_entry_keeps_the_images_in_the_order_they_were_sent(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [
            ['url' => '/storage/uploads/first.jpg', 'alt' => ['el' => 'Πρώτη']],
            ['url' => '/storage/uploads/second.jpg', 'alt' => ['el' => 'Δεύτερη']],
            ['url' => '/storage/uploads/third.jpg', 'alt' => ['el' => 'Τρίτη']],
        ])->assertCreated();

        $stored = $module->entries()->sole()->data['photos'];

        $this->assertSame(
            ['/storage/uploads/first.jpg', '/storage/uploads/second.jpg', '/storage/uploads/third.jpg'],
            array_column($stored, 'url')
        );
    }

    public function test_alt_text_is_kept_per_language(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [
            ['url' => '/storage/uploads/sea.jpg', 'alt' => ['el' => 'Θέα στη θάλασσα', 'en' => 'Sea view']],
        ])->assertCreated();

        $stored = $module->entries()->sole()->data['photos'][0];

        $this->assertSame('Θέα στη θάλασσα', $stored['alt']['el']);
        $this->assertSame('Sea view', $stored['alt']['en']);
    }

    public function test_an_image_may_have_no_alt_text_at_all(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [['url' => '/storage/uploads/sea.jpg']])
            ->assertCreated();

        $this->assertSame(
            '/storage/uploads/sea.jpg',
            $module->entries()->sole()->data['photos'][0]['url']
        );
    }

    public function test_a_value_that_is_not_a_list_is_rejected(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, 'not-a-list')->assertStatus(422);
    }

    public function test_an_image_without_a_url_is_rejected(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [['alt' => ['el' => 'Χωρίς αρχείο']]])
            ->assertStatus(422);
    }

    public function test_an_image_that_is_not_an_object_is_rejected(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, ['/storage/uploads/bare-string.jpg'])
            ->assertStatus(422);
    }

    /**
     * Unlike a rich-text field, where the empty document the form always sends
     * is a non-empty array and satisfies `required` (TASKS.md #36), an empty
     * gallery really is an empty array - so the flag bites here.
     */
    public function test_a_required_gallery_rejects_an_empty_list(): void
    {
        $module = $this->moduleWith(['required' => true]);

        $this->postEntry($module, [])->assertStatus(422);
    }

    public function test_an_optional_gallery_accepts_an_empty_list(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [])->assertCreated();

        $this->assertSame([], $module->entries()->sole()->data['photos']);
    }

    /**
     * A translatable gallery would store a different set of photographs per
     * language. Nobody wants that, and silently ignoring the flag is the kind
     * of quiet acceptance this schema has had removed from it repeatedly - so
     * it is refused when the Module is created, where the author is watching.
     */
    public function test_a_translatable_gallery_is_refused_when_the_module_is_created(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/modules', [
                'name' => 'Rooms',
                'schema' => [
                    ['name' => 'photos', 'type' => 'gallery', 'translatable' => true],
                ],
            ])
            ->assertStatus(422);
    }

    /**
     * Only `url` and `alt` have rules, and Laravel's validated payload keeps
     * only what was validated - so a key nobody asked for cannot ride along
     * into the JSON column.
     */
    public function test_keys_nobody_declared_are_not_stored(): void
    {
        $module = $this->moduleWith();

        $this->postEntry($module, [
            ['url' => '/storage/uploads/sea.jpg', 'caption' => 'smuggled', 'alt' => ['el' => 'Θάλασσα']],
        ])->assertCreated();

        $stored = $module->entries()->sole()->data['photos'][0];

        $this->assertArrayNotHasKey('caption', $stored);
        $this->assertSame('/storage/uploads/sea.jpg', $stored['url']);
    }

    /**
     * A count limit means what it says on a gallery - unlike rich text, where
     * a size rule would count document nodes and is refused for that reason.
     */
    public function test_a_size_rule_limits_the_number_of_images(): void
    {
        $module = $this->moduleWith(['validation' => 'max:2']);

        $this->postEntry($module, [
            ['url' => '/storage/uploads/a.jpg'],
            ['url' => '/storage/uploads/b.jpg'],
            ['url' => '/storage/uploads/c.jpg'],
        ])->assertStatus(422);
    }
}
