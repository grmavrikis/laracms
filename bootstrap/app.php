<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void
    {
        // Enable stateful API for Sanctum
        $middleware->statefulApi();

        // Without this call Laravel puts no limiter in the `api` group at all,
        // and nothing here declared one - so every endpoint, /api/login
        // included, accepted requests as fast as they could be sent. The
        // `api` and `login` limiters are defined in AppServiceProvider.
        $middleware->throttleApi();

        // Entry payloads carry rich-text documents. A mark splits a sentence
        // into several text nodes, and the spaces between words sit at the
        // edges of those nodes ("Κάτι ", "έντονο", " εδώ"). Trimming each
        // string on its own would glue the words together on save. Content is
        // stored as the author typed it.
        $middleware->trimStrings(except: ['data.*']);

        // There is no route named `login` to send a guest to: authentication
        // is an API call and /admin is a client-side shell. Laravel's default
        // callback builds that redirect while *constructing* the
        // AuthenticationException, so it threw RouteNotFoundException before
        // the handler could turn the failure into a 401 - any /api/* URL
        // opened without an `Accept: application/json` header answered 500.
        // Returning null leaves the exception with no redirect, and the
        // handler answers 401 either way.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void
    {
        $exceptions->shouldRenderJsonWhen(
            fn(Request $request) => $request->is('api/*'),
        );
    })->create();
