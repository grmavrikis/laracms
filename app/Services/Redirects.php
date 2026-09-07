<?php

namespace App\Services;

use App\Models\EntrySlug;
use App\Models\Module;
use App\Models\Redirect;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * An address that has moved answers 301 rather than 404 (TASKS.md #69, and
 * step three of #114).
 *
 * ### Why it runs from the 404 and not from a middleware
 *
 * `bootstrap/app.php` calls `answer()` while rendering a `NotFoundHttpException`,
 * which is the one moment the question is worth asking. A middleware would run
 * on every request to look something up on almost none of them, and - the part
 * that matters more - a row naming an address the site still serves could never
 * hide it: by the time this is reached, the router and the controller have both
 * declined. A stale redirect is inert, not a trap.
 *
 * It also covers both kinds of miss, which a route-level hook could not: a
 * renamed module still *matches* `/{language}/{module}` and 404s inside the
 * controller, while `/rooms/deluxe.html` from a client's previous site matches
 * no route at all.
 *
 * ### Chains are flattened when they are written
 *
 * Renaming twice repoints the first row instead of adding a second hop, and
 * renaming back deletes the row rather than leaving the live address
 * redirecting to itself. Resolution is therefore a single lookup: one hop, no
 * loop, no recursion at request time.
 *
 * ### The destination is a path on this site
 *
 * Never a URL, and never `//host` - which starts with a slash and would send
 * every visitor who hit that address to somebody else's server. Rows are
 * written by hand by the agency, so this is one UPDATE away rather than
 * hypothetical, and it is checked on the way in *and* on the way out.
 */
class Redirects
{
    /**
     * The redirect for this request, or null to let the 404 stand.
     */
    public function answer(Request $request): ?RedirectResponse
    {
        // A moved page is something a visitor followed a link to. A POST is a
        // submission, and the panel and the API are reading an answer rather
        // than looking for a page - `expectsJson` covers a client route that
        // answers JSON as well.
        if (!$request->isMethod('GET') && !$request->isMethod('HEAD'))
        {
            return null;
        }

        if ($request->is('api/*') || $request->expectsJson())
        {
            return null;
        }

        $from = self::normalise($request->getPathInfo());

        if ($from === null)
        {
            return null;
        }

        // **A 404 stays a 404 when the lookup fails.** This runs while an
        // error is already being rendered, and it is the last thing between a
        // visitor and the page telling them there is nothing here - a database
        // that is down, or a deployment where nobody ran the migrations, would
        // otherwise turn every missing address into a 500. Found by
        // `CoreSiteBoundaryTest`, which boots the router without the schema.
        //
        // The same rule `StaticPages::write` follows: the feature may make a
        // request better, never worse.
        try
        {
            $moved = Redirect::query()->where('from_path', $from)->first();
        }
        catch (Throwable $e)
        {
            Log::warning('Could not look up a redirect for ' . $from . ': ' . $e->getMessage());

            return null;
        }

        if ($moved === null)
        {
            return null;
        }

        $to = self::normalise($moved->to_path);

        // A destination off the site, or one pointing at the address being
        // asked for. Both are only reachable through a hand-written row, and
        // both are answered by leaving the 404 alone.
        if ($to === null || $to === $from)
        {
            return null;
        }

        return redirect()->to($to, $moved->status);
    }

    /**
     * Record that `$from` is now `$to`, keeping the table free of chains and
     * loops.
     *
     * The three writes are one decision each:
     *
     *   1. anything that pointed at the old address now points at the new one,
     *      so a second rename costs the visitor one hop rather than two;
     *   2. the new address must answer, so any row redirecting *away* from it
     *      goes - and so does any row left pointing at itself, which is what a
     *      rename back produces once step 1 has run;
     *   3. the move itself.
     */
    public function remember(string $from, string $to, int $status = 301): void
    {
        $from = self::normalise($from);
        $to = self::normalise($to);

        if ($from === null || $to === null || $from === $to)
        {
            return;
        }

        if (mb_strlen($from) > Redirect::PATH_MAX_LENGTH || mb_strlen($to) > Redirect::PATH_MAX_LENGTH)
        {
            // Never thrown: this runs inside the transaction that renames a
            // module, and an address too long to record is not a reason to
            // refuse the rename - the same rule `StaticPages::write` follows
            // for a page it cannot bake.
            Log::warning('Redirect not recorded, path too long: ' . $from . ' -> ' . $to);

            return;
        }

        DB::transaction(function () use ($from, $to, $status)
        {
            Redirect::query()->where('to_path', $from)->update(['to_path' => $to]);

            Redirect::query()
                ->where('from_path', $to)
                ->orWhereColumn('from_path', 'to_path')
                ->delete();

            Redirect::query()->updateOrCreate(
                ['from_path' => $from],
                ['to_path' => $to, 'status' => $status]
            );
        });
    }

    /**
     * A module was renamed: its listing moved, and so did every entry page
     * underneath it in that language.
     *
     * The entry rows are the reason this is not one redirect. `/en/services`
     * moving to `/en/facilities` takes `/en/services/breakfast` with it, and
     * those are the addresses a client actually has links and rankings for.
     *
     * @param array<string, string> $before language code => slug, before the write
     * @param array<string, string> $after  the same map afterwards
     */
    public function moduleMoved(Module $module, array $before, array $after): void
    {
        foreach ($before as $code => $was)
        {
            $now = $after[$code] ?? null;

            // No row in that language any more means the module has no page
            // there at all (#114), and a 301 to another language's address is
            // exactly the fallback that decision refused.
            if ($now === null || $now === $was)
            {
                continue;
            }

            $this->remember("/{$code}/{$was}", "/{$code}/{$now}");

            $slugs = EntrySlug::query()
                ->where('module_id', $module->id)
                ->where('language_code', $code)
                ->pluck('slug');

            foreach ($slugs as $slug)
            {
                $this->remember("/{$code}/{$was}/{$slug}", "/{$code}/{$now}/{$slug}");
            }
        }
    }

    /**
     * An entry was renamed inside a module that stayed where it was.
     *
     * @param array<string, string> $before language code => slug, before the write
     * @param array<string, string> $after  the same map afterwards
     */
    public function entryMoved(Module $module, array $before, array $after): void
    {
        foreach ($before as $code => $was)
        {
            $now = $after[$code] ?? null;

            if ($now === null || $now === $was)
            {
                continue;
            }

            $section = $module->slugFor($code);

            if ($section === null)
            {
                continue;
            }

            $this->remember("/{$code}/{$section}/{$was}", "/{$code}/{$section}/{$now}");
        }
    }

    /**
     * The comparable form of a path, or null when it is not one this will
     * serve or store.
     *
     * A trailing slash is dropped so `/en/services/` and `/en/services` are the
     * same address. Everything else here is the open-redirect check: a
     * destination has to be a path on this site, and both `//host` and a
     * backslash - which browsers read as a separator - would leave it.
     */
    public static function normalise(?string $path): ?string
    {
        $path = trim((string) $path);

        if ($path === '' || !str_starts_with($path, '/'))
        {
            return null;
        }

        if (str_starts_with($path, '//') || str_contains($path, '\\') || str_contains($path, "\0"))
        {
            return null;
        }

        $path = rtrim($path, '/');

        return $path === '' ? '/' : $path;
    }
}
