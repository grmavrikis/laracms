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

    /**
     * The stored shape is part of this key.
     *
     * The version counter below moves on a **write**, not on a deploy, so
     * entries written by the previous release sit under keys the new code
     * reads. Changing the prefix retires them all at once, and it has been
     * needed twice - both times found by opening the deployed app, never by
     * the suite, which starts every run with an empty cache:
     *
     * - **v2**: `remember()` once answered with a page's HTML and now answers
     *   with what the page *is*. The old strings came back through an `?array`
     *   signature: a TypeError on every warm page.
     * - **v3**: pages with a form used to be stored with their CSRF token
     *   replaced by a placeholder, which `PageController` swapped back on the
     *   way out. Such a page is no longer stored at all and nothing swaps
     *   anything, so a v2 entry served the literal placeholder as the token
     *   and **every submission answered 419**.
     *
     * Bump it whenever the stored shape changes, including when what is stored
     * changes from something to nothing.
     *
     * Public because `PageCacheTest` composes keys with it. A test that spells
     * the prefix out has to be edited on every bump, which is how the bump
     * comes to look like the thing that broke the suite.
     */
    public const PREFIX = 'page.v3';

    private const VERSION_KEY = 'page-version';

    /**
     * Serve `$path` from cache, or build it.
     *
     * `$render` answers with what the page *is*, not only its HTML: a
     * singleton's entry address is a permanent redirect rather than a
     * document (TASKS.md #60), and caching the decision keeps that path free
     * of queries too. The shapes are `['html' => string]` and
     * `['redirect' => string]`.
     *
     * Two things are deliberately **not** stored.
     *
     * A `null` means "no such page": an unknown URL must not be able to fill
     * the cache, or a crawler walking made-up addresses would.
     *
     * A page **carrying a form** is not stored either - see below.
     *
     * @return array{html?: string, redirect?: string}|null
     */
    public function remember(string $path, Closure $render): ?array
    {
        $key = self::PREFIX . ':' . $this->version() . ':' . $path;
        $cached = Cache::get($key);

        if ($cached !== null)
        {
            return $cached;
        }

        $page = $render();

        if ($page !== null && !self::carriesSessionState($page))
        {
            Cache::put($key, $page, self::TTL);
        }

        return $page;
    }

    /**
     * **A page with a form on it cannot be cached**, because everything a form
     * needs belongs to one visitor's session and a cached page is handed to
     * everyone: the CSRF token, the confirmation after a submission, the
     * errors after a failure, and the values to type back into the boxes.
     *
     * Found by posting the live enquiry form, which answered 419 with the
     * suite green - the cached HTML carried the first visitor's token and
     * everybody after them was refused. The first answer substituted the token
     * on the way in and on the way out, and was the wrong depth: it fixed the
     * one piece of session state with a fixed shape and left the three that
     * have none, so the visitor still saw no confirmation and no errors.
     *
     * The **CSRF token is the marker**, not a flag a template sets. Any form
     * posting back to this application carries one - without it the submission
     * is refused - so a theme cannot forget to declare itself, and a theme
     * that puts a form on a page that had none is covered the moment it does.
     *
     * The cost is that such a page is rendered on every visit. Which page that
     * is, is the client's decision and is made by where the theme puts the
     * form; a site that wants its home page cached gives the form its own.
     */
    private static function carriesSessionState(array $page): bool
    {
        return isset($page['html'])
            && preg_match('/name=[\'"](_token|csrf-token)[\'"]/i', $page['html']) === 1;
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
