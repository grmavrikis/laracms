<?php

namespace Tests\Feature;

use App\Models\Language;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * The application speaks the language it is being read in (TASKS.md #96).
 *
 * Until this, every message in PHP and JavaScript was hardcoded English and
 * `App::setLocale()` was called nowhere at all. A multilingual CMS whose own
 * interface is monolingual does not demonstrate the one thing it is better at,
 * and a French page carrying `Όνομα / Name *` is not bilingual - it is two
 * languages jammed into one label, which fails on the third.
 *
 * **Two spaces, two owners.** Core ships `lang/`, which every installation
 * gets; the theme's labels are the client's and live in `site/lang/` beside
 * the theme (#61). They are merged into one JSON namespace, so a key in both
 * would be resolved by whichever the loader reads last - a collision test
 * below turns that into a failure rather than a surprise on somebody's site.
 *
 * **The key is the English text.** An untranslated string therefore reads as
 * English rather than as `theme.form.name`, which is what makes translating
 * incrementally possible instead of all-or-nothing.
 *
 * That the middleware costs **no query** is not pinned here but by
 * `PageCacheTest::test_a_cache_hit_touches_the_database_not_at_all`: it runs
 * over a route the middleware is on, so a lookup added there fails it. Setting
 * the locale from the address must stay free, or it resolves the language on
 * every visit including a cache hit - the one thing #59 exists to prevent.
 */
class TranslationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->languages('el', 'en');
    }

    // ------------------------------------------------------ the public side

    /**
     * The address carries the language, so the address decides. Nothing is
     * negotiated from a header: one page has one URL (#59), and a page whose
     * text changed with `Accept-Language` would have two.
     */
    public function test_a_page_is_rendered_in_the_language_of_its_address(): void
    {
        // `assertDontSee('>Name<')` used to stand here and could never match:
        // the label renders as `Name *`, so dropping the Greek translation
        // would have shown `>Name *<` and the assertion would still have
        // passed (TASKS.md #108). The label itself is what to look for.
        $this->get('/el')->assertOk()->assertSee('Όνομα', false)->assertDontSee('>Name *<', false);
        $this->get('/en')->assertOk()->assertSee('>Name *<', false)->assertDontSee('Όνομα', false);
    }

    /**
     * A language nobody has translated the theme into still renders - in the
     * keys, which are English. The alternative is a live page showing
     * `theme.form.name` to a visitor.
     */
    public function test_a_language_with_no_translation_falls_back_to_english(): void
    {
        $this->languages('fr');

        // A site gaining a language does not gain a second default with it -
        // the helper only flags one when the site has none, and two rows
        // claiming it would make a listing open on whichever came back first.
        $this->assertSame(1, Language::query()->where('is_default', true)->count());

        // Not `assertDontSee('theme.')`, which guarded against a
        // namespaced-key format this design does not use and so could never
        // fire (#108). What matters is that the *key* is what shows, which is
        // English - and that the Greek translation is not what a French
        // visitor gets.
        $this->get('/fr')->assertOk()->assertSee('>Name *<', false)->assertDontSee('Όνομα', false);
    }

    /**
     * The visitor is refused in the language they were reading. A validation
     * message is the one piece of core text an anonymous visitor ever sees.
     */
    public function test_a_visitor_is_refused_in_their_own_language(): void
    {
        // Read out of the answer the visitor's browser is handed, which since
        // #97 is JSON: the form is a JS island and the page it sits on is
        // cached, so a refusal never travels through the session and following
        // the redirect would now assert against a page rendered before the
        // submission existed. The rule behind #66's review still holds - the
        // message is only useful if it reaches the visitor - and this is where
        // it reaches them.
        $greek = $this->postJson('/el/enquiries', $this->enquiry(['consent' => null]))
            ->assertStatus(422)
            ->json('errors.consent.0');

        $english = $this->postJson('/en/enquiries', $this->enquiry(['consent' => null]))
            ->assertStatus(422)
            ->json('errors.consent.0');

        $this->assertStringContainsString('στοιχεία σας', $greek);
        $this->assertStringContainsString('agree to us keeping', $english);
    }

    // ------------------------------------------------------- the two spaces

    /**
     * Core and the client share one JSON namespace, and the loader merges
     * them. A key written on both sides is silently won by one of them, which
     * is a defect nobody would look for - so it is a failing test instead.
     */
    public function test_core_and_the_client_do_not_claim_the_same_key(): void
    {
        foreach ($this->locales() as $locale)
        {
            $shared = array_intersect_key(
                $this->keysIn(base_path("lang/{$locale}.json")),
                $this->keysIn(config('site.lang') . "/{$locale}.json")
            );

            $this->assertSame([], array_keys($shared), "Both sides translate these in {$locale}.");
        }
    }

    /**
     * A half-translated release reaches a client as a page in two languages.
     * English is the reference because the keys are English.
     */
    public function test_every_locale_carries_the_same_keys_as_english(): void
    {
        foreach ([base_path('lang'), config('site.lang')] as $directory)
        {
            $reference = $this->keysIn("{$directory}/en.json");

            foreach ($this->locales() as $locale)
            {
                if ($locale === 'en' || !File::exists($file = "{$directory}/{$locale}.json"))
                {
                    continue;
                }

                // **Membership, not order** (TASKS.md #105). `assertSame`
                // on the keys failed the suite for alphabetising a file or
                // adding a pair at the top, with a whole-array diff that reads
                // as a missing translation.
                $this->assertEqualsCanonicalizing(
                    array_keys($reference),
                    array_keys($this->keysIn($file)),
                    "{$file} does not carry what en.json does."
                );
            }
        }
    }

    /**
     * **A locale only the client has is compared too** (TASKS.md #102).
     *
     * The list came from core's `lang/` alone, so the one case in this
     * mechanism that involves a client rather than the agency - somebody
     * activating Italian and writing `site/lang/it.json` - was never compared
     * with anything. Half the keys, a green suite, and an Italian page shipping
     * half in English.
     *
     * Arranged rather than waited for: this installation has no such locale
     * today, so a fix here could not otherwise be told from no fix at all.
     */
    public function test_a_locale_only_the_client_has_is_still_on_the_list(): void
    {
        $directory = storage_path('framework/testing/zz-site-lang-' . getmypid());

        File::ensureDirectoryExists($directory);
        File::put($directory . '/en.json', json_encode(['A' => 'A']));
        File::put($directory . '/it.json', json_encode(['A' => 'A']));

        config(['site.lang' => $directory]);

        try
        {
            $this->assertContains('it', $this->locales(), 'A locale only the client has is never compared with anything.');
            $this->assertContains('en', $this->locales());
        }
        finally
        {
            File::deleteDirectory($directory);
        }
    }

    // ------------------------------------------------------------- helpers

    private function enquiry(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Maria',
            'email' => 'maria@example.com',
            'message' => 'Do you have a room?',
            'consent' => '1',
        ], $overrides);
    }

    /**
     * Every locale **either side** has a file for (TASKS.md #102).
     *
     * It listed core's `lang/` alone, so a locale a *client* added - the only
     * case in this mechanism that involves a client rather than the agency -
     * was never compared with anything. Somebody activates Italian, writes
     * `site/lang/it.json` with four of the fourteen keys, and the suite stays
     * green while the Italian page ships half in English, which is precisely
     * what the parity test's docblock claims to catch.
     *
     * The collision test reads the same list and is unaffected either way: a
     * collision needs the key on both sides, so a locale core has no file for
     * cannot have one.
     *
     * @return array<int, string>
     */
    private function locales(): array
    {
        return collect([base_path('lang'), config('site.lang')])
            ->flatMap(fn(string $directory) => File::exists($directory) ? File::files($directory) : [])
            ->filter(fn($file) => $file->getExtension() === 'json')
            ->map(fn($file) => $file->getFilenameWithoutExtension())
            ->unique()
            ->sort()
            ->values()
            ->all();
    }

    /** @return array<string, string> */
    private function keysIn(string $path): array
    {
        return File::exists($path) ? json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR) : [];
    }
}
