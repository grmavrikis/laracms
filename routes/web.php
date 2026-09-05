<?php

use App\Http\Controllers\Web\PageController;
use App\Http\Controllers\Web\SitemapController;
use Illuminate\Support\Facades\Route;

/*
 * The admin panel, first and deliberately above the site's own routes: a
 * client may take over any public address, and may not take over the panel.
 */
Route::get('/admin/{any?}', function ()
{
    return view('admin');
})->where('any', '.*');

/*
 * This one site's own routes, if it has any (TASKS.md #61).
 *
 * **Before** the core pages, not after. Laravel matches in declaration order,
 * and the public routes below end in catch-alls - `/{language}/{module}` would
 * claim `/el/epikoinonia` before a hand-written contact page ever saw it. A
 * client's side of the line that could only add addresses nobody had thought
 * of would be a poor kind of ownership.
 *
 * Loaded by location rather than by name, so core never learns what a given
 * client put in there. A missing file is the normal state.
 *
 * Note: `route:cache` freezes whatever is here. Run `route:clear` after
 * editing it on a cached deployment.
 */
if (is_file(base_path('site/routes.php')))
{
    require base_path('site/routes.php');
}

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
Route::get('/sitemap.xml', [SitemapController::class, 'show'])->name('web.sitemap');

Route::get('/', [PageController::class, 'root'])->name('web.root');

Route::pattern('language', '[a-z]{2}(-[a-z]{2})?');
Route::pattern('module', '[a-z0-9]+(?:-[a-z0-9]+)*');
Route::pattern('slug', '[a-z0-9]+(?:-[a-z0-9]+)*');

Route::get('/{language}', [PageController::class, 'home'])->name('web.home');
Route::get('/{language}/{module}', [PageController::class, 'index'])->name('web.module');
Route::get('/{language}/{module}/{slug}', [PageController::class, 'show'])->name('web.entry');
