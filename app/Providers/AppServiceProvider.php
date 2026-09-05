<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use App\Models\Enquiry;
use Illuminate\Http\Request;
use Illuminate\Mail\Markdown;
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
        // The path is a config value rather than a literal: it is core's only
        // knowledge of where the client's directory is, and keeping it in one
        // place is what lets a test point it elsewhere without editing the
        // repository's own files.
        $this->loadViewsFrom(config('site.theme'), 'theme');

        // The theme's labels, on the same terms as its templates (#96). A JSON
        // path rather than a namespace, so a template writes `__('Name')` and
        // an untranslated language falls back to the key - which is the
        // English text - instead of printing `theme::form.name` at a visitor.
        $this->loadJsonTranslationsFrom(config('site.lang'));

        $this->registerRateLimiters();
        $this->secureMarkdownMail();
    }

    /**
     * Laravel puts a limiter in the `api` middleware group only when
     * bootstrap/app.php calls throttleApi(). It did not, and no route declared
     * a throttle of its own, so nothing in this application was rate limited -
     * including /api/login, which accepted unlimited password guesses as fast
     * as the web server would serve them. A single account makes that easier
     * to attack rather than harder: there is only one email to guess against.
     */
    /**
     * The visitor writes the enquiry and the owner reads it in a mail client
     * that trusts the sender, because it is their own site.
     *
     * Laravel's Markdown mails run every `{{ }}` through a Markdown parser
     * after escaping it as HTML, so `[Confirm your booking](https://phish.example)`
     * in the message arrived as a **live link** in the owner's inbox - HTML
     * escaping does not touch Markdown syntax. This is the framework's own
     * answer: `[`, `<` and `>` in an echoed value are escaped so they render
     * as the characters the visitor typed.
     *
     * Registered once for the whole application rather than in the one
     * mailable, because the next mail added would otherwise have to remember.
     */
    private function secureMarkdownMail(): void
    {
        Markdown::withSecuredEncoding();
    }

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

        // The public enquiry form. Open to the internet, so far below the
        // `api` limit - a visitor with a genuine question sends one, and an
        // open write endpoint is otherwise somebody's afternoon.
        //
        // Keyed on the address alone. The throttle middleware runs **before**
        // validation, so anything read out of the payload here is whatever
        // the client sent - that trap cost a 500 on the login limiter once
        // already, and there is nothing in this payload worth keying on.
        RateLimiter::for('enquiries', fn (Request $request) => Limit::perHour(Enquiry::PER_HOUR)
            ->by($request->ip()));

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
