<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SchemaRuleBuilder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Nothing in the application throttled anything.
 *
 * Laravel adds a limiter to the `api` middleware group only when
 * `throttleApi()` is called, and bootstrap/app.php never called it - so
 * POST /api/login accepted unlimited password guesses at whatever rate the
 * web server would serve them. A single account makes that easier to attack,
 * not harder: there is only one email to guess against.
 */
class LoginRateLimitTest extends TestCase
{
    use RefreshDatabase;

    /** Matches the `login` limiter in AppServiceProvider. */
    private const ATTEMPTS_PER_MINUTE = 5;

    private function attemptLogin(string $email, string $password = 'wrong-password', array $headers = [])
    {
        return $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
        ], $headers);
    }

    /**
     * The limiter reads `email` to build its key, and throttle middleware runs
     * *before* validation - so whatever the client sent arrives raw. Casting a
     * non-string to string threw, and the only public endpoint in the
     * application answered 500 to anybody who asked.
     */
    public function test_a_non_string_email_is_rejected_rather_than_erroring(): void
    {
        $this->postJson('/api/login', ['email' => ['a', 'b'], 'password' => 'x'])
            ->assertStatus(422);

        $this->postJson('/api/login', ['email' => ['k' => 'v'], 'password' => 'x'])
            ->assertStatus(422);

        $this->postJson('/api/login', ['email' => 5, 'password' => 'x'])
            ->assertStatus(422);
    }

    /**
     * Both limits key on the client address, so anyone able to dictate what
     * Laravel believes that address to be gets an unlimited supply of buckets.
     *
     * No proxy is trusted unless TRUSTED_PROXIES says so (bootstrap/app.php),
     * which is what makes X-Forwarded-For inert here. This test exists to fail
     * loudly if that is ever widened to `*` while the app is still reachable
     * directly.
     */
    public function test_a_forwarded_header_cannot_split_the_rate_limit_bucket(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < self::ATTEMPTS_PER_MINUTE; $i++)
        {
            $this->attemptLogin($user->email, 'wrong-password', ['X-Forwarded-For' => "203.0.113.{$i}"])
                ->assertUnauthorized();
        }

        $this->attemptLogin($user->email, 'wrong-password', ['X-Forwarded-For' => '203.0.113.99'])
            ->assertStatus(429);
    }

    public function test_repeated_failures_are_locked_out(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < self::ATTEMPTS_PER_MINUTE; $i++)
        {
            $this->attemptLogin($user->email)->assertUnauthorized();
        }

        $this->attemptLogin($user->email)->assertStatus(429);
    }

    /**
     * The lockout has to survive the correct password too. Guessing until the
     * right one is found is the whole attack, so a hit that arrives after the
     * limit must not be honoured.
     */
    public function test_the_lockout_holds_even_for_the_right_password(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < self::ATTEMPTS_PER_MINUTE; $i++)
        {
            $this->attemptLogin($user->email)->assertUnauthorized();
        }

        $this->attemptLogin($user->email, 'password')->assertStatus(429);
    }

    /**
     * Keyed by email *and* address, so someone hammering one account from
     * rotating addresses cannot lock its real owner out of signing in.
     */
    public function test_one_account_being_attacked_does_not_lock_out_another(): void
    {
        $attacked = User::factory()->create();
        $other = User::factory()->create();

        for ($i = 0; $i < self::ATTEMPTS_PER_MINUTE; $i++)
        {
            $this->attemptLogin($attacked->email)->assertUnauthorized();
        }

        $this->attemptLogin($attacked->email)->assertStatus(429);
        $this->attemptLogin($other->email, 'password')->assertOk();
    }

    /**
     * The `login` limiter is declared on its route, so every test above would
     * still pass with `throttleApi()` deleted from bootstrap/app.php - leaving
     * every other endpoint unlimited again, which is the state this was all
     * meant to fix.
     *
     * Presence of the header is the assertion, not its value: what has to hold
     * is that the group carries a limiter at all.
     */
    public function test_the_api_group_carries_a_limiter_of_its_own(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/modules')
            ->assertOk()
            ->assertHeader('X-RateLimit-Limit');
    }

    /**
     * The api limit and the gallery ceiling were set independently, and a
     * gallery upload is one request per image: at 120 a minute against 100
     * allowed images there were about fifteen requests of headroom for
     * everything else, so a second batch in the same minute started answering
     * 429 - reported to the author as images that "could not be uploaded".
     *
     * Asserted as a relationship rather than a number, so that raising either
     * one without looking at the other fails here.
     */
    public function test_the_api_limit_leaves_room_for_a_full_gallery_upload(): void
    {
        $limit = app(RateLimiter::class)
            ->limiter('api')(Request::create('/api/upload', 'POST'));

        $this->assertGreaterThan(
            SchemaRuleBuilder::GALLERY_MAX_IMAGES * 2,
            $limit->maxAttempts,
            'One request per image: the api limit has to fit a full gallery upload and the panel traffic around it.'
        );
    }

    /**
     * A few honest typos must not lock somebody out of their own panel.
     */
    public function test_a_correct_password_still_works_after_a_couple_of_typos(): void
    {
        $user = User::factory()->create();

        $this->attemptLogin($user->email)->assertUnauthorized();
        $this->attemptLogin($user->email)->assertUnauthorized();

        $this->attemptLogin($user->email, 'password')->assertOk();
    }
}
