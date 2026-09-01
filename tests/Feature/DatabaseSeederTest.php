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
     * `el` is the ISO code for Greek, the example the languages migration
     * gives, and the key every translation in `Entry.data` is stored under.
     *
     * This deliberately does not also assert that `gr` is absent: on a
     * RefreshDatabase table nothing ever creates it, so the assertion would
     * hold even if the seeder wrote no language at all.
     */
    public function test_it_seeds_greek_under_its_iso_code(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame('el', Language::sole()->code);
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
     * The seeded module is example content: once an install exists it belongs
     * to whoever has been editing it. Re-seeding used to reset `name` and
     * `schema`, which orphans every value already stored under a field
     * somebody added - the entry data stays in `data` under a key the schema
     * no longer mentions.
     */
    public function test_it_does_not_overwrite_a_module_that_has_been_edited(): void
    {
        $this->seed(DatabaseSeeder::class);

        Module::where('slug', 'projects')->sole()->update([
            'name' => 'Renamed by the client',
            'schema' => [['name' => 'added_field', 'type' => 'string', 'translatable' => false]],
        ]);

        $this->seed(DatabaseSeeder::class);

        $module = Module::where('slug', 'projects')->sole();

        $this->assertSame('Renamed by the client', $module->name);
        $this->assertSame('added_field', $module->schema[0]['name']);
    }

    /**
     * Same reasoning for a language somebody deliberately switched off.
     */
    public function test_it_does_not_reactivate_a_disabled_language(): void
    {
        $this->seed(DatabaseSeeder::class);

        Language::where('code', 'el')->update(['is_active' => false]);

        $this->seed(DatabaseSeeder::class);

        $this->assertFalse(Language::where('code', 'el')->sole()->is_active);
    }

    /**
     * The seeder never overwrites, precisely so it can be re-run against a
     * database that already has these rows.
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
