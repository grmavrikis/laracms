<?php

namespace Tests\Feature;

use App\Http\Controllers\UploadController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * What the panel accepts as an image (TASKS.md #98).
 *
 * `max:2048` was an anonymous number in the rule and is now
 * `UploadController::MAX_KILOBYTES` - and naming it was the whole of the
 * change, so nothing exercised it. A ceiling nothing tests is a ceiling that
 * can be deleted: without it a client uploads a camera original, the request
 * dies on PHP's own `post_max_size` with an empty response, and the report is
 * "images do not work".
 */
class ImageUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
    }

    public function test_an_image_at_the_limit_is_stored(): void
    {
        $file = UploadedFile::fake()->image('room.jpg')->size(UploadController::MAX_KILOBYTES);

        $response = $this->actingAs(User::factory()->create())
            ->postJson('/api/upload', ['image' => $file])
            ->assertOk();

        $this->assertStringContainsString('/storage/uploads/', $response->json('url'));

        Storage::disk('public')->assertExists('uploads/' . $file->hashName());
    }

    public function test_an_image_over_the_limit_is_refused(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/upload', [
                'image' => UploadedFile::fake()->image('huge.jpg')->size(UploadController::MAX_KILOBYTES + 1),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('image');

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    /** A file that is not an image at all, whatever it is called. */
    public function test_something_that_is_not_an_image_is_refused(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/upload', ['image' => UploadedFile::fake()->create('invoice.pdf', 10)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('image');
    }

    /** The panel's uploader is not a public one. */
    public function test_a_stranger_cannot_upload(): void
    {
        $this->postJson('/api/upload', ['image' => UploadedFile::fake()->image('room.jpg')])
            ->assertUnauthorized();
    }
}
