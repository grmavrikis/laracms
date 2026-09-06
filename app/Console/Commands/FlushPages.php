<?php

namespace App\Console\Commands;

use App\Services\StaticPages;
use Illuminate\Console\Command;

/**
 * Empty the baked site (TASKS.md #97).
 *
 * Separate from `pages:warm` on purpose, and the owner has the same two
 * buttons: emptying and filling are different decisions. "Something looks
 * wrong, clear it" wants the site answering from PHP again immediately;
 * "publish everything now" wants the opposite, and running them together
 * would make the first one impossible to ask for on its own.
 *
 * Safe to run at any time. An empty directory is not a broken site, it is a
 * slower one - every request goes to PHP, which is exactly what happened
 * before #97.
 */
class FlushPages extends Command
{
    protected $signature = 'pages:flush';

    protected $description = 'Delete every baked page, sending visitors back to PHP';

    public function handle(StaticPages $pages): int
    {
        $directory = $pages->directory();

        $pages->flush();

        $this->components->info('Emptied ' . $directory . '. Every page is served by PHP until it is visited again.');

        return self::SUCCESS;
    }
}
