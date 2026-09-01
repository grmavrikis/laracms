<?php

namespace Tests\Feature;

use App\Services\RichTextRenderer;
use Illuminate\Support\HtmlString;
use Tests\TestCase;

/**
 * Rich text is stored as a Tiptap document and nothing turned one into markup,
 * so no rich text could appear on a public page at all (TASKS.md #55).
 *
 * This is the counterpart to `RichTextDocument`: normalise on write, render on
 * read, from the same closed vocabulary. The renderer runs the document
 * through that normaliser first rather than keeping a second allowlist, so
 * there is one definition of what may exist and the renderer only ever walks
 * a tree that has already been rebuilt from it.
 *
 * The closed vocabulary makes the *structure* safe by construction - there is
 * no node type that could emit a script tag. It says nothing about the text
 * inside, which is stored verbatim on purpose, so escaping is the one thing
 * this class must never get wrong. Most of what follows is about that.
 */
class RichTextRendererTest extends TestCase
{
    private RichTextRenderer $renderer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->renderer = app(RichTextRenderer::class);
    }

    private function render(mixed $document): string
    {
        return (string) $this->renderer->toHtml($document);
    }

    private function doc(array ...$content): array
    {
        return ['type' => 'doc', 'content' => $content];
    }

    private function paragraph(array ...$content): array
    {
        return ['type' => 'paragraph', 'content' => $content];
    }

    private function text(string $value, array $marks = []): array
    {
        return $marks === []
            ? ['type' => 'text', 'text' => $value]
            : ['type' => 'text', 'text' => $value, 'marks' => $marks];
    }

    // ---------------------------------------------------------------- safety

    /**
     * The whole point of storing a document rather than HTML. A tag typed as
     * text is text, and has to leave here as text.
     */
    public function test_markup_typed_as_text_is_escaped(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('<script>alert(1)</script>')
        )));

        $this->assertSame('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', $html);
        $this->assertStringNotContainsString('<script>', $html);
    }

    public function test_every_dangerous_character_in_text_is_escaped(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('a & b < c > d " e \' f')
        )));

        $this->assertSame('<p>a &amp; b &lt; c &gt; d &quot; e &#039; f</p>', $html);
    }

    /**
     * An attribute is the other way out. `"` closing the attribute early would
     * let anything follow it.
     */
    public function test_a_quote_cannot_escape_an_attribute(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('link', [[
                'type' => 'link',
                'attrs' => ['href' => 'https://example.com/?a="onmouseover="alert(1)'],
            ]])
        )));

        $this->assertStringNotContainsString('onmouseover="alert', $html);
        $this->assertStringContainsString('&quot;', $html);
    }

    /**
     * Dropped by the normaliser before the renderer sees it - which is the
     * point of running the document through it rather than trusting the store.
     */
    public function test_a_javascript_link_renders_as_plain_text(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('click me', [[
                'type' => 'link',
                'attrs' => ['href' => 'javascript:alert(1)'],
            ]])
        )));

        $this->assertSame('<p>click me</p>', $html);
        $this->assertStringNotContainsString('javascript', $html);
    }

    public function test_a_node_type_nobody_declared_produces_nothing(): void
    {
        $html = $this->render($this->doc(
            ['type' => 'script', 'content' => [$this->text('alert(1)')]],
            $this->paragraph($this->text('kept'))
        ));

        $this->assertSame('<p>kept</p>', $html);
    }

    public function test_an_unknown_mark_leaves_the_text_alone(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('plain', [['type' => 'onclick']])
        )));

        $this->assertSame('<p>plain</p>', $html);
    }

    /**
     * htmlspecialchars returns an empty string for malformed UTF-8 unless told
     * otherwise, which would silently drop a paragraph rather than mangle it.
     */
    public function test_malformed_utf8_does_not_empty_the_output(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text("before \xB1\x31\x8B after")
        )));

        $this->assertStringContainsString('before', $html);
        $this->assertStringContainsString('after', $html);
    }

    // ----------------------------------------------------------- the mapping

    public function test_paragraphs_and_headings(): void
    {
        $html = $this->render($this->doc(
            ['type' => 'heading', 'attrs' => ['level' => 2], 'content' => [$this->text('Title')]],
            $this->paragraph($this->text('Body'))
        ));

        $this->assertSame('<h2>Title</h2><p>Body</p>', $html);
    }

    public function test_alignment_becomes_a_style(): void
    {
        $html = $this->render($this->doc(
            ['type' => 'paragraph', 'attrs' => ['textAlign' => 'center'], 'content' => [$this->text('Middle')]]
        ));

        $this->assertSame('<p style="text-align: center">Middle</p>', $html);
    }

    public function test_lists(): void
    {
        $item = fn(string $t) => ['type' => 'listItem', 'content' => [$this->paragraph($this->text($t))]];

        $this->assertSame(
            '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
            $this->render($this->doc(['type' => 'bulletList', 'content' => [$item('one'), $item('two')]]))
        );

        $this->assertSame(
            '<ol start="3"><li><p>three</p></li></ol>',
            $this->render($this->doc([
                'type' => 'orderedList',
                'attrs' => ['start' => 3],
                'content' => [$item('three')],
            ]))
        );
    }

    /**
     * `start="1"` is the default, so emitting it would be noise in every list.
     */
    public function test_an_ordered_list_starting_at_one_carries_no_start(): void
    {
        $html = $this->render($this->doc([
            'type' => 'orderedList',
            'attrs' => ['start' => 1],
            'content' => [['type' => 'listItem', 'content' => [$this->paragraph($this->text('a'))]]],
        ]));

        $this->assertStringNotContainsString('start=', $html);
    }

    public function test_blockquote_and_horizontal_rule_and_hard_break(): void
    {
        $html = $this->render($this->doc(
            ['type' => 'blockquote', 'content' => [$this->paragraph($this->text('quoted'))]],
            ['type' => 'horizontalRule'],
            $this->paragraph($this->text('a'), ['type' => 'hardBreak'], $this->text('b'))
        ));

        $this->assertSame('<blockquote><p>quoted</p></blockquote><hr><p>a<br>b</p>', $html);
    }

    public function test_a_code_block_carries_its_language_as_a_class(): void
    {
        $html = $this->render($this->doc([
            'type' => 'codeBlock',
            'attrs' => ['language' => 'php'],
            'content' => [$this->text('echo "<b>";')],
        ]));

        $this->assertSame(
            '<pre><code class="language-php">echo &quot;&lt;b&gt;&quot;;</code></pre>',
            $html
        );
    }

    public function test_a_code_block_without_a_language(): void
    {
        $html = $this->render($this->doc([
            'type' => 'codeBlock',
            'content' => [$this->text('plain')],
        ]));

        $this->assertSame('<pre><code>plain</code></pre>', $html);
    }

    // ------------------------------------------------------------------ marks

    public function test_each_mark_has_its_tag(): void
    {
        $cases = [
            'bold' => 'strong',
            'italic' => 'em',
            'strike' => 's',
            'underline' => 'u',
            'code' => 'code',
        ];

        foreach ($cases as $mark => $tag)
        {
            $this->assertSame(
                "<p><{$tag}>x</{$tag}></p>",
                $this->render($this->doc($this->paragraph($this->text('x', [['type' => $mark]])))),
                "Mark '{$mark}' should render as <{$tag}>."
            );
        }
    }

    public function test_marks_nest_in_the_order_they_are_given(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('x', [['type' => 'bold'], ['type' => 'italic']])
        )));

        $this->assertSame('<p><strong><em>x</em></strong></p>', $html);
    }

    public function test_a_highlight_carries_its_colour(): void
    {
        $this->assertSame(
            '<p><mark style="background-color: #ffcc00">x</mark></p>',
            $this->render($this->doc($this->paragraph(
                $this->text('x', [['type' => 'highlight', 'attrs' => ['color' => '#ffcc00']]])
            )))
        );

        $this->assertSame(
            '<p><mark>x</mark></p>',
            $this->render($this->doc($this->paragraph($this->text('x', [['type' => 'highlight']]))))
        );
    }

    /**
     * `target` and `rel` are set by the normaliser rather than taken from the
     * payload, so a stored link cannot opt out of them.
     */
    public function test_a_link_carries_the_rel_the_normaliser_fixed(): void
    {
        $html = $this->render($this->doc($this->paragraph(
            $this->text('site', [[
                'type' => 'link',
                'attrs' => ['href' => 'https://example.com', 'target' => '_self', 'rel' => ''],
            ]])
        )));

        $this->assertSame(
            '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a></p>',
            $html
        );
    }

    // ------------------------------------------------------------ the edges

    public function test_an_empty_document_renders_an_empty_paragraph(): void
    {
        // Faithful rather than clever: the normaliser's empty document is one
        // childless paragraph, and that is what it is. Whether a field should
        // have been filled at all is TASKS.md #36, not this class's guess.
        $this->assertSame('<p></p>', $this->render(['type' => 'doc', 'content' => []]));
    }

    public function test_anything_that_is_not_a_document_renders_as_an_empty_paragraph(): void
    {
        foreach ([null, '', 'a string', 42, ['not' => 'a doc']] as $value)
        {
            $this->assertSame('<p></p>', $this->render($value));
        }
    }

    /**
     * Returned as an HtmlString so a Blade template writes `{{ }}` and never
     * `{!! !!}`. The claim that this output is safe is then made once, here,
     * instead of at every call site - the same reasoning that keeps
     * `dangerouslySetInnerHTML` out of the React side.
     */
    public function test_it_returns_html_that_blade_will_not_escape_again(): void
    {
        $rendered = $this->renderer->toHtml($this->doc($this->paragraph($this->text('x'))));

        $this->assertInstanceOf(HtmlString::class, $rendered);
    }
}
