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

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);
    }

    // ------------------------------------------------------ the public side

    /**
     * The address carries the language, so the address decides. Nothing is
     * negotiated from a header: one page has one URL (#59), and a page whose
     * text changed with `Accept-Language` would have two.
     */
    public function test_a_page_is_rendered_in_the_language_of_its_address(): void
    {
        $this->get('/el')->assertOk()->assertSee('Όνομα', false)->assertDontSee('>Name<', false);
        $this->get('/en')->assertOk()->assertSee('Name', false)->assertDontSee('Όνομα', false);
    }

    /**
     * A language nobody has translated the theme into still renders - in the
     * keys, which are English. The alternative is a live page showing
     * `theme.form.name` to a visitor.
     */
    public function test_a_language_with_no_translation_falls_back_to_english(): void
    {
        Language::create(['name' => 'French', 'code' => 'fr']);

        $this->get('/fr')->assertOk()->assertSee('Name', false)->assertDontSee('theme.', false);
    }

    /**
     * The visitor is refused in the language they were reading. A validation
     * message is the one piece of core text an anonymous visitor ever sees.
     */
    public function test_a_visitor_is_refused_in_their_own_language(): void
    {
        // Followed to the page rather than read out of the session: the
        // message is only useful if it reaches the visitor, and #66's review
        // found that stopping at the redirect is how a whole class of defect
        // was missed.
        $this->from('/el')->post('/el/enquiries', $this->enquiry(['consent' => null]));
        $this->get('/el')->assertOk()->assertSee('στοιχεία σας', false);

        $this->flushSession();

        $this->from('/en')->post('/en/enquiries', $this->enquiry(['consent' => null]));
        $this->get('/en')->assertOk()->assertSee('agree to us keeping', false);
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

                $this->assertSame(
                    array_keys($reference),
                    array_keys($this->keysIn($file)),
                    "{$file} does not carry what en.json does."
                );
            }
        }
    }

    /**
     * The mount, like the theme's and the routes file's: core names where the
     * client's translations are and nothing about what is in them (#61).
     */
    public function test_the_client_side_of_the_translations_is_mounted(): void
    {
        $this->assertDirectoryExists(config('site.lang'));

        $this->assertSame('Name', __('Name', [], 'en'));
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

    /** @return array<int, string> */
    private function locales(): array
    {
        return collect(File::files(base_path('lang')))
            ->filter(fn($file) => $file->getExtension() === 'json')
            ->map(fn($file) => $file->getFilenameWithoutExtension())
            ->values()
            ->all();
    }

    /** @return array<string, string> */
    private function keysIn(string $path): array
    {
        return File::exists($path) ? json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR) : [];
    }
}
