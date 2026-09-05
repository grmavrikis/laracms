<?php

/*
 * Routes belonging to this one site.
 *
 * Loaded **before** the core pages, so a route here takes precedence: this is
 * where a client's hand-written contact page goes when the generic entry page
 * is not enough, or a redirect from an address their old site used.
 *
 * The panel is declared ahead of this file and cannot be taken over.
 *
 * Core never reads this file's contents; it only loads it. Whatever is here
 * goes with the client when their installation is copied.
 *
 * `route:cache` freezes it - run `route:clear` after editing on a cached
 * deployment.
 *
 * Empty is the normal state. The generic pages - home, module listings, entry
 * pages, sitemap - are core and do not belong here.
 *
 * Example, deliberately left as a comment rather than a live route:
 *
 *     use Illuminate\Support\Facades\Route;
 *
 *     Route::get('/prosfores', fn() => view('theme::offers'));
 */
