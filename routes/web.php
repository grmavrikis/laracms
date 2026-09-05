<?php

use App\Http\Controllers\Web\PageController;
use App\Http\Controllers\Web\SitemapController;
use Illuminate\Support\Facades\Route;

/*
 * What a client may not take over.
 *
 *   - the admin panel, because a site that can lock its owner out of it is a
 *     support call with no way back;
 *   - `sitemap.xml`, because its shape is a protocol rather than a design. The
 *     template was moved out of the theme for that reason, and leaving the
 *     route overridable would have handed the guarantee back.
 *
 * **Declared twice, and both times are needed** - Laravel protects against the
 * two ways a route can be lost by different mechanisms:
 *
 *   - *dispatch order*. The first route whose pattern matches wins, so a
 *     client's `/{page}` catch-all would answer `/admin` unless the panel is
 *     declared ahead of it;
 *   - *the lookup map*. `RouteCollection` stores routes as
 *     `[method][uri] => route`, so a **later route with the identical URI
 *     replaces the earlier one** - declaring the panel first does nothing
 *     against a client writing the same path.
 *
 * One position defends against one of those. Both defend against both, which
 * is why this closure is called on either side of the client's routes rather
 * than written once. A test asserts it.
 */
$protected = function ()
{
    Route::get('/admin/{any?}', function ()
    {
        return view('admin');
    })->where('any', '.*');

    Route::get('/sitemap.xml', [SitemapController::class, 'show'])->name('web.sitemap');
};

$protected();

/*
 * The parameter patterns, before the site's routes rather than after.
 *
 * Laravel merges the global patterns into a route **as it is created**
 * (`Router::addWhereClausesToRoute`), so anything registered earlier gets
 * none of them. Declared below the `require`, a client writing
 * `/{language}/epikoinonia` would have had an unconstrained `{language}` and
 * `/anything-at-all/epikoinonia` would have matched it.
 */
Route::pattern('language', '[a-z]{2}(-[a-z]{2})?');
Route::pattern('module', '[a-z0-9]+(?:-[a-z0-9]+)*');
Route::pattern('slug', '[a-z0-9]+(?:-[a-z0-9]+)*');

/*
 * This one site's own routes, if it has any (TASKS.md #61).
 *
 * **Before** the core pages, so a route here takes precedence. Laravel matches
 * in declaration order, and the public routes below end in catch-alls -
 * `/{language}/{module}` would claim `/el/epikoinonia` before a hand-written
 * contact page ever saw it. A client's side of the line that could only add
 * addresses nobody had thought of would be a poor kind of ownership.
 *
 * The path comes from config, which is core's only knowledge of where the
 * client's directory is - see `config/site.php` for why that is a value
 * rather than a literal.
 *
 * Note: `route:cache` freezes whatever is here. Run `route:clear` after
 * editing it on a cached deployment.
 */
if (is_file(config('site.routes')))
{
    require config('site.routes');
}

// Reclaims the two addresses above from a client who declared the identical
// URI. See the comment there for why once is not enough.
$protected();

/*
 * The public site (TASKS.md #59). Blade, from this same application, with no
 * API in between - see Decisions.
 *
 * Every page carries its language, the default one included, so one page has
 * exactly one address. `/` redirects to whichever language is flagged default
 * rather than serving the home page itself, which would put the same content
 * at two URLs.
 *
 * The `language` pattern is what keeps this from swallowing the rest of the
 * application: a two-letter segment cannot match `admin`, `storage` or
 * `sitemap.xml`. The code is then checked against the active languages, so an
 * unknown but well-shaped one is a 404 rather than an empty page.
 *
 * The names are `web.*`: since #61, `site.` belongs to the client, and a
 * client naming a route `site.contact` should not collide with core.
 */
Route::get('/', [PageController::class, 'root'])->name('web.root');

Route::get('/{language}', [PageController::class, 'home'])->name('web.home');
Route::get('/{language}/{module}', [PageController::class, 'index'])->name('web.module');
Route::get('/{language}/{module}/{slug}', [PageController::class, 'show'])->name('web.entry');
