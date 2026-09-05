<?php

return [

    /*
    |--------------------------------------------------------------------------
    | The per-client side of the line (TASKS.md #61)
    |--------------------------------------------------------------------------
    |
    | Core knows where the client's directory is and nothing about what is in
    | it. These two paths are the whole of that knowledge - the view namespace
    | and the routes file - and they live here rather than being written into
    | `routes/web.php` so a test can point them somewhere else.
    |
    | That matters more than it looks: proving the routes file is really loaded
    | means loading one, and without this the only way to do that was to
    | overwrite the repository's own `site/routes.php` and hope the restore ran.
    |
    */

    'theme' => env('SITE_THEME', base_path('site/theme')),

    'routes' => env('SITE_ROUTES', base_path('site/routes.php')),

];
