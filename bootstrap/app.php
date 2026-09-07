<?php

use App\Services\Redirects;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

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

        // Those limiters key on $request->ip(). Behind a reverse proxy that is
        // the *proxy's* address unless the proxy is trusted here - so every
        // visitor would share one bucket and a single busy client would lock
        // out the whole site. That is the deployment this project is heading
        // for (BUSINESS.md: a VPS holding several sites).
        //
        // Empty by default on purpose, and this is the dangerous direction:
        // trusting a proxy that is not in front of the app lets anyone spoof
        // X-Forwarded-For and mint a fresh rate-limit bucket per request,
        // which is worse than the problem. Set TRUSTED_PROXIES only for a
        // proxy that actually exists - '127.0.0.1' for nginx on the same host,
        // '*' only where the application cannot be reached directly.
        $proxies = trim((string) env('TRUSTED_PROXIES', ''));

        if ($proxies !== '')
        {
            $middleware->trustProxies(
                at: $proxies === '*' ? '*' : array_map('trim', explode(',', $proxies))
            );
        }

        // Named so a route can still declare it, and **on the whole web group**
        // (TASKS.md #104): a page under `/{language}` that a client writes in
        // `site/routes.php` wants the same locale the core pages get, and
        // "they can opt in" put that requirement in a comment nobody writing a
        // route would read. It resolves nothing and queries nothing, so the
        // cache-before-database rule the public side rests on still holds -
        // and a first segment that is not a language code leaves the locale
        // exactly as it was, which is every panel and sitemap address.
        $middleware->alias(['locale' => \App\Http\Middleware\SetLocale::class]);

        $middleware->web(append: [\App\Http\Middleware\SetLocale::class]);

        // The panel's half of the same question (#96). Appended to the group
        // rather than declared per route, because every error the panel shows
        // comes from some endpoint here and one that answered in English
        // would look like a fault rather than a missing translation. It runs
        // for unauthenticated requests too, where it resolves to the
        // installation's locale - which is what /admin was rendered in, so a
        // refused password is refused in the language of the form.
        $middleware->api(append: [\App\Http\Middleware\SetPanelLocale::class]);

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
        // Two clauses, and they answer different questions.
        //
        // `api/*` is **forced**, header or no header: an API URL opened in a
        // browser sends `Accept: text/html`, and answering it with a redirect
        // to a login page this application does not have was a 500 (§2).
        //
        // `expectsJson()` is Laravel's own default, put back. Passing a
        // callback *replaces* the default rather than adding to it, so
        // narrowing to `api/*` quietly took JSON errors away from every other
        // route - including the public enquiry endpoint, which since #97 is
        // posted by JavaScript and reads the answer. Nothing pinned that,
        // because until now nothing outside `api/*` ever asked.
        //
        // A plain browser form post sends no such header and still gets its
        // redirect, which is what `EnquiryTest` keeps honest.
        $exceptions->shouldRenderJsonWhen(
            fn(Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * An address that has moved answers 301 rather than 404 (TASKS.md #69,
         * and step three of #114).
         *
         * Here rather than in a middleware on purpose. This is the one moment
         * the question is worth asking - the router and the controller have
         * both declined, so a row can only ever add an answer where there was
         * none, never hide a page that is live. It also catches both kinds of
         * miss: a renamed module still matches `/{language}/{module}` and 404s
         * inside the controller, while `/rooms/deluxe.html` from the site being
         * replaced matches no route at all.
         *
         * Returning null leaves Laravel's own 404 exactly as it was.
         */
        $exceptions->render(
            fn (NotFoundHttpException $e, Request $request) => app(Redirects::class)->answer($request)
        );
    })->create();
