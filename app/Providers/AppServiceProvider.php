<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Requests a minute on the API as a whole.
     *
     * This number and `SchemaRuleBuilder::GALLERY_MAX_IMAGES` were set
     * independently, and a gallery upload is **one request per image**: at 120
     * against 100 allowed images there were about fifteen requests of headroom
     * for the panel's own traffic and the entry save that follows, so a second
     * batch inside the same minute began answering 429 - which reaches the
     * author as images that "could not be uploaded", reading as a problem with
     * the files.
     *
     * `LoginRateLimitTest` asserts the relationship rather than this value, so
     * raising either one without looking at the other fails there.
     */
    private const API_PER_MINUTE = 300;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The per-client side of the line (TASKS.md #61).
        //
        // A namespace rather than another path in the view finder, so a
        // client's template cannot shadow a core one by being named the same,
        // and the whole directory can be swapped for the next client without
        // touching anything here. Core renders `theme::layout`; it never names
        // a file inside.
        //
        // Registered by convention, so core reads the location and not the
        // contents - it does not know or care what a given client put there.
        $this->loadViewsFrom(base_path('site/theme'), 'theme');

        $this->registerRateLimiters();
    }

    /**
     * Laravel puts a limiter in the `api` middleware group only when
     * bootstrap/app.php calls throttleApi(). It did not, and no route declared
     * a throttle of its own, so nothing in this application was rate limited -
     * including /api/login, which accepted unlimited password guesses as fast
     * as the web server would serve them. A single account makes that easier
     * to attack rather than harder: there is only one email to guess against.
     */
    private function registerRateLimiters(): void
    {
        // The broad limit, applied to every /api route by throttleApi().
        // Deliberately generous - it exists to stop a runaway client, not to
        // police ordinary use of the panel.
        //
        // `??`, not `?:`: a falsy identifier would silently key by address
        // instead, merging that account's quota with every anonymous request
        // from the same place. ModuleController records the same decision for
        // the same reason - "0" is falsy in PHP and a falsy test discards a
        // value the client actually supplied.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(self::API_PER_MINUTE)
            ->by($request->user()?->id ?? $request->ip()));

        // Signing in gets its own, far tighter limit, declared on the route.
        RateLimiter::for('login', function (Request $request)
        {
            // Throttle middleware runs *before* validation, so `email` is
            // whatever the client sent - an array, an object, a number.
            // Casting that to string threw, and the only endpoint anybody can
            // reach without signing in answered 500 to a one-line request.
            // Anything that is not a string keys as empty and goes on to be
            // refused by validation, which is what should have happened.
            $email = $request->input('email');
            $email = is_string($email) ? Str::lower($email) : '';

            return [
                // Keyed by address *and* email together. Keyed by email alone,
                // an attacker working through addresses against one account
                // would lock its real owner out of their own panel.
                Limit::perMinute(5)->by($email . '|' . $request->ip()),
                // And by address alone, so working through many emails from
                // one place is caught as well - which the key above would not
                // see.
                Limit::perMinute(20)->by($request->ip()),
            ];
        });
    }
}
