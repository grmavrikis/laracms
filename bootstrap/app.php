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

        // Entry payloads carry rich-text documents. A mark splits a sentence
        // into several text nodes, and the spaces between words sit at the
        // edges of those nodes ("Κάτι ", "έντονο", " εδώ"). Trimming each
        // string on its own would glue the words together on save. Content is
        // stored as the author typed it.
        $middleware->trimStrings(except: ['data.*']);
    })
    ->withExceptions(function (Exceptions $exceptions): void
    {
        $exceptions->shouldRenderJsonWhen(
            fn(Request $request) => $request->is('api/*'),
        );
    })->create();
