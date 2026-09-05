<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Core code and per-client code live on opposite sides of one line
 * (TASKS.md #61).
 *
 * **Core** is everything that ships to every installation unchanged: the admin
 * panel, the API, the schema system, the public rendering machinery. **Site**
 * is what differs per client: the theme, the menu, any routes this one site
 * needs. Client #2 is a copy of `site/` against the same core.
 *
 * The line is what makes that copy mechanical, and a line nothing checks is a
 * convention people drift across. So it is checked here:
 *
 *   - core must not name the site side. The moment `app/` refers to a
 *     particular client's template or route, the two are welded together and
 *     the second client needs a fork rather than a directory;
 *   - the site side must exist and be reachable, or the boundary is a story
 *     rather than a structure.
 *
 * Deliberately mechanical: it greps. A boundary held by discipline is one
 * nobody notices breaking.
 */
class CoreSiteBoundaryTest extends TestCase
{
    private const SITE = 'site';

    /** @return array<int, string> */
    private function phpFilesIn(string $directory): array
    {
        $files = [];

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator(base_path($directory), \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file)
        {
            if ($file->isFile() && $file->getExtension() === 'php')
            {
                $files[] = $file->getPathname();
            }
        }

        return $files;
    }

    public function test_the_site_side_exists(): void
    {
        $this->assertDirectoryExists(base_path(self::SITE), 'The per-client side of the line is missing.');
        $this->assertDirectoryExists(base_path(self::SITE . '/theme'));
        $this->assertFileExists(base_path(self::SITE . '/README.md'), 'A boundary nobody can read is not a boundary.');
    }

    /**
     * The theme is reached through a namespace, so core templates and a
     * client's cannot collide and the client's directory can be swapped whole.
     */
    public function test_the_theme_is_registered_under_its_own_namespace(): void
    {
        $this->assertTrue(
            view()->exists('theme::layout'),
            "The theme namespace is not registered, so `theme::` resolves nowhere."
        );
    }

    /**
     * The one rule that matters, and its exception.
     *
     * Core has to know **where the door is** - something must register the
     * view namespace and load the site's routes, or nothing on the client's
     * side is reachable at all. Those two mount points are named here, and
     * nowhere else in core may name the directory.
     *
     * Rendering `theme::entry` is not naming the directory: it is the
     * *contract* every theme fulfils, checked below.
     */
    public function test_only_the_mount_points_name_the_site_directory(): void
    {
        $mounts = [
            'app' . DIRECTORY_SEPARATOR . 'Providers' . DIRECTORY_SEPARATOR . 'AppServiceProvider.php',
            'routes' . DIRECTORY_SEPARATOR . 'web.php',
        ];

        $offenders = [];

        foreach (array_merge($this->phpFilesIn('app'), $this->phpFilesIn('routes')) as $file)
        {
            $relative = str_replace(base_path() . DIRECTORY_SEPARATOR, '', $file);

            if (in_array($relative, $mounts, true))
            {
                continue;
            }

            $contents = file_get_contents($file);

            if (str_contains($contents, "'site/")
                || str_contains($contents, '"site/')
                || str_contains($contents, 'App\\Site\\'))
            {
                $offenders[] = $relative;
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'Core names the per-client side outside the two mount points, '
            . 'so client #2 needs a fork rather than a copy: '
            . implode(', ', $offenders)
        );
    }

    /**
     * The contract, made checkable.
     *
     * Core renders `theme::layout`, `theme::entry` and the rest. A theme that
     * does not provide one of them is a site that 500s on a page nobody
     * thought to open - and the author of the next client's theme has no list
     * of what they owe. This is that list, read out of core itself.
     */
    public function test_the_theme_provides_every_template_core_renders(): void
    {
        $required = [];

        foreach ($this->phpFilesIn('app') as $file)
        {
            preg_match_all('#theme::([a-z0-9_.-]+)#i', file_get_contents($file), $matches);

            foreach ($matches[1] as $name)
            {
                $required[$name] = true;
            }
        }

        $this->assertNotEmpty($required, 'Core renders no theme template at all, which cannot be right.');

        foreach (array_keys($required) as $name)
        {
            $this->assertTrue(
                view()->exists("theme::{$name}"),
                "Core renders `theme::{$name}` and the theme does not provide it."
            );
        }
    }

    /**
     * The counterpart: nothing in `app/` should still be pointing at where the
     * theme used to be, or the move left half the application behind.
     */
    public function test_core_no_longer_renders_the_old_view_path(): void
    {
        $offenders = [];

        foreach ($this->phpFilesIn('app') as $file)
        {
            if (preg_match('#view\(\s*[\'"]site\.#', file_get_contents($file)))
            {
                $offenders[] = str_replace(base_path() . DIRECTORY_SEPARATOR, '', $file);
            }
        }

        $this->assertSame([], $offenders, 'Still rendering `site.*` rather than `theme::*`.');
    }

    /**
     * "Site" now means the client's side of the line, so a core namespace must
     * not claim the word - the public controllers are core machinery that
     * ships to everyone.
     */
    public function test_no_core_namespace_claims_the_word_site(): void
    {
        $this->assertDirectoryDoesNotExist(
            app_path('Http/Controllers/Site'),
            'A core controller directory called Site contradicts what `site/` means.'
        );
    }
}
