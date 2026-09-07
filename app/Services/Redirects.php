<?php

namespace App\Services;

use App\Models\Entry;
use App\Models\EntrySlug;
use App\Models\Module;
use App\Models\Redirect;
use Illuminate\Database\Eloquent\Builder;
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
 * ### Rows are written by hand, so nothing in one is trusted
 *
 * The agency writes the old site's rows with SQL - there is deliberately no
 * endpoint (#52's reasoning, one table over) - so every field is checked on the
 * way out as well as on the way in:
 *
 *   - **the destination is a path on this site.** Never a URL, and never
 *     `//host`, which starts with a slash and would send every visitor who hit
 *     that address to somebody else's server;
 *   - **the status is a redirect.** Symfony's `RedirectResponse` throws on
 *     anything that is not 3xx, and that exception would be raised *while a 404
 *     is being rendered* - so one mistyped row would answer 500 where the site
 *     used to answer 404 politely. Anything unrecognised is served as 301.
 *
 * ### Addresses are compared decoded
 *
 * `getPathInfo()` is percent-encoded and a person writing a row types the
 * address as they read it. The first market is Greek accommodation, so
 * `/δωμάτια` against `/%CE%B4%CF%89...` is the ordinary case rather than an
 * exotic one. Both ends are decoded here, and a row written either way is
 * matched.
 *
 * ### Chains are flattened when they are written
 *
 * Renaming twice repoints the first row instead of adding a second hop, and
 * renaming back deletes the row rather than leaving the live address
 * redirecting to itself. Resolution is therefore a single lookup: one hop, no
 * loop, no recursion at request time.
 */
class Redirects
{
    /**
     * The statuses a row may carry.
     *
     * 301 for a rename, because only a permanent redirect moves the ranking to
     * the new address. The rest exist for a row somebody writes by hand.
     */
    public const STATUSES = [301, 302, 307, 308];

    private const STATUS_DEFAULT = 301;

    /**
     * How many moves go into one statement.
     *
     * A rename writes one move per page underneath the module, and every
     * placeholder in a `CASE` counts against the driver's limit - SQLite's is
     * 32766 and MySQL's 65535, and a language with a large catalogue would
     * otherwise walk into both.
     */
    private const CHUNK = 100;

    // ------------------------------------------------------------- serving

    /**
     * The redirect for this request, or null to let the 404 stand.
     */
    public function answer(Request $request): ?RedirectResponse
    {
        // A moved page is something a visitor followed a link to. A POST is a
        // submission - answering one with a 301 makes the browser replay it as
        // a GET and drop the body - and the panel and the API are reading an
        // answer rather than looking for a page.
        if (!$request->isMethod('GET') && !$request->isMethod('HEAD'))
        {
            return null;
        }

        if ($request->is('api/*') || $request->expectsJson())
        {
            return null;
        }

        $found = $this->rowFor($request);

        if ($found === null)
        {
            return null;
        }

        [$moved, $keyedByQuery] = $found;

        [$path, $query] = self::split($moved->to_path);

        $to = self::normalise($path);

        // A destination off the site, or one pointing at the address being
        // asked for. Both are only reachable through a hand-written row, and
        // both are answered by leaving the 404 alone.
        if ($to === null || $to === self::normalise($request->getPathInfo()))
        {
            return null;
        }

        // The query the visitor arrived with is carried across when the
        // destination does not name its own: a campaign link to a page that has
        // since been renamed should still tell the client where the visit came
        // from.
        //
        // **Unless the row was matched *by* that query**, in which case it has
        // already been read: `/index.php?p=17` names one page, and carrying
        // `p=17` on to it would hand the new site a parameter that meant
        // something only on the old one.
        if (!$keyedByQuery)
        {
            $query ??= $request->getQueryString();
        }

        $location = self::encode($to) . ($query === null || $query === '' ? '' : '?' . $query);

        return redirect()->to($location, self::status($moved->status));
    }

    /**
     * The row for this request and whether its key carried the query string,
     * trying the most specific key first.
     *
     * Four candidates rather than one, because a row is written by a person:
     * with the query string and without it, and decoded as well as exactly as
     * the request arrived. The query variants come first so a site addressed by
     * query - `/index.php?p=17`, which is every pre-permalink WordPress - can be
     * expressed one page at a time.
     *
     * @return array{0: Redirect, 1: bool}|null
     */
    private function rowFor(Request $request): ?array
    {
        $decoded = self::normalise($request->getPathInfo());

        if ($decoded === null)
        {
            return null;
        }

        $raw = rtrim($request->getPathInfo(), '/');
        $raw = $raw === '' ? '/' : $raw;

        $query = $request->getQueryString();

        // Each candidate remembers whether it carried the query, so the
        // destination knows whether that query has already been answered.
        $candidates = [];

        if ($query !== null && $query !== '')
        {
            $candidates[$decoded . '?' . $query] = true;
            $candidates[$raw . '?' . $query] = true;
        }

        $candidates[$decoded] ??= false;
        $candidates[$raw] ??= false;

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
            $rows = Redirect::query()->whereIn('from_path', array_keys($candidates))->get();
        }
        catch (Throwable $e)
        {
            Log::warning('Could not look up a redirect for ' . $decoded . ': ' . $e->getMessage());

            return null;
        }

        foreach ($candidates as $candidate => $keyedByQuery)
        {
            $row = $rows->firstWhere('from_path', $candidate);

            if ($row !== null)
            {
                return [$row, $keyedByQuery];
            }
        }

        return null;
    }

    // ------------------------------------------------------------- writing

    /** One move. `rememberMany` is what a rename uses. */
    public function remember(string $from, string $to, int $status = self::STATUS_DEFAULT): void
    {
        $this->rememberMany([[$from, $to]], $status);
    }

    /**
     * Record that each address is now another one, keeping the table free of
     * chains and loops.
     *
     * **Three statements per chunk, not three per address.** A module rename
     * moves its listing and every page underneath it, so a catalogue of two
     * hundred entries in three languages is six hundred moves - and one
     * transaction each would hold the panel's Rename button open for seconds
     * and roll the whole rename back on a timeout.
     *
     * The three are one decision each:
     *
     *   1. anything that pointed at an old address now points at the new one,
     *      so a second rename costs the visitor one hop rather than two;
     *   2. every new address must answer, so any row redirecting *away* from
     *      one goes - and so does any row left pointing at itself, which is
     *      what a rename back produces once step 1 has run;
     *   3. the moves themselves.
     *
     * @param array<int, array{0: string, 1: string}> $moves
     */
    public function rememberMany(array $moves, int $status = self::STATUS_DEFAULT): void
    {
        $pairs = [];

        foreach ($moves as [$from, $to])
        {
            $from = self::key($from);
            $to = self::key($to);

            if ($from === null || $to === null || $from === $to)
            {
                continue;
            }

            if (mb_strlen($from) > Redirect::PATH_MAX_LENGTH || mb_strlen($to) > Redirect::PATH_MAX_LENGTH)
            {
                // Never thrown: this runs inside the transaction that renames a
                // module, and an address too long to record is not a reason to
                // refuse the rename - the same rule `StaticPages::write`
                // follows for a page it cannot bake.
                Log::warning('Redirect not recorded, path too long: ' . $from . ' -> ' . $to);

                continue;
            }

            $pairs[$from] = $to;
        }

        if ($pairs === [])
        {
            return;
        }

        $status = self::status($status);

        DB::transaction(function () use ($pairs, $status)
        {
            foreach (array_chunk($pairs, self::CHUNK, preserve_keys: true) as $chunk)
            {
                $this->repoint($chunk);

                Redirect::query()
                    ->whereIn('from_path', array_values($chunk))
                    ->orWhereColumn('from_path', 'to_path')
                    ->delete();

                $now = now();

                Redirect::query()->upsert(
                    array_map(
                        fn (string $from, string $to) => [
                            'from_path' => $from,
                            'to_path' => $to,
                            'status' => $status,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ],
                        array_keys($chunk),
                        array_values($chunk)
                    ),
                    ['from_path'],
                    ['to_path', 'status', 'updated_at']
                );
            }
        });
    }

    /**
     * Point every row that named an old address at the new one, in a single
     * statement.
     *
     * The `CASE` is bound rather than inlined - `EntryController::reorder`
     * inlines because its values are integers it has just matched against the
     * database, and these are strings out of a slug column.
     *
     * @param array<string, string> $pairs
     */
    private function repoint(array $pairs): void
    {
        $cases = '';
        $bindings = [];

        foreach ($pairs as $from => $to)
        {
            $cases .= ' when ? then ?';
            $bindings[] = $from;
            $bindings[] = $to;
        }

        $bindings[] = now();

        $table = (new Redirect())->getTable();
        $places = implode(', ', array_fill(0, count($pairs), '?'));

        DB::update(
            "update {$table} set to_path = case to_path{$cases} else to_path end, updated_at = ?"
            . " where to_path in ({$places})",
            [...$bindings, ...array_keys($pairs)]
        );
    }

    /**
     * A module was renamed: its listing moved, and so did every entry page
     * underneath it in that language.
     *
     * The entry rows are the reason this is not one redirect. `/en/services`
     * moving to `/en/facilities` takes `/en/services/breakfast` with it, and
     * those are the addresses a client actually has links and rankings for.
     * **Published entries only** - a draft has no public page at either
     * address, so a row for it would be a redirect from a 404 to a 404.
     *
     * @param array<string, string> $before language code => slug, before the write
     * @param array<string, string> $after  the same map afterwards
     */
    public function moduleMoved(Module $module, array $before, array $after): void
    {
        $moves = [];

        foreach (self::changes($before, $after) as $code => [$was, $now])
        {
            $moves[] = [self::moduleAddress($code, $was), self::moduleAddress($code, $now)];

            $slugs = EntrySlug::query()
                ->where('module_id', $module->id)
                ->where('language_code', $code)
                ->whereHas('entry', fn (Builder $query) => $query->published())
                ->pluck('slug');

            foreach ($slugs as $slug)
            {
                $moves[] = [
                    self::entryAddress($code, $was, $slug),
                    self::entryAddress($code, $now, $slug),
                ];
            }
        }

        $this->rememberMany($moves);
    }

    /**
     * An entry was renamed inside a module that stayed where it was.
     *
     * @param array<string, string> $before language code => slug, before the write
     * @param array<string, string> $after  the same map afterwards
     */
    public function entryMoved(Module $module, array $before, array $after): void
    {
        $changes = self::changes($before, $after);

        if ($changes === [])
        {
            return;
        }

        // Once, rather than once per language: `Module::translation` falls back
        // to a query whenever the relation is not loaded, and a route-bound
        // Module never has it.
        $module->loadMissing('slugs');

        $moves = [];

        foreach ($changes as $code => [$was, $now])
        {
            $section = $module->slugFor($code);

            if ($section === null)
            {
                continue;
            }

            $moves[] = [
                self::entryAddress($code, $section, $was),
                self::entryAddress($code, $section, $now),
            ];
        }

        $this->rememberMany($moves);
    }

    // ------------------------------------------------------------ forgetting

    /**
     * The pages this entry served are about to stop existing, so nothing
     * should still be pointing at them.
     *
     * A 301 into a 404 is worse for the client than the old address simply
     * being gone: a crawler follows it and records the *new* address as broken.
     * Called from `deleting`, like `StaticPageObserver`, because `entry_slugs`
     * cascades and afterwards nothing can say where the pages were.
     */
    public function forgetEntry(Entry $entry): void
    {
        $module = $entry->module;

        if ($module === null)
        {
            return;
        }

        $addresses = [];

        foreach ($entry->slugs()->get() as $slug)
        {
            $section = $module->slugFor($slug->language_code);

            if ($section !== null)
            {
                $addresses[] = self::entryAddress($slug->language_code, $section, $slug->slug);
            }
        }

        $this->forget($addresses);
    }

    /**
     * The same for a module: its listing, and every address underneath it.
     *
     * There is no delete endpoint, so this is for the hand-written removal -
     * which is how a module has always been deleted here.
     */
    public function forgetModule(Module $module): void
    {
        foreach ($module->slugs()->get() as $row)
        {
            $listing = self::moduleAddress($row->language_code, $row->slug);

            if ($listing === null)
            {
                continue;
            }

            Redirect::query()
                ->where('to_path', $listing)
                ->orWhere('to_path', 'like', $listing . '/%')
                ->orWhere('from_path', $listing)
                ->orWhere('from_path', 'like', $listing . '/%')
                ->delete();
        }
    }

    /** @param array<int, string|null> $addresses */
    private function forget(array $addresses): void
    {
        $addresses = array_values(array_filter($addresses));

        if ($addresses === [])
        {
            return;
        }

        Redirect::query()
            ->whereIn('to_path', $addresses)
            ->orWhereIn('from_path', $addresses)
            ->delete();
    }

    // ------------------------------------------------------------- internals

    /**
     * The languages whose slug actually moved.
     *
     * A language missing from `$after` means the module or entry has no page
     * there at all (#114), and a 301 to another language's address is exactly
     * the fallback that decision refused - so it is skipped rather than
     * redirected.
     *
     * @param array<string, string> $before
     * @param array<string, string> $after
     * @return array<string, array{0: string, 1: string}>
     */
    private static function changes(array $before, array $after): array
    {
        $changes = [];

        foreach ($before as $code => $was)
        {
            $now = $after[$code] ?? null;

            if ($now === null || $now === $was)
            {
                continue;
            }

            $changes[$code] = [$was, $now];
        }

        return $changes;
    }

    /**
     * A public address, composed by the routes that serve it.
     *
     * Through `route()` rather than by interpolation, so the shape of a public
     * URL is written once: `routes/web.php` decides it, `StaticPages` turns it
     * into a filename, and this turns it into a redirect. Two of the three
     * spelling it out by hand is how the third gets left behind.
     */
    private static function moduleAddress(string $language, string $slug): ?string
    {
        return self::normalise(route('web.module', [
            'language' => $language,
            'module' => $slug,
        ], absolute: false));
    }

    private static function entryAddress(string $language, string $module, string $slug): ?string
    {
        return self::normalise(route('web.entry', [
            'language' => $language,
            'module' => $module,
            'slug' => $slug,
        ], absolute: false));
    }

    /** A status this may actually answer with, or 301. */
    private static function status(mixed $status): int
    {
        return in_array((int) $status, self::STATUSES, true) ? (int) $status : self::STATUS_DEFAULT;
    }

    /** @return array{0: string, 1: string|null} the path, and the query if there is one */
    private static function split(?string $address): array
    {
        $parts = explode('?', (string) $address, 2);

        return [$parts[0], $parts[1] ?? null];
    }

    /**
     * The stored form of an address: the path, decoded and trimmed, plus its
     * query string if it has one.
     *
     * A row may be keyed by a query because the site being replaced was -
     * `/index.php?p=17` is one page, not a hundred.
     */
    public static function key(?string $address): ?string
    {
        [$path, $query] = self::split($address);

        $path = self::normalise($path);

        if ($path === null)
        {
            return null;
        }

        return $query === null || $query === '' ? $path : $path . '?' . $query;
    }

    /**
     * The comparable form of a path, or null when it is not one this will
     * serve or store.
     *
     * **Decoded**, because `getPathInfo()` is not and a person writing a row
     * types what they read - `/δωμάτια`, not `/%CE%B4%CF%89...`. Decoding
     * before the checks below is what makes them mean anything: `/%2Fevil.example`
     * is `//evil.example`, and `%5C` is the backslash browsers read as a
     * separator.
     *
     * A trailing slash is dropped, so `/en/services/` and `/en/services` are
     * one address.
     */
    public static function normalise(?string $path): ?string
    {
        $path = rawurldecode(trim((string) $path));

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

    /**
     * Back to the wire, for the `Location` header: a decoded path is stored and
     * compared, and an encoded one is sent.
     */
    private static function encode(string $path): string
    {
        return implode('/', array_map('rawurlencode', explode('/', $path)));
    }
}
