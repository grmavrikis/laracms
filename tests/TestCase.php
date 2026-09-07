<?php

namespace Tests;

use App\Models\Language;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
    /**
     * What each code is called, so a test names a language rather than
     * spelling one out.
     *
     * The list is short on purpose: these are the languages the suite's worlds
     * are built from, not a catalogue of the ones a client might buy.
     */
    private const LANGUAGE_NAMES = [
        'el' => 'Greek',
        'en' => 'English',
        'fr' => 'French',
        'de' => 'German',
        'it' => 'Italian',
    ];
    protected function setUp(): void
    {
        parent::setUp();

        /*
         * **No test may touch the directory this machine is serving** (#97).
         *
         * Every Entry, Module, Setting and Language write goes through
         * `StaticPageObserver`, and a Module write calls `StaticPages::flush()`
         * - which deletes the whole directory. With the default configuration
         * that directory is `public/cache`, so running the suite quietly
         * emptied the baked site of the development install. Nothing broke,
         * because pages rebuild on the next visit, but on a machine where
         * `public/cache` is what visitors are being served it is a test suite
         * taking the site offline for a moment.
         *
         * Found by `pages:doctor` refusing to run straight after `artisan
         * test`. It belongs here rather than in `phpunit.xml` because the value
         * is a path that has to be resolved, and here `storage_path()` can do
         * it. `StaticPagesTest` narrows it further, to one directory per
         * process.
         */
        $pages = storage_path('framework/testing/pages');

        config(['site.pages' => $pages]);

        // Emptied per test, not merely redirected. One shared directory that
        // nothing cleans lets a file written by one test decide the answer of
        // the next, and survives between runs - so a test can pass on the
        // second run for a reason that did not exist on the first. That is the
        // same shape as the `.env` leak #97 fixed, one directory along.
        File::deleteDirectory($pages);
    }

    /**
     * The content languages this test's site has, in order. **The first is the
     * default** (TASKS.md #98).
     *
     * Fourteen test files were writing the same two `Language::create` calls,
     * which is fourteen places to edit when a column moves - and long enough
     * that what a test's world actually *is* got lost in the setting up of it.
     * `$this->languages('el', 'en')` says it in one line.
     *
     * **A helper rather than a seeder**, by the rule in TASKS.md -> Decisions:
     * a test builds the world it needs and says so out loud, because a seeder
     * makes every test depend on a fixture none of them names.
     *
     * **The first is the default only if the site has not got one**, so a test
     * that adds a language part way through - the site gaining French, which is
     * a real thing to test - does not quietly move the default onto it.
     *
     * @return array<string, Language> keyed by code, for a test that needs the row
     */
    protected function languages(string ...$codes): array
    {
        $default = !Language::query()->where('is_default', true)->exists();

        $languages = [];

        foreach ($codes as $index => $code)
        {
            $languages[$code] = Language::create([
                'name' => self::LANGUAGE_NAMES[$code] ?? strtoupper($code),
                'code' => $code,
                'is_default' => $index === 0 && $default,
            ]);
        }

        return $languages;
    }

    /**
     * A language the agency has inserted but the site does not publish yet.
     *
     * Separate from the list above because it is never the point of a test in
     * passing: it is there to be translated into ahead of going live (#114),
     * and the tests that create one are testing exactly that.
     */
    protected function inactiveLanguage(string $code): Language
    {
        return Language::create([
            'name' => self::LANGUAGE_NAMES[$code] ?? strtoupper($code),
            'code' => $code,
            'is_active' => false,
        ]);
    }
}
