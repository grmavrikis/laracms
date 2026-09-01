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
        // police ordinary use of the panel, where saving one entry can be
        // several requests in a row.
        //
        // `??`, not `?:`: a falsy identifier would silently key by address
        // instead, merging that account's quota with every anonymous request
        // from the same place. ModuleController records the same decision for
        // the same reason - "0" is falsy in PHP and a falsy test discards a
        // value the client actually supplied.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
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
