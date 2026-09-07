<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * The public side speaks the language in the address (TASKS.md #96).
 *
 * **The address decides, not a header.** One page has exactly one URL (#59),
 * and a page whose text changed with `Accept-Language` would have two - the
 * same content served twice, which is the thing the language prefix exists to
 * prevent.
 *
 * **It does not look anything up.** The route pattern has already constrained
 * the segment to a language code's shape, and whether that language exists is
 * the controller's question, asked after the page cache has been consulted. A
 * query here would resolve the language on every visit including a cache hit,
 * undoing the one guarantee #59 is about. An unknown but well-shaped code
 * simply has no translations and falls back.
 *
 * **It reads the first segment when there is no parameter** (TASKS.md #104).
 * `site/routes.php` is loaded before the core pages so a client can take an
 * address over (#61), which put their routes outside the group that carries
 * this - and a hand-written `Route::get('/el/epikoinonia', β€¦)` has no
 * parameters at all, so asking the route for `language` would have found
 * nothing even with the middleware attached. A client's contact page rendered
 * Greek prose around an English form, and the note saying they "can opt in"
 * was in `bootstrap/app.php`, which is not where somebody writing a route
 * looks.
 *
 * The segment has to look like a language code, and the pattern is the
 * router's own rather than a second copy of it: `admin`, `storage` and
 * `sitemap.xml` cannot match `[a-z]{2}(-[a-z]{2})?`, which is what makes it
 * safe to run this on every web route.
 */
class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $language = self::languageFor($request);

        if (is_string($language) && $language !== '')
        {
            App::setLocale($language);
        }

        return $next($request);
    }

    /**
     * The language this request is written in, or null.
     *
     * **Public because one caller cannot use the middleware at all.** Laravel
     * keeps `ThrottleRequests` in its own `$middlewarePriority`, so the limiter
     * runs before this whatever order a route declares them in - the swap
     * TASKS.md #107 proposed does nothing, which a mutation proved by passing.
     * A 429 that wants to speak the visitor's language therefore has to ask the
     * same question this does, rather than rely on having been given an answer.
     */
    public static function languageFor(Request $request): ?string
    {
        $language = $request->route('language');

        if (is_string($language) && $language !== '')
        {
            return $language;
        }

        return self::firstSegmentIfItIsALanguage($request);
    }

    /**
     * The address's first segment, when it has the shape of a language code.
     *
     * The shape comes from `Route::pattern('language', β€¦)` in `routes/web.php`,
     * read rather than repeated: two copies of that expression would be two
     * answers to "what may be a language" the first time either moved.
     */
    private static function firstSegmentIfItIsALanguage(Request $request): ?string
    {
        $segment = $request->segment(1);

        if (!is_string($segment) || $segment === '')
        {
            return null;
        }

        $pattern = app('router')->getPatterns()['language'] ?? null;

        if (!is_string($pattern))
        {
            return null;
        }

        return preg_match('/^(?:' . $pattern . ')$/', $segment) === 1 ? $segment : null;
    }
}
