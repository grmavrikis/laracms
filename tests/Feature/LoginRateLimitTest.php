<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    private function attemptLogin(string $email, string $password = 'wrong-password')
    {
        return $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
        ]);
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
