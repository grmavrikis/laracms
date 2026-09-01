<?php

namespace Tests\Feature;

use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The seeder is step one of the README, and nothing covered it.
 *
 * It referenced `User` without importing it, so in namespace Database\Seeders
 * that resolved to a class which does not exist and `migrate --seed` died
 * before writing anything at all. A fresh checkout could not be started.
 */
class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_the_test_account(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseHas('users', ['email' => 'test@example.com']);
    }

    /**
     * The README hands out these credentials, so they have to work.
     */
    public function test_the_seeded_account_can_sign_in(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->postJson('/api/login', [
            'email' => 'test@example.com',
            'password' => 'password',
        ])->assertOk();
    }

    /**
     * The seeded language was `gr`. The ISO code for Greek is `el`, which is
     * what the languages migration gives as its own example, and it is the key
     * every translation in `Entry.data` would be stored under.
     */
    public function test_it_seeds_greek_under_its_iso_code(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseHas('languages', ['code' => 'el']);
        $this->assertDatabaseMissing('languages', ['code' => 'gr']);
    }

    /**
     * Nothing in the codebase ever wrote `is_default`, so on a fresh install
     * no language carried it and the admin panel fell back to whichever came
     * first by id - see TASKS.md #49.
     */
    public function test_the_seeded_language_is_the_default_and_is_active(): void
    {
        $this->seed(DatabaseSeeder::class);

        $language = Language::sole();

        $this->assertTrue($language->is_default);
        $this->assertTrue($language->is_active);
    }

    /**
     * Rows were written with DB::table()->updateOrInsert(), which does not fill
     * timestamps. `latest()` orders by created_at, so a seeded module with a
     * null one sorts unpredictably against everything created afterwards.
     */
    public function test_seeded_rows_carry_timestamps(): void
    {
        $this->seed(DatabaseSeeder::class);

        $module = Module::where('slug', 'projects')->sole();

        $this->assertNotNull($module->created_at);
        $this->assertNotNull($module->updated_at);
        $this->assertNotNull(Language::sole()->created_at);
    }

    public function test_the_seeded_module_belongs_to_the_seeded_user(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(
            User::where('email', 'test@example.com')->sole()->id,
            Module::where('slug', 'projects')->sole()->user_id
        );
    }

    /**
     * Exactly one language may be the default, and nothing in the schema
     * enforces it - so seeding an install that already has one used to leave
     * two rows flagged, with `defaultLanguage()` silently taking whichever
     * `/api/languages` returned first.
     *
     * RefreshDatabase means test_the_seeded_language_is_the_default cannot see
     * this: it always starts from an empty table, which is the one case where
     * claiming the flag is safe.
     */
    public function test_it_does_not_add_a_second_default_language(): void
    {
        Language::create([
            'code' => 'en',
            'name' => 'English',
            'is_default' => true,
            'is_active' => true,
        ]);

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(1, Language::where('is_default', true)->count());
        $this->assertSame('en', Language::where('is_default', true)->sole()->code);
        $this->assertDatabaseHas('languages', ['code' => 'el', 'is_default' => false]);
    }

    /**
     * The seeder uses updateOrCreate throughout precisely so it can be re-run
     * against a database that already has these rows.
     */
    public function test_it_is_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(1, User::where('email', 'test@example.com')->count());
        $this->assertSame(1, Language::count());
        $this->assertSame(1, Module::where('slug', 'projects')->count());
    }
}
