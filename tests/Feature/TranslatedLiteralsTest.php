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

        $this->directory = storage_path('framework/testing/literals');
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
