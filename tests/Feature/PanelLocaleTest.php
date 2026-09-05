<?php

namespace Tests\Feature;

use App\Models\Language;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
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

        preg_match('/window\.miniCms\s*=\s*(\{.*?\});/s', $response->assertOk()->getContent(), $m);

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
