<?php

namespace Tests\Feature;

use App\Http\Controllers\Web\SitemapController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Core code and per-client code live on opposite sides of one line
 * (TASKS.md #61).
 *
 * **Core** is everything that ships to every installation unchanged: the admin
 * panel, the API, the schema system, the public rendering machinery, and
 * anything whose shape is fixed by a protocol rather than by taste. **Site**
 * is what differs per client: the theme, the menu, the routes this one site
 * needs. Client #2 is a copy of `site/` against the same core.
 *
 * The line is what makes that copy mechanical, and a line nothing checks is a
 * convention people drift across. So it is checked here, in both directions:
 *
 *   - core must not name the site side, except at the mount points that make
 *     it reachable at all;
 *   - **all three mounts** must actually work - the theme, the routes file and
 *     the translations - and the theme must provide every template core
 *     renders.
 *
 * Deliberately mechanical. A boundary held by discipline is one nobody
 * notices breaking.
 */
class CoreSiteBoundaryTest extends TestCase
{
    private const SITE = 'site';

    /**
     * The directories that ship to every installation.
     *
     * `app/` and `routes/` are the obvious ones; the rest are here because a
     * seeder that reads a client's file, or a config default pointing into
     * their directory, welds core to one installation exactly as a controller
     * would.
     */
    private const CORE = ['app', 'routes', 'bootstrap', 'config', 'database'];

    /**
     * The two places core is allowed to say where the client's side is. Both
     * name the *location* and neither names anything inside it.
     */
    private const MOUNTS = [
        'config/site.php',
        'app/Providers/AppServiceProvider.php',
        'routes/web.php',
    ];

    /** Directory walks are shared: three tests scan the same five trees. */
    private static array $files = [];

    /** @return array<int, string> */
    private function phpFilesIn(string $directory): array
    {
        return self::$files[$directory] ??= collect(File::allFiles(base_path($directory)))
            ->filter(fn($file) => $file->getExtension() === 'php')
            ->map(fn($file) => $file->getPathname())
            ->values()
            ->all();
    }

    /** Repo-relative, with forward slashes, so MOUNTS compares the same everywhere. */
    private function relative(string $path): string
    {
        return str_replace('\\', '/', Str::after($path, base_path() . DIRECTORY_SEPARATOR));
    }

    /**
     * Run the application with a client's routes file of our own.
     *
     * Nothing under version control is written. The earlier version of this
     * overwrote the repository's own `site/routes.php` and restored it in a
     * `finally` - which does not run on a fatal error or an interrupted
     * process, so a cancelled test run left the app serving probe routes.
     * `config/site.php` reads the path from the environment for exactly this.
     */
    private function withSiteRoutes(string $php, callable $assertions): void
    {
        $temp = tempnam(sys_get_temp_dir(), 'zz-site-routes-') . '.php';
        file_put_contents($temp, $php);

        putenv('SITE_ROUTES=' . $temp);
        $_ENV['SITE_ROUTES'] = $temp;
        $_SERVER['SITE_ROUTES'] = $temp;

        try
        {
            $this->refreshApplication();

            $assertions();
        }
        finally
        {
            putenv('SITE_ROUTES');
            unset($_ENV['SITE_ROUTES'], $_SERVER['SITE_ROUTES']);

            @unlink($temp);

            $this->refreshApplication();
        }
    }

    // ---------------------------------------------------------- the shape

    public function test_the_site_side_exists(): void
    {
        $this->assertDirectoryExists(base_path(self::SITE), 'The per-client side of the line is missing.');
        $this->assertDirectoryExists(base_path(self::SITE . '/theme'));
        $this->assertFileExists(base_path(self::SITE . '/README.md'), 'A boundary nobody can read is not a boundary.');
        $this->assertFileExists(base_path(self::SITE . '/routes.php'));
    }

    /**
     * The sitemap is not a theme.
     *
     * Its structure is fixed by sitemaps.org and by the hreflang work, not by
     * anybody's design, and a client theme that mangled or omitted it would
     * break indexing silently - the one failure invisible from inside the
     * panel. It stays where a client cannot reach it.
     */
    public function test_the_sitemap_is_core_rather_than_theme(): void
    {
        $this->assertFileExists(resource_path('views/sitemap.blade.php'));
        $this->assertFileDoesNotExist(base_path(self::SITE . '/theme/sitemap.blade.php'));
    }

    // --------------------------------------------------------- the mounts

    public function test_the_theme_is_registered_under_its_own_namespace(): void
    {
        $this->assertTrue(
            view()->exists('theme::layout'),
            'The theme namespace is not registered, so `theme::` resolves nowhere.'
        );
    }

    /**
     * The other half of the mount, which nothing checked: `routes/web.php`
     * loads the site's routes, and deleting that line would leave every test
     * green while a client's routes silently stopped existing.
     *
     * Proved by loading a file of our own and asking for what it declares -
     * the only way to exercise a read that happens at boot.
     */
    public function test_the_sites_routes_are_loaded_and_take_precedence(): void
    {
        $this->withSiteRoutes(<<<'PHP'
            <?php

            use Illuminate\Support\Facades\Route;

            Route::get('/zz-boundary-probe', fn() => 'mounted');

            // Shaped like a core page, to prove a site route can take one over
            // rather than being shadowed by it.
            Route::get('/el/zz-probe-module', fn() => 'overridden');
            PHP, function ()
        {
            $this->get('/zz-boundary-probe')->assertOk()->assertSee('mounted');
            $this->get('/el/zz-probe-module')->assertOk()->assertSee('overridden');
        });
    }

    /**
     * Precedence has exactly two exceptions, and they are the ones a client
     * must not be able to break: the panel, because a site that locks its
     * owner out is a support call with no way back, and `sitemap.xml`, whose
     * shape is a protocol rather than a design.
     *
     * Both are declared above the site's routes, and that ordering is the
     * whole of the enforcement - so it is asserted rather than trusted.
     */
    public function test_a_site_route_cannot_take_over_the_panel_or_the_sitemap(): void
    {
        $this->withSiteRoutes(<<<'PHP'
            <?php

            use Illuminate\Support\Facades\Route;

            Route::get('/admin/{any?}', fn() => 'hijacked')->where('any', '.*');
            Route::get('/sitemap.xml', fn() => 'hijacked');
            PHP, function ()
        {
            // The panel renders a view and touches no database, so it can be
            // asked for directly.
            $this->get('/admin')->assertOk()->assertDontSee('hijacked');

            // The sitemap reads entries, and `refreshApplication()` builds a
            // fresh in-memory SQLite with no tables - so what is checked is
            // that the route resolves to core's controller rather than to the
            // client's closure, which is the thing at stake.
            $action = Route::getRoutes()->getByName('web.sitemap')?->getAction('controller');

            $this->assertSame(
                SitemapController::class . '@show',
                $action,
                '`/sitemap.xml` no longer resolves to core.'
            );
        });
    }

    /**
     * **The third mount, proven by loading something through it**
     * (TASKS.md #101, #106).
     *
     * `config/site.php` names three paths and `AppServiceProvider` mounts two
     * of them; this docblock promised "both mounts" while a third had arrived.
     * Worse, the test that stood for it - in `TranslationTest` - ended with
     * `assertSame('Name', __('Name', [], 'en'))`, and `__()` answers with the
     * key when there is no translation at all. It passed whether or not
     * `loadJsonTranslationsFrom` had ever been called, which a mutation run
     * confirmed: deleting the mount bit only a page-rendering test elsewhere.
     *
     * So it is proven the way the routes mount is: point the mount at a
     * directory of this test's own making, and ask for a word only that
     * directory could supply. That also exercises the `env()` override, which
     * is what lets a test move a mount at all.
     *
     * **It lives here rather than with the other translation tests**, and that
     * is a precondition rather than tidying: `refreshApplication()` builds a
     * new PDO, which on the `:memory:` SQLite the suite runs is an empty
     * database - so a class using `RefreshDatabase` cannot rebuild the
     * application without destroying the schema its other tests depend on.
     * This class does not use it.
     */
    public function test_the_translations_mount_loads_the_clients_catalogue(): void
    {
        $directory = storage_path('framework/testing/zz-site-lang-' . getmypid());

        File::ensureDirectoryExists($directory);
        File::put($directory . '/en.json', json_encode(['zz-probe-mount' => 'Loaded from the client']));

        putenv('SITE_LANG=' . $directory);
        $_ENV['SITE_LANG'] = $directory;
        $_SERVER['SITE_LANG'] = $directory;

        try
        {
            $this->refreshApplication();

            $this->assertSame(
                'Loaded from the client',
                __('zz-probe-mount', [], 'en'),
                'The client-side translations are not mounted: a key only their catalogue carries came back as itself.'
            );
        }
        finally
        {
            putenv('SITE_LANG');
            unset($_ENV['SITE_LANG'], $_SERVER['SITE_LANG']);

            File::deleteDirectory($directory);

            $this->refreshApplication();
        }
    }

    /**
     * A client's routes get the same parameter constraints core's do.
     *
     * Laravel merges the global patterns into a route **as it is created**
     * (`Router::addWhereClausesToRoute`), so the `Route::pattern` calls have
     * to come before the site's routes are loaded. Declared after them, a
     * client's `{language}` matched anything at all.
     */
    public function test_a_site_route_inherits_the_parameter_patterns(): void
    {
        $this->withSiteRoutes(<<<'PHP'
            <?php

            use Illuminate\Support\Facades\Route;

            Route::get('/{language}/zz-probe-pattern', fn(string $language) => $language);
            PHP, function ()
        {
            $this->get('/el/zz-probe-pattern')->assertOk()->assertSee('el');

            // Not two letters, so the pattern must refuse it.
            $this->get('/zzz-not-a-language/zz-probe-pattern')->assertNotFound();
        });
    }

    /**
     * **A page a client writes is rendered in the language of its address**
     * (TASKS.md #104).
     *
     * `site/routes.php` is required before the core pages so a client can take
     * an address over (#61), which put their routes outside the group carrying
     * the `locale` middleware. A contact page at `/el/epikoinonia` including
     * `theme::enquiry` rendered Greek prose around an English form, and nothing
     * could see it: the note saying clients "can opt in" lived in
     * `bootstrap/app.php`, which is not where somebody writing a route looks.
     *
     * **And the obvious fix would not have reached the obvious route.** The
     * middleware read `$request->route('language')`, and a hand-written
     * `/el/epikoinonia` has no parameters at all - so attaching it to the group
     * fixed nothing until it also learned to read the first segment.
     */
    public function test_a_site_route_is_rendered_in_the_language_of_its_address(): void
    {
        $this->withSiteRoutes(<<<'PHP'
            <?php

            use Illuminate\Support\Facades\Route;

            Route::get('/el/zz-probe-locale', fn() => __('Name'));
            Route::get('/zz-probe-locale', fn() => app()->getLocale());
            PHP, function ()
        {
            // **Read the default before asking, not after.**
            // `App::setLocale()` writes `config('app.locale')`, so comparing
            // the answer with that config value afterwards compares the
            // request's own effect with itself - it passed even when the
            // middleware accepted `zz-probe-locale` as a language. The same
            // shape as the assertion #101 was raised about.
            //
            // First, too: a locale set by one request stays set for the rest of
            // the process, and the test client reuses one application across
            // both calls.
            $default = config('app.locale');

            // A first segment that is not a language code leaves the locale
            // alone, which is every panel and sitemap address.
            $this->get('/zz-probe-locale')->assertOk()->assertSee($default);

            $this->assertSame($default, config('app.locale'), 'A segment that is not a language changed the locale.');

            // And the theme's own catalogue, reached from a route core never saw.
            $this->get('/el/zz-probe-locale')->assertOk()->assertSee('Όνομα', false);
        });
    }

    // ----------------------------------------------------------- the rule

    /**
     * Core has to know **where the door is** - something must register the
     * view namespace and load the site's routes, or nothing on the client's
     * side is reachable. Those two mount points are named here, and nowhere
     * else in core may name the directory.
     *
     * Rendering `theme::entry` is not naming the directory: it is the
     * *contract* every theme fulfils, checked below.
     */
    public function test_only_the_mount_points_name_the_site_directory(): void
    {
        $offenders = [];

        foreach (self::CORE as $directory)
        {
            foreach ($this->phpFilesIn($directory) as $file)
            {
                $relative = $this->relative($file);

                if (in_array($relative, self::MOUNTS, true))
                {
                    continue;
                }

                $contents = file_get_contents($file);

                if (str_contains($contents, "'" . self::SITE . '/')
                    || str_contains($contents, '"' . self::SITE . '/')
                    || str_contains($contents, 'App\\' . ucfirst(self::SITE) . '\\'))
                {
                    $offenders[] = $relative;
                }
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
     * The list is read out of core's **render calls** rather than out of its
     * text: matching `theme::` anywhere in a file made a name written in a
     * comment into a requirement, and left a requirement standing for a call
     * that had been deleted.
     */
    public function test_the_theme_provides_every_template_core_renders(): void
    {
        $required = [];

        foreach (self::CORE as $directory)
        {
            foreach ($this->phpFilesIn($directory) as $file)
            {
                preg_match_all(
                    '#view\(\s*[\'"]theme::([a-z0-9_.-]+)[\'"]#i',
                    file_get_contents($file),
                    $matches
                );

                foreach ($matches[1] as $name)
                {
                    $required[$name] = true;
                }
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
     * Nothing in core should still point at where the theme used to be, or the
     * move left half the application behind.
     */
    public function test_core_no_longer_renders_the_old_view_path(): void
    {
        $offenders = [];

        foreach (self::CORE as $directory)
        {
            foreach ($this->phpFilesIn($directory) as $file)
            {
                if (preg_match('#view\(\s*[\'"]site\.#', file_get_contents($file)))
                {
                    $offenders[] = $this->relative($file);
                }
            }
        }

        $this->assertSame([], $offenders, 'Still rendering `site.*` rather than `theme::*`.');
    }

    /**
     * "Site" means the client's side of the line, so core must not claim the
     * word - not as a namespace, and not as a route name.
     *
     * Read out of core's own files rather than out of the router: the route
     * collection holds the client's routes too, and a client naming one
     * `site.contact` is doing exactly what this change reserved the prefix
     * for. Asking the router would have failed them for it.
     */
    public function test_core_does_not_claim_the_word_site(): void
    {
        $this->assertDirectoryDoesNotExist(
            app_path('Http/Controllers/Site'),
            'A core controller directory called Site contradicts what `site/` means.'
        );

        $offenders = [];

        foreach (self::CORE as $directory)
        {
            foreach ($this->phpFilesIn($directory) as $file)
            {
                if (preg_match('#->name\(\s*[\'"]site\.#', file_get_contents($file)))
                {
                    $offenders[] = $this->relative($file);
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            'Core route names take the `site.` prefix a client would use: ' . implode(', ', $offenders)
        );
    }
}
