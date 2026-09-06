<?php

namespace App\Services;

use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use Illuminate\Support\Facades\File;

/**
 * The public site as files on disk, served before PHP starts (TASKS.md #97).
 *
 * **This replaces `PageCache`, it does not extend it.** The claim that a cache
 * hit "touches the database not at all" was measured and was false in
 * production: a hit cost four queries - a session read, two cache reads and a
 * session write - and the test that said otherwise ran under `CACHE_STORE` and
 * `SESSION_DRIVER` of `array`, which exist only in `phpunit.xml`. #59 asked for
 * finished HTML without a query. A file is that sentence taken literally: not
 * a faster cache, no PHP at all.
 *
 * Two things follow that are gains rather than costs. **The site survives its
 * own database** - a hotel whose MySQL falls over in August still serves every
 * page. And **invalidation gets more precise**: the version counter existed
 * because a *visitor's* path cannot be mapped to a module without a query, but
 * an *author* saving has the rows in hand, so the pages to remove are
 * computable - the renamed slug included, which is the one case the counter
 * could not handle.
 *
 * ### The address is composed from rows, never from the request
 *
 * `write()` is handed a filename that its caller built out of a language code,
 * a module's slug and an entry's slug. It is checked again here, segment by
 * segment, before anything touches the filesystem: writing inside `public/`
 * from something a visitor controls is how a crafted URL puts a file where it
 * should not be, and a row can hold whatever a hand-written UPDATE left in it.
 * A page that fails the check is served and simply not baked.
 *
 * ### There is no expiry
 *
 * `PageCache` carried a seven-day TTL as a backstop under its explicit
 * invalidation. A file has none, so **anything that changes a page must say
 * so** - which is why `Language` is observed here although it never was
 * before: a language switched on changes the hreflang set of every page, and
 * a wrong one would now sit on disk for ever rather than for a week.
 */
class StaticPages
{
    /**
     * One path segment: lower-case, digits, and `-` or `.` between them.
     *
     * Deliberately narrower than the filesystem allows, and narrower than the
     * database. It admits `el`, `pt-br`, `rooms.html` and `sitemap.xml`, and
     * refuses `..`, a separator, a space and anything not ASCII - the
     * development database of this project holds a module whose slug is
     * `τεστ κεις`, so this is not a hypothetical.
     */
    private const SEGMENT = '/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/';

    public function __construct(private readonly SiteSettings $settings)
    {
    }

    /**
     * Whether pages are **written**. Nothing reads this in order to serve one:
     * a baked page is handed over by the web server, which asks nothing.
     *
     * The owner's switch is the settings row and `PAGE_CACHE` in `.env` is its
     * default, the same shape every other setting has (#67). It costs no extra
     * query on a render - `PageController` has already resolved `SiteSettings`
     * for the footer - and it is only ever reached on a miss.
     */
    public function enabled(): bool
    {
        return (bool) $this->settings->get('page_cache');
    }

    public function directory(): string
    {
        return (string) config('site.pages', public_path('cache'));
    }

    /**
     * Bake one page, if baking is on and the address is safe.
     *
     * Written to a temporary name and moved into place, so a visitor arriving
     * mid-write is never handed half a page. (`rename` replaces the target
     * atomically on Linux; on Windows it refuses an existing target, so the
     * old file is removed first - a narrow race on the development machine
     * only, which is the one place a stale page costs nothing.)
     */
    public function write(string $page, string $contents): void
    {
        if (!$this->enabled())
        {
            return;
        }

        if (self::carriesSessionState($contents))
        {
            return;
        }

        $file = $this->fileFor($page);

        if ($file === null)
        {
            return;
        }

        File::ensureDirectoryExists(dirname($file));

        $temporary = $file . '.' . getmypid() . '.writing';

        File::put($temporary, $contents);

        if (!@rename($temporary, $file))
        {
            File::delete($file);

            if (!@rename($temporary, $file))
            {
                File::delete($temporary);
            }
        }
    }

    /**
     * **A page carrying a CSRF token is never written**, whoever rendered it.
     *
     * A token belongs to one visitor's session and a file is handed to
     * everybody, so baking one means 419 for every visitor after the first.
     * That is CHANGELOG §25, found by posting the live form.
     *
     * Since #97 this is a **guard rather than the normal case**: the shipped
     * theme's form is submitted by `public/forms.js` and carries no token, so
     * its page is baked like any other. What is left for this to catch is a
     * client route in `site/routes.php` rendering its own Blade form with
     * `@csrf` (#61), which is ordinary Laravel and must not cost the site a
     * broken form.
     *
     * The **token is the marker**, not a flag a template sets: any form
     * posting back to this application carries one, so a theme cannot forget
     * to declare itself, and a theme that adds a form to a page that had none
     * is covered the moment it does.
     *
     * It was carried over from `PageCache` by hand, and briefly was not - the
     * class was replaced and the guard went with it, silently, because the
     * three tests pinning it lived in the test file that was replaced too.
     */
    private static function carriesSessionState(string $html): bool
    {
        return preg_match('/name=[\'"](_token|csrf-token)[\'"]/i', $html) === 1;
    }

    public function forget(string $page): void
    {
        $file = $this->fileFor($page);

        if ($file !== null)
        {
            File::delete($file);
        }
    }

    /**
     * Every page. The switch turning off calls this: an empty directory is
     * what sends requests back to PHP, so "off" needs no setting to be read
     * and no query to be run on the way in - there is nothing there to serve.
     */
    public function flush(): void
    {
        File::deleteDirectory($this->directory());
    }

    public function has(string $page): bool
    {
        $file = $this->fileFor($page);

        return $file !== null && File::exists($file);
    }

    // ------------------------------------------- which pages a write affects

    /**
     * One entry's own addresses, and everything that lists it.
     *
     * **Called before the slug rows are replaced as well as after the entry is
     * saved.** `EntryController::syncSlugs` deletes the rows en masse, which
     * fires no model events, and once they are gone nothing can say what the
     * old addresses were - the file would sit at a URL no row mentions.
     */
    public function forgetEntry(Entry $entry, Module $module): void
    {
        foreach ($entry->slugs()->get() as $slug)
        {
            $this->forget("{$slug->language_code}/{$module->slug}/{$slug->slug}.html");
        }

        $this->forgetModule($module);
    }

    /**
     * A module's listing in every language, the home page, and the sitemap.
     *
     * The home page goes too, and not because core's own home template shows
     * entries - it does not. A bought theme (#62) decides what its home page
     * shows, and a client whose front page lists the newest rooms would
     * otherwise keep showing yesterday's. One file, rebuilt on the next visit.
     */
    public function forgetModule(Module $module): void
    {
        foreach ($this->languages() as $code)
        {
            $this->forget("{$code}/{$module->slug}.html");
            $this->forget("{$code}.html");
        }

        $this->forget('sitemap.xml');
    }

    // ------------------------------------------------------------- internals

    /** @return array<int, string> */
    private function languages(): array
    {
        return Language::query()->pluck('code')->all();
    }

    /**
     * The absolute file for a page, or null if its address is not one this
     * will write - which is the only answer that does not either serve a
     * visitor a 500 over a bad row or let that row choose a path.
     */
    private function fileFor(string $page): ?string
    {
        $segments = explode('/', $page);

        foreach ($segments as $segment)
        {
            if (preg_match(self::SEGMENT, $segment) !== 1)
            {
                return null;
            }
        }

        return $this->directory() . '/' . implode('/', $segments);
    }
}
