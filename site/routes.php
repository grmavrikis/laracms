<?php

/*
 * Routes belonging to this one site.
 *
 * Loaded after the core routes in `routes/web.php`, so anything here is
 * additional rather than a replacement - a landing page a client asked for, a
 * redirect from an address their old site used, a form this site alone has.
 *
 * Core never reads this file's contents; it only loads it. Whatever is here
 * goes with the client when their installation is copied.
 *
 * Empty is the normal state. The generic pages - home, module listings, entry
 * pages, sitemap - are core and do not belong here.
 */

use Illuminate\Support\Facades\Route;

// Example, deliberately left commented out rather than deleted, so the shape
// of an entry is visible without one existing:
//
// Route::get('/prosfores', function () {
//     return view('theme::offers');
// });
