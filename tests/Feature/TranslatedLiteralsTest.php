<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\Support\TranslatedLiterals;
use Tests\TestCase;

/**
 * The scan both catalogue tests stand on (TASKS.md #117 item 20).
 *
 * It had never been tested itself, and it was **silently reading a third of
 * some files**. A file picker's `accept` attribute ends in a slash and a star,
 * which the comment stripper took for the start of a block comment - so
 * everything from there to the next real comment terminator was thrown away
 * before the scan ran. In `GalleryEditor.jsx` that was 4,700 characters and
 * every translated string inside them.
 *
 * (This docblock cannot spell the sequence out, for the same reason.)
 *
 * The consequence is the whole point of the mechanism reversed:
 * `CatalogueCoversTheCodeTest` was passing on those files **because it could
 * not see them**, which is exactly the guarantee it exists to make -
 * that a Greek page never ships an English word. Three files carry an image
 * picker, and all three were affected.
 *
 * It surfaced from the other direction: the orphan test reported twenty-one
 * keys as unused that were plainly in use, and the shadow they cast was the
 * hole.
 */
class TranslatedLiteralsTest extends TestCase
{
    private string $directory;

    protected function setUp(): void
    {
        parent::setUp();

        // Per process: `php artisan test --parallel` runs classes in separate
        // processes against the same storage path, and `tearDown` deletes the
        // directory - one of them mid-scan for another.
        $this->directory = storage_path('framework/testing/literals-' . getmypid());
        File::ensureDirectoryExists($this->directory);
        File::cleanDirectory($this->directory);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->directory);

