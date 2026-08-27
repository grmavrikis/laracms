<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Services\RichTextDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Rich text is stored as an editor document, not as HTML. The document is
 * rebuilt on write from known node types only, so anything the CMS does not
 * understand has nowhere to live.
 */
class RichTextDocumentTest extends TestCase
{
    use RefreshDatabase;

    private function richText(): RichTextDocument
    {
        return app(RichTextDocument::class);
    }

    private function doc(array ...$nodes): array
    {
        return ['type' => 'doc', 'content' => $nodes];
    }

    private function paragraphWith(array $textNode): array
    {
        return ['type' => 'paragraph', 'content' => [$textNode]];
    }

    public function test_unknown_node_types_are_dropped(): void
    {
        $result = $this->richText()->normalize($this->doc(
            ['type' => 'script', 'content' => [['type' => 'text', 'text' => 'alert(1)']]],
            ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'kept']]],
        ));

        $this->assertCount(1, $result['content']);
        $this->assertSame('paragraph', $result['content'][0]['type']);
    }

    public function test_unknown_marks_are_dropped(): void
    {
        $result = $this->richText()->normalize($this->doc(
            $this->paragraphWith([
                'type' => 'text',
                'text' => 'hi',
                'marks' => [['type' => 'bold'], ['type' => 'onclick'], ['type' => 'script']],
            ])
        ));

        $marks = $result['content'][0]['content'][0]['marks'];

        $this->assertSame([['type' => 'bold']], $marks);
    }

    public static function unsafeLinkProvider(): array
    {
        return [
            'javascript' => ['javascript:alert(1)'],
            'javascript with tab' => ["jav\tascript:alert(1)"],
            'javascript with newline' => ["jav\nascript:alert(1)"],
            'data html' => ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
            'vbscript' => ['vbscript:msgbox(1)'],
            'relative' => ['/not-absolute'],
            'empty' => [''],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('unsafeLinkProvider')]
    public function test_unsafe_link_targets_drop_the_link_mark(string $href): void
    {
        $result = $this->richText()->normalize($this->doc(
            $this->paragraphWith([
                'type' => 'text',
                'text' => 'click',
                'marks' => [['type' => 'link', 'attrs' => ['href' => $href]]],
            ])
        ));

        $textNode = $result['content'][0]['content'][0];

        // The text survives; only the link is gone.
        $this->assertSame('click', $textNode['text']);
        $this->assertArrayNotHasKey('marks', $textNode);
    }

    public function test_safe_link_is_kept_with_fixed_rel_and_target(): void
    {
        $result = $this->richText()->normalize($this->doc(
            $this->paragraphWith([
                'type' => 'text',
                'text' => 'click',
                'marks' => [['type' => 'link', 'attrs' => [
                    'href' => 'https://example.test/page',
                    'target' => '_self',
                    'rel' => 'opener',
                ]]],
            ])
        ));

        $mark = $result['content'][0]['content'][0]['marks'][0];

        $this->assertSame('https://example.test/page', $mark['attrs']['href']);
        // target/rel come from the server, not from the payload.
        $this->assertSame('_blank', $mark['attrs']['target']);
        $this->assertStringContainsString('noopener', $mark['attrs']['rel']);
    }

    public function test_attribute_values_are_validated(): void
    {
        $result = $this->richText()->normalize($this->doc(
            ['type' => 'heading', 'attrs' => ['level' => 99, 'textAlign' => 'evil'],
                'content' => [['type' => 'text', 'text' => 'x']]],
            ['type' => 'paragraph', 'attrs' => ['textAlign' => 'center'],
                'content' => [['type' => 'text', 'text' => 'y']]],
        ));

        // level 99 and an unknown alignment are discarded...
        $this->assertArrayNotHasKey('attrs', $result['content'][0]);
        // ...while a valid alignment survives.
        $this->assertSame('center', $result['content'][1]['attrs']['textAlign']);
    }

    public function test_highlight_colour_must_be_a_hex_value(): void
    {
        $result = $this->richText()->normalize($this->doc(
            $this->paragraphWith([
                'type' => 'text',
                'text' => 'hi',
                'marks' => [['type' => 'highlight', 'attrs' => ['color' => 'url(javascript:alert(1))']]],
            ])
        ));

        $mark = $result['content'][0]['content'][0]['marks'][0];

        $this->assertSame('highlight', $mark['type']);
        $this->assertArrayNotHasKey('attrs', $mark);
    }

    public function test_markup_inside_text_stays_text(): void
    {
        $result = $this->richText()->normalize($this->doc(
            $this->paragraphWith(['type' => 'text', 'text' => '<script>alert(1)</script>'])
        ));

        // Text is rendered as text and escaped by React, so it is stored
        // verbatim rather than filtered.
        $this->assertSame('<script>alert(1)</script>', $result['content'][0]['content'][0]['text']);
    }

    public function test_garbage_input_becomes_an_empty_document(): void
    {
        foreach ([null, 'a string', 42, ['type' => 'paragraph'], []] as $input)
        {
            $result = $this->richText()->normalize($input);

            $this->assertSame('doc', $result['type']);
            $this->assertSame(RichTextDocument::empty(), $result);
        }
    }

    public function test_excessively_nested_documents_are_cut_off(): void
    {
        $node = ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'deep']]];

        for ($i = 0; $i < 60; $i++)
        {
            $node = ['type' => 'blockquote', 'content' => [$node]];
        }

        $result = $this->richText()->normalize($this->doc($node));

        $this->assertLessThan(60, $this->depthOf($result));
    }

    private function depthOf(array $node): int
    {
        $children = $node['content'] ?? [];

        if (!is_array($children) || $children === [])
        {
            return 1;
        }

        return 1 + max(array_map(fn($child) => $this->depthOf($child), $children));
    }

    public function test_translatable_fields_are_normalized_per_language(): void
    {
        $schema = [['name' => 'intro', 'type' => 'text', 'translatable' => true]];

        $result = $this->richText()->normalizeEntryData($schema, [
            'intro' => [
                'en' => $this->doc(['type' => 'script', 'content' => []]),
                'gr' => $this->doc($this->paragraphWith(['type' => 'text', 'text' => 'γεια'])),
                'fr' => null,
            ],
        ]);

        $this->assertSame(RichTextDocument::empty(), $result['intro']['en']);
        $this->assertSame('γεια', $result['intro']['gr']['content'][0]['content'][0]['text']);
        $this->assertNull($result['intro']['fr']);
    }

    public function test_non_rich_text_fields_are_untouched(): void
    {
        $schema = [['name' => 'headline', 'type' => 'string', 'translatable' => false]];

        $result = $this->richText()->normalizeEntryData($schema, ['headline' => 'a < b & c']);

        $this->assertSame('a < b & c', $result['headline']);
    }

    public function test_plain_text_extraction_flattens_the_document(): void
    {
        $text = $this->richText()->toPlainText($this->doc(
            ['type' => 'heading', 'attrs' => ['level' => 1],
                'content' => [['type' => 'text', 'text' => 'Τίτλος']]],
            $this->paragraphWith(['type' => 'text', 'text' => 'Κείμενο']),
        ));

        $this->assertSame('Τίτλος Κείμενο', $text);
    }

    public function test_document_posted_through_the_api_is_stored_normalized(): void
    {
        $owner = User::factory()->create();

        $module = Module::create([
            'user_id' => $owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [['name' => 'body', 'type' => 'text', 'translatable' => false]],
        ]);

        $this->actingAs($owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => [
                    'body' => $this->doc(
                        ['type' => 'script', 'content' => [['type' => 'text', 'text' => 'alert(1)']]],
                        $this->paragraphWith([
                            'type' => 'text',
                            'text' => 'kept',
                            'marks' => [['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']]],
                        ]),
                    ),
                ],
            ])
            ->assertCreated();

        $stored = $module->entries()->sole()->data['body'];

        $this->assertCount(1, $stored['content']);
        $this->assertSame('kept', $stored['content'][0]['content'][0]['text']);
        $this->assertArrayNotHasKey('marks', $stored['content'][0]['content'][0]);
    }

    public function test_a_plain_string_is_rejected_for_a_rich_text_field(): void
    {
        $owner = User::factory()->create();

        $module = Module::create([
            'user_id' => $owner->id,
            'name' => 'Posts',
            'slug' => 'posts',
            'schema' => [['name' => 'body', 'type' => 'text', 'translatable' => false]],
        ]);

        $this->actingAs($owner)
            ->postJson("/api/modules/{$module->slug}/entries", [
                'data' => ['body' => '<p>legacy html</p>'],
            ])
            ->assertStatus(422);
    }
}
