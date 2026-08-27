<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Services\RichTextSanitizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Rich-text fields hold HTML. The Tiptap editor is not a security boundary -
 * the API can be called directly - so the HTML must be cleaned server-side
 * before it is stored.
 */
class RichTextSanitizationTest extends TestCase
{
    use RefreshDatabase;

    private function sanitizer(): RichTextSanitizer
    {
        return app(RichTextSanitizer::class);
    }

    private function makeModule(User $owner): Module
    {
        return Module::create([
            'user_id' => $owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [
                ['name' => 'body', 'type' => 'text', 'translatable' => false],
                ['name' => 'intro', 'type' => 'text', 'translatable' => true],
                ['name' => 'headline', 'type' => 'string', 'translatable' => false],
            ],
        ]);
    }

    public static function dangerousHtmlProvider(): array
    {
        return [
            'script tag' => ['<p>hi</p><script>alert(1)</script>', 'alert(1)'],
            'event handler' => ['<img src=x onerror="alert(1)">', 'onerror'],
            'javascript href' => ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
            'iframe' => ['<iframe src="https://evil.test"></iframe>', '<iframe'],
            'svg onload' => ['<svg onload="alert(1)"></svg>', 'onload'],
            'style expression' => ['<p style="background:url(javascript:alert(1))">x</p>', 'javascript:'],
        ];
    }

    #[DataProvider('dangerousHtmlProvider')]
    public function test_dangerous_html_is_stripped(string $input, string $mustNotContain): void
    {
        $clean = $this->sanitizer()->clean($input);

        $this->assertStringNotContainsString($mustNotContain, $clean);
    }

    public function test_legitimate_editor_output_survives(): void
    {
        $html = '<h2>Title</h2><p><strong>bold</strong> <em>italic</em> '
            . '<s>strike</s> <mark>highlight</mark></p>'
            . '<ul><li>one</li></ul><blockquote>quote</blockquote>';

        $clean = $this->sanitizer()->clean($html);

        foreach (['<h2>', '<strong>', '<em>', '<s>', '<mark>', '<ul>', '<li>', '<blockquote>'] as $tag)
        {
            $this->assertStringContainsString($tag, $clean);
        }
    }

    public function test_text_align_is_kept_but_other_css_is_dropped(): void
    {
        $clean = $this->sanitizer()->clean(
            '<p style="text-align:center;position:fixed;top:0">centered</p>'
        );

        $this->assertStringContainsString('text-align', $clean);
        $this->assertStringNotContainsString('position', $clean);
    }

    public function test_non_rich_text_fields_are_left_alone(): void
    {
        $schema = [['name' => 'headline', 'type' => 'string', 'translatable' => false]];

        $result = $this->sanitizer()->sanitizeEntryData($schema, ['headline' => 'a < b & c']);

        // A plain string field is escaped by React on render; purifying it here
        // would corrupt legitimate text.
        $this->assertSame('a < b & c', $result['headline']);
    }

    public function test_translatable_rich_text_is_sanitized_per_language(): void
    {
        $schema = [['name' => 'intro', 'type' => 'text', 'translatable' => true]];

        $result = $this->sanitizer()->sanitizeEntryData($schema, [
            'intro' => [
                'en' => '<p>ok</p><script>alert(1)</script>',
                'el' => '<p>εντάξει</p><img src=x onerror="alert(1)">',
            ],
        ]);

        $this->assertStringNotContainsString('alert(1)', $result['intro']['en']);
        $this->assertStringNotContainsString('onerror', $result['intro']['el']);
        $this->assertStringContainsString('εντάξει', $result['intro']['el']);
    }

    public function test_entry_created_through_the_api_is_stored_sanitized(): void
    {
        $owner = User::factory()->create();
        $module = $this->makeModule($owner);

        $this->actingAs($owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => [
                    'headline' => 'Hello',
                    'body' => '<p>safe</p><script>alert("pwned")</script>',
                    'intro' => ['en' => '<p>hi</p><img src=x onerror="alert(1)">'],
                ],
            ])
            ->assertCreated();

        $stored = $module->entries()->sole()->data;

        $this->assertStringNotContainsString('<script', $stored['body']);
        $this->assertStringNotContainsString('onerror', $stored['intro']['en']);
        $this->assertStringContainsString('safe', $stored['body']);
    }

    public function test_entry_updated_through_the_api_is_stored_sanitized(): void
    {
        $owner = User::factory()->create();
        $module = $this->makeModule($owner);
        $entry = $module->entries()->create(['data' => ['body' => '<p>clean</p>']]);

        $this->actingAs($owner)
            ->putJson("/api/modules/{$module->slug}/entries/{$entry->id}", [
                'data' => [
                    'headline' => 'Hello',
                    'body' => '<p>still safe</p><script>alert(1)</script>',
                    'intro' => ['en' => '<p>hi</p>'],
                ],
            ])
            ->assertOk();

        $this->assertStringNotContainsString('<script', $entry->fresh()->data['body']);
    }
}
