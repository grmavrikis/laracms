<?php

namespace Tests\Feature;

use App\Models\Language;
use App\Models\User;
use App\Services\InterfaceLocales;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Tests\TestCase;

/**
 * The panel speaks the language its reader chose (TASKS.md #96, panel half).
 *
 * **This is a different axis from the public site, and the two must not be
 * welded together.** The `languages` table holds the languages the *content*
 * is translated into; the language a person reads the *interface* in is their
 * own. A German owner may perfectly well run a Greek and English site, and a
 * Greek owner may want an English panel. Content languages are **rows**;
 * interface locales are **files** in `lang/`.
 *
 * Adding German to the panel is therefore `lang/de.json` and nothing else -
 * no migration, and **no `npm run build`**, which is why the strings are
 * injected into the page by the server rather than bundled by Vite. A locale
 * that needed a rebuild would not be one the owner can add.
 */
class PanelLocaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Content languages, deliberately not the same set as the interface
        // locales: nothing below may read these.
        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'French', 'code' => 'fr']);
    }

    /** What the server injected into the page, decoded. */
    private function panel(?User $user = null): array
    {
        $response = $user ? $this->actingAs($user)->get('/admin') : $this->get('/admin');

        preg_match('#window\.miniCms\s*=\s*(.*?);</script>#s', $response->assertOk()->getContent(), $m);

        $this->assertNotEmpty($m[1] ?? '', 'The panel page carries no injected settings.');

        return json_decode($m[1], true, flags: JSON_THROW_ON_ERROR);
    }

    // ------------------------------------------------------ which language

    public function test_the_panel_is_rendered_in_the_language_its_reader_chose(): void
    {
        $panel = $this->panel(User::factory()->create(['locale' => 'el']));

        $this->assertSame('el', $panel['locale']);
        $this->assertArrayHasKey('Admin Panel', $panel['messages']);
        $this->assertNotSame('Admin Panel', $panel['messages']['Admin Panel'], 'The catalogue came back untranslated.');
    }

    /**
     * Null means "whatever this installation is set to", not English. The
     * first market is Greek, and a panel that opens in English because nobody
     * filled in a column is the demo failing at its first screen.
     */
    public function test_a_user_who_has_chosen_nothing_gets_the_installation_s_language(): void
    {
        config(['site.locale' => 'el']);

        $this->assertSame('el', $this->panel(User::factory()->create(['locale' => null]))['locale']);
    }

    /**
     * There is no user yet on the login screen, so it can only be the
     * installation's language - and it has to be, or the first thing a Greek
     * owner sees is an English form.
     */
    public function test_the_login_screen_uses_the_installation_s_language(): void
    {
        config(['site.locale' => 'el']);

        $this->assertSame('el', $this->panel()['locale']);
    }

    /**
     * A locale nobody has written a file for cannot be served, whatever the
     * column says - otherwise a hand-edited row empties the panel's text.
     */
    public function test_a_locale_with_no_file_falls_back_rather_than_emptying_the_panel(): void
    {
        $panel = $this->panel(User::factory()->create(['locale' => 'de']));

        $this->assertSame(config('app.fallback_locale'), $panel['locale']);
        $this->assertNotSame([], $panel['messages']);
    }

    // ------------------------------------------------------- which are offered

    /**
     * The list is the files on disk. That is the whole of "manage it as I
     * like": drop `lang/de.json` in and German appears, with no migration and
     * no rebuild.
     */
    public function test_every_locale_with_a_file_is_offered(): void
    {
        $onDisk = collect(File::files(base_path('lang')))
            ->filter(fn($file) => $file->getExtension() === 'json')
            ->map(fn($file) => $file->getFilenameWithoutExtension())
            ->sort()->values()->all();

        $this->assertSame($onDisk, $this->panel(User::factory()->create())['locales']);
        $this->assertContains('el', $onDisk, 'The first market cannot read the panel.');
    }

    /**
     * The content languages are a different axis and must not leak into it.
     */
    public function test_the_content_languages_are_not_the_interface_locales(): void
    {
        $panel = $this->panel(User::factory()->create());

        $this->assertNotContains('fr', $panel['locales'], 'A content language became an interface locale.');
    }

    // ------------------------------------------------------------ changing it

    public function test_a_user_changes_their_own_language(): void
    {
        $user = User::factory()->create(['locale' => null]);

        $this->actingAs($user)->putJson('/api/user/locale', ['locale' => 'el'])->assertOk();

        $this->assertSame('el', $user->fresh()->locale);
    }

    public function test_a_locale_nobody_has_written_is_refused(): void
    {
        $user = User::factory()->create(['locale' => 'en']);

        $this->actingAs($user)->putJson('/api/user/locale', ['locale' => 'zz'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('locale');

        $this->assertSame('en', $user->fresh()->locale);
    }

    public function test_changing_a_language_needs_a_session(): void
    {
        $this->putJson('/api/user/locale', ['locale' => 'el'])->assertUnauthorized();
    }

    // --------------------------------------------------- the catalogue on disk

    /**
     * Point the application at a `lang/` of our own, so the cases below can be
     * built rather than described.
     */
    private function withLangPath(array $files, callable $assertions): void
    {
        $dir = sys_get_temp_dir() . '/zz-lang-' . uniqid();
        mkdir($dir);

        foreach ($files as $name => $contents)
        {
            file_put_contents("{$dir}/{$name}", $contents);
        }

        $was = $this->app->langPath();
        $this->app->useLangPath($dir);

        try
        {
            $assertions();
        }
        finally
        {
            $this->app->useLangPath($was);
            File::deleteDirectory($dir);
        }
    }

    /**
     * A broken catalogue must say so. Laravel's own loader throws on the same
     * file, so swallowing it here would make the public side strict and the
     * panel silent about one editing mistake.
     */
    public function test_a_catalogue_that_is_not_valid_json_is_refused(): void
    {
        $this->withLangPath(['el.json' => '{"Admin Panel": "Πίνακας",}'], function ()
        {
            $this->expectException(RuntimeException::class);

            app(InterfaceLocales::class)->messages('el');
        });
    }

    /**
     * If nothing configured has a file, serve one that does. Returning the
     * fallback regardless would hand the reader an empty catalogue - the very
     * thing the availability check exists to prevent.
     */
    public function test_a_fallback_with_no_file_does_not_win_over_one_that_has_one(): void
    {
        config(['app.fallback_locale' => 'de', 'site.locale' => null]);

        $this->withLangPath(['el.json' => '{"Admin Panel": "Πίνακας διαχείρισης"}'], function ()
        {
            $locales = app(InterfaceLocales::class);

            $this->assertSame('el', $locales->resolve(null));
            $this->assertNotSame([], $locales->forPanel(null)['messages']);
        });
    }

    /**
     * The directory is read once per request, not once per question. The
     * middleware runs on every API call and `forPanel()` asks twice.
     */
    public function test_the_catalogue_directory_is_read_once(): void
    {
        $this->withLangPath(['en.json' => '{"Admin Panel": "Admin Panel"}'], function ()
        {
            $locales = app(InterfaceLocales::class);

            $locales->forPanel(null);

            File::deleteDirectory($this->app->langPath());

            $this->assertSame(['en'], $locales->available(), 'The list was read from disk a second time.');
        });
    }

    /**
     * A locale is a filename, and a filename has no length limit; the column
     * does. #76 was exactly this - a value the validator accepted and MySQL
     * refused - and SQLite cannot see it, so the bound is asserted directly.
     */
    public function test_no_locale_on_disk_is_wider_than_the_column(): void
    {
        foreach (app(InterfaceLocales::class)->available() as $locale)
        {
            $this->assertLessThanOrEqual(
                User::LOCALE_MAX_LENGTH,
                strlen($locale),
                "lang/{$locale}.json cannot be stored in users.locale."
            );
        }
    }

    public function test_a_locale_too_long_for_the_column_is_refused(): void
    {
        $user = User::factory()->create(['locale' => 'en']);
        $long = str_repeat('a', User::LOCALE_MAX_LENGTH + 1);

        $this->withLangPath(["{$long}.json" => '{}', 'en.json' => '{}'], function () use ($user, $long)
        {
            $this->actingAs($user)->putJson('/api/user/locale', ['locale' => $long])
                ->assertStatus(422)
                ->assertJsonValidationErrors('locale');
        });

        $this->assertSame('en', $user->fresh()->locale);
    }

    // ------------------------------------------------------------- the API

    /**
     * The panel reads its errors from the API, so the API has to answer in
     * the same language the page is rendered in - otherwise the screen is
     * Greek until something goes wrong.
     */
    public function test_the_api_refuses_in_the_language_of_the_user_asking(): void
    {
        $greek = User::factory()->create(['locale' => 'el']);

        $message = $this->actingAs($greek)
            ->postJson('/api/modules', ['name' => 'Rooms', 'slug' => 'Not A Slug'])
            ->assertStatus(422)
            ->json('errors.slug.0');

        $this->assertMatchesRegularExpression('/\p{Greek}/u', $message, "Answered: {$message}");

        $english = User::factory()->create(['locale' => 'en']);

        $this->assertStringContainsString(
            'lowercase',
            $this->actingAs($english)
                ->postJson('/api/modules', ['name' => 'Rooms', 'slug' => 'Not A Slug'])
                ->assertStatus(422)
                ->json('errors.slug.0')
        );
    }

    /**
     * The two halves of the picker, joined: change the language, then read the
     * page. Each was covered on its own and the flow between them was not.
     */
    public function test_changing_the_language_changes_what_the_panel_serves(): void
    {
        $user = User::factory()->create(['locale' => 'en']);

        $this->assertSame('Admin Panel', $this->panel($user)['messages']['Admin Panel']);

        $this->actingAs($user)->putJson('/api/user/locale', ['locale' => 'el'])->assertOk();

        $panel = $this->panel($user->fresh());

        $this->assertSame('el', $panel['locale']);
        $this->assertNotSame('Admin Panel', $panel['messages']['Admin Panel']);
    }

    /**
     * The public side is unaffected by whoever happens to be signed in: a
     * visitor's language comes from the address (#96, public half).
     */
    public function test_a_signed_in_user_does_not_change_what_a_visitor_reads(): void
    {
        $this->actingAs(User::factory()->create(['locale' => 'el']))
            ->get('/fr')
            ->assertOk()
            ->assertDontSee('Όνομα', false);
    }
}
