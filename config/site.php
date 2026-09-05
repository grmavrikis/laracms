<?php

return [

    /*
    |--------------------------------------------------------------------------
    | The per-client side of the line (TASKS.md #61)
    |--------------------------------------------------------------------------
    |
    | Core knows where the client's directory is and nothing about what is in
    | it. These three paths are the whole of that knowledge - the view
    | namespace, the routes file and the theme's own translations - and they
    | live here rather than being written into `routes/web.php` so a test can
    | point them somewhere else.
    |
    | That matters more than it looks: proving the routes file is really loaded
    | means loading one, and without this the only way to do that was to
    | overwrite the repository's own `site/routes.php` and hope the restore ran.
    |
    */

    'theme' => env('SITE_THEME', base_path('site/theme')),

    'routes' => env('SITE_ROUTES', base_path('site/routes.php')),

    /*
    | The theme's own labels (TASKS.md #96). What a form calls its fields is a
    | design decision, so it belongs to the client exactly as the templates do.
    |
    | Merged into the same JSON namespace as core's `lang/`, which means a key
    | written on both sides is resolved by whichever the loader reads last.
    | `TranslationTest` fails if the two ever claim the same one.
    */

    'lang' => env('SITE_LANG', base_path('site/lang')),

    /*
    |--------------------------------------------------------------------------
    | Which language the panel opens in (TASKS.md #96)
    |--------------------------------------------------------------------------
    |
    | The installation's default, used until a person picks their own - and on
    | the login screen, where there is no person yet. Null falls back to
    | `app.fallback_locale`.
    |
    | Per installation, like the rest of this file: the first market is Greek,
    | and a panel that opens in English because nobody filled in a column is
    | the demo failing at its first screen. Moves into the database with #67.
    |
    | It is a locale, not a language row - `InterfaceLocales` explains why the
    | two are different axes.
    |
    */

    'locale' => env('SITE_LOCALE'),

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
