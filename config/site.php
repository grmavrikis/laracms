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

    /*
    |--------------------------------------------------------------------------
    | Where an enquiry is announced (TASKS.md #66)
    |--------------------------------------------------------------------------
    |
    | The address the owner reads. Per installation, like everything else in
    | this file, and null is a valid answer - the enquiry is still stored, and
    | the email is a courtesy on top of the record rather than the record.
    |
    | This moves into the database with #67, where the owner can change it
    | without an editor.
    |
    */

    'enquiries_to' => env('ENQUIRY_NOTIFY'),

];
