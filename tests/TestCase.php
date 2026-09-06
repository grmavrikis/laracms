<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\File;

abstract class TestCase extends BaseTestCase
{
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
}
