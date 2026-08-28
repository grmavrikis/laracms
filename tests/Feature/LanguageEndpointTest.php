<?php

namespace Tests\Feature;

use App\Models\Language;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Languages are installation-wide rather than owned, so this endpoint has no
 * ownership check - but it is still behind authentication, and the order it
 * returns matters because the admin panel displays the first one it receives.
 */
class LanguageEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function makeLanguage(string $code, string $name, bool $active = true, bool $default = false): Language
    {
        return Language::create([
            'code' => $code,
            'name' => $name,
            'is_active' => $active,
            'is_default' => $default,
        ]);
    }

    public function test_it_requires_authentication(): void
    {
        $this->getJson('/api/languages')->assertUnauthorized();
    }

    public function test_it_returns_only_active_languages(): void
    {
        $this->makeLanguage('gr', 'Greek');
        $this->makeLanguage('en', 'English');
        $this->makeLanguage('de', 'German', active: false);

        $codes = $this->actingAs(User::factory()->create())
            ->getJson('/api/languages')
            ->assertOk()
            ->json('*.code');

        $this->assertSame(['gr', 'en'], $codes);
    }

    public function test_the_order_is_deterministic(): void
    {
        // Inserted out of id order so an unordered query could disagree.
        $this->makeLanguage('gr', 'Greek');
        $this->makeLanguage('en', 'English', default: true);
        $this->makeLanguage('fr', 'French');

        $user = User::factory()->create();

        foreach (range(1, 3) as $ignored)
        {
            $codes = $this->actingAs($user)->getJson('/api/languages')->json('*.code');

            $this->assertSame(['gr', 'en', 'fr'], $codes);
        }
    }
}
