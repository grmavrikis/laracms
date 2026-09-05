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
 */
class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $language = $request->route('language');

        if (is_string($language) && $language !== '')
        {
            App::setLocale($language);
        }

        return $next($request);
    }
}