        parent::tearDown();
    }

    private function write(string $name, string $contents): void
    {
        File::put($this->directory . '/' . $name, $contents);
    }

    public function test_it_reads_a_translated_string(): void
    {
        $this->write('Plain.jsx', "const a = t('Save entry');");

        $this->assertArrayHasKey('Save entry', TranslatedLiterals::inJavaScript($this->directory));
    }

    /**
     * The defect. `image/*` is a mime pattern, not the start of a comment, and
     * treating it as one swallowed the rest of the file.
     */
    public function test_a_mime_pattern_does_not_swallow_the_file(): void
    {
        $this->write('Picker.jsx', <<<'JSX'
            <input type="file" accept="image/*" />
            const label = t('Behind the picker');
            {/* a real comment */}
            const after = t('After the comment');
            JSX);

        $found = TranslatedLiterals::inJavaScript($this->directory);

        $this->assertArrayHasKey('Behind the picker', $found);
        $this->assertArrayHasKey('After the comment', $found);
    }

    /** A comment mentioning a call is not a call - the reason stripping exists. */
    public function test_it_ignores_a_call_written_inside_a_comment(): void
    {
        $this->write('Commented.jsx', <<<'JSX'
            /**
             * Explains the rule, with an example: t('Only In A Docblock').
             */
            const a = t('Actually Called');
            // and a line comment: t('Only On A Line')
            JSX);

        $found = TranslatedLiterals::inJavaScript($this->directory);

        $this->assertArrayHasKey('Actually Called', $found);
        $this->assertArrayNotHasKey('Only In A Docblock', $found);
        $this->assertArrayNotHasKey('Only On A Line', $found);
    }

    /**
     * The gap the first fix left.
     *
     * Requiring whitespace or a brace before a comment opener fixed the mime
     * pattern and broke every comment that follows punctuation - `foo(/* … *\/)`,
     * `const a =/* … *\/ 1`, `foo(1,/* … *\/ 2)` were all left in place, so a
     * commented-out call counted as a real one. The rule is not "what precedes
     * it" but "is this slash part of a word": a mime pattern's is, a comment's
     * is not.
     *
     * @param  string  $opener  the character a real comment can follow
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('punctuationBeforeAComment')]
    public function test_a_comment_following_punctuation_is_still_a_comment(string $opener): void
    {
        $this->write('Punctuated.jsx', "foo({$opener}/* t('Only In A Comment') */); const a = t('Real Call');");

        $found = TranslatedLiterals::inJavaScript($this->directory);

        $this->assertArrayHasKey('Real Call', $found);
        $this->assertArrayNotHasKey('Only In A Comment', $found);
    }

    /** @return array<string, array{string}> */
    public static function punctuationBeforeAComment(): array
    {
        return [
            'after an opening paren' => [''],
            'after a comma' => ['1,'],
            'after an equals' => ['x ='],
            'after a semicolon' => ['x;'],
        ];
    }

    /** A URL is not a comment either. */
    public function test_a_url_does_not_swallow_the_line(): void
    {
        $this->write('Link.jsx', "const u = 'https://example.com'; const a = t('After A Url');");

        $this->assertArrayHasKey('After A Url', TranslatedLiterals::inJavaScript($this->directory));
    }

    /** `formatted(x)` is not `t(x)`, however it ends. */
    public function test_it_does_not_match_a_longer_function_name(): void
    {
        $this->write('Other.jsx', "const a = format('Not A Translation');");

        $this->assertArrayNotHasKey('Not A Translation', TranslatedLiterals::inJavaScript($this->directory));
    }

    /**
     * `inPhp` is the subtlest of the three - it walks the token stream, skips
     * whitespace and parentheses to reach the first argument, and unescapes
     * single- and double-quoted literals by different rules - and it moved
     * files with nothing exercising it directly.
     */
    public function test_it_reads_php_in_both_quote_styles(): void
    {
        $this->write('Messages.php', <<<'PHP'
            <?php
            $a = __('Single quoted');
            $b = __("Double quoted");
            $c = __('It\'s escaped');
            $d = __("Line\nbreak");
            $e = __($variable);
            PHP);

        $found = TranslatedLiterals::inPhp($this->directory);

        $this->assertArrayHasKey('Single quoted', $found);
        $this->assertArrayHasKey('Double quoted', $found);
        $this->assertArrayHasKey("It's escaped", $found);
        $this->assertArrayHasKey("Line\nbreak", $found);
        $this->assertCount(4, $found, 'a variable argument cannot be read and must not be guessed at');
    }

    /** A comment mentioning a call is not a call - why PHP is read as tokens. */
    public function test_it_ignores_a_php_call_written_in_a_comment(): void
    {
        $this->write('Commented.php', <<<'PHP'
            <?php
            // Explains the mechanism: __('Only In A PHP Comment')
            /* and a block: __('Only In A PHP Block') */
            $a = __('Actually Called In Php');
            PHP);

        $found = TranslatedLiterals::inPhp($this->directory);

        $this->assertArrayHasKey('Actually Called In Php', $found);
        $this->assertArrayNotHasKey('Only In A PHP Comment', $found);
        $this->assertArrayNotHasKey('Only In A PHP Block', $found);
    }

    public function test_it_reads_a_blade_template_and_skips_its_comments(): void
    {
        $this->write('page.blade.php', <<<'BLADE'
            {{-- A Blade comment: __('Only In A Blade Comment') --}}
            <h1>{{ __('In A Template') }}</h1>
            BLADE);

        $found = TranslatedLiterals::inBlade($this->directory);

        $this->assertArrayHasKey('In A Template', $found);
        $this->assertArrayNotHasKey('Only In A Blade Comment', $found);
    }

    /**
     * A test file is not a call site that ships.
     *
     * The skip list was written when only one direction existed, where a
     * stray literal in a test was merely demanded of the catalogue. Now that
     * the orphan check reads the same scan, a `t('…')` in a component test
     * would keep a dead key alive.
     */
    public function test_it_ignores_test_files_whatever_their_extension(): void
    {
        $this->write('Thing.test.js', "const a = t('Only In A Js Test');");
        $this->write('Thing.test.jsx', "const a = t('Only In A Jsx Test');");
        $this->write('Thing.jsx', "const a = t('In The Panel');");

        $found = TranslatedLiterals::inJavaScript($this->directory);

        $this->assertArrayHasKey('In The Panel', $found);
        $this->assertArrayNotHasKey('Only In A Js Test', $found);
        $this->assertArrayNotHasKey('Only In A Jsx Test', $found);
    }

    /**
     * A guard against the scan quietly reading nothing, which is how a hole
     * like the one above stays invisible: every test downstream passes.
     */
    public function test_the_real_panel_yields_a_plausible_number_of_strings(): void
    {
        $found = TranslatedLiterals::inJavaScript(resource_path('js'));

        $this->assertGreaterThan(200, count($found));
        $this->assertArrayHasKey('No images yet.', $found, 'GalleryEditor.jsx is being read');
        $this->assertArrayHasKey('Contact details', $found, 'SettingsManager.jsx is being read');
        $this->assertArrayHasKey('Remove image', $found, 'FieldInput.jsx is being read');
    }
}
