<?php

use App\Http\Controllers\Site\PageController;
use App\Http\Controllers\Site\SitemapController;
use Illuminate\Support\Facades\Route;

/*
 * The admin panel. Declared first because the public routes below end in a
 * bare `/{language}` segment, and order is what decides which of them wins.
 */
Route::get('/admin/{any?}', function ()
{
    return view('admin');
})->where('any', '.*');

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
 */
Route::get('/sitemap.xml', [SitemapController::class, 'show'])->name('site.sitemap');

Route::get('/', [PageController::class, 'root'])->name('site.root');

Route::pattern('language', '[a-z]{2}(-[a-z]{2})?');
Route::pattern('module', '[a-z0-9]+(?:-[a-z0-9]+)*');
Route::pattern('slug', '[a-z0-9]+(?:-[a-z0-9]+)*');

Route::get('/{language}', [PageController::class, 'home'])->name('site.home');
Route::get('/{language}/{module}', [PageController::class, 'index'])->name('site.module');
Route::get('/{language}/{module}/{slug}', [PageController::class, 'show'])->name('site.entry');
