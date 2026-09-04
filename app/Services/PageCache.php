<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * The public side is served from cache, and publishing invalidates it.
 *
 * **The lookup comes before the database, not after.** #59 asks for a visitor
 * to be served finished HTML *without a query*, so the cache is keyed on the
 * path alone - nothing is resolved, not even the language, until a miss. The
 * first version of this checked the database first and cached the render,
 * which still cost three indexed queries on every hit and quietly failed the
 * requirement.
 *
 * **Invalidation is by version, not by key or tag.** `CACHE_STORE` is
 * `database`, and Laravel's database store does not support tagging - so
 * "forget everything under this module" cannot be expressed. Tracking keys
 * instead would mean maintaining a list of them, which is a second thing to
 * get wrong. So every key carries a version, and invalidating increments it:
 * O(1), no bookkeeping, and correct for the case key-based invalidation gets
 * wrong - a **renamed slug**, whose old URL is not computable afterwards
 * because the row that held it is gone.
 *
 * The version is **site-wide**, so any write drops every page. That is the
 * price of keying on the path alone: without touching the database there is
 * nothing to say which module a path belongs to. It is the right trade here -
 * an accommodation site is a few dozen pages edited a few times a month, and
 * a handful of re-renders costs less than three queries on every visit for
 * ever. A catalogue with thousands of pages would want finer invalidation,
 * and a catalogue is a domain module rather than this path (TASKS.md,
 * Decisions 2026-09-05).
 */
class PageCache
{
    /**
     * Long, because invalidation is explicit rather than by expiry. The TTL is
     * only what stops superseded versions accumulating for ever.
     */
    public const TTL = 60 * 60 * 24 * 7;

    private const PREFIX = 'page';

    private const VERSION_KEY = 'page-version';

    /**
     * Serve `$path` from cache, or build it.
     *
     * A `null` from `$render` means "no such page". It is deliberately **not**
     * cached: an unknown URL must not be able to fill the cache, or a crawler
     * walking made-up addresses would.
     */
    public function remember(string $path, Closure $render): ?string
    {
        $key = self::PREFIX . ':' . $this->version() . ':' . $path;
        $cached = Cache::get($key);

        if ($cached !== null)
        {
            return $cached;
        }

        $html = $render();

        if ($html !== null)
        {
            Cache::put($key, $html, self::TTL);
        }

        return $html;
    }

    public function invalidate(): void
    {
        // `Cache::increment` is not used: where the key is missing it answers
        // false and creates nothing, so the first publish after a cache clear
        // would bump nothing at all.
        Cache::forever(self::VERSION_KEY, $this->version() + 1);
    }

    public function version(): int
    {
        return (int) Cache::get(self::VERSION_KEY, 1);
    }
}
