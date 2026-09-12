<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\Support\TranslatedLiterals;
use Tests\TestCase;

/**
 * **Every string the code translates is in the catalogue** (TASKS.md #103).
 *
 * `lang/en.json` and `site/lang/en.json` are identity maps - every key is its
 * own value - and until now nothing compared them with the code at all. The
 * parity test compares the locales with English and the collision test compares
 * the two sides with each other, so the catalogue was only ever compared with
 * itself: a new `__('Cancel')` that nobody added was invisible to the whole
 * mechanism, and a Greek reader saw *Cancel*.
 *
 * This is what makes the English files earn their place. Without it they are
 * duplication with a ceremony attached; with it they are the list a translator
 * works from, and a string missing from that list is a failing test rather than
 * an English word on somebody's site.
 *
 * ### What counts as a string the code translates
 *
 * Only literals. `__($field['label'])` cannot be checked here and is not meant
 * to be - the value it resolves to is itself built from literals somewhere
 * else, and that is where it is caught.
 *
 * **How the code is read lives in `Tests\Support\TranslatedLiterals`**, which
 * `CatalogueHasNoOrphansTest` needs too: that one asks the same question in the
 * other direction, and two copies of the scan would give two answers.
 */
class CatalogueCoversTheCodeTest extends TestCase
{
    /**
     * The theme's strings are the client's, and live beside the theme (#61).
     */
    public function test_every_string_the_theme_translates_is_in_the_clients_catalogue(): void
    {
        $this->assertEveryLiteralIsInTheCatalogue(
            TranslatedLiterals::inBlade(config('site.theme')),
            config('site.lang') . '/en.json'
        );
    }

    /** Core's own, in `lang/en.json`: PHP, core's Blade, and the panel. */
    public function test_every_string_core_translates_is_in_its_catalogue(): void
    {
        $this->assertEveryLiteralIsInTheCatalogue(
            TranslatedLiterals::everywhereCoreTranslates(),
            base_path('lang/en.json')
        );
    }

    /**
     * The keys are the English text, so the English file is an identity map -
     * and one that is not says the catalogue and the code have drifted in the
     * other direction: a key whose value was edited would translate English
     * into something else.
     */
    public function test_the_english_catalogues_are_identity_maps(): void
    {
        foreach ([base_path('lang/en.json'), config('site.lang') . '/en.json'] as $file)
        {
            foreach (json_decode(File::get($file), true, flags: JSON_THROW_ON_ERROR) as $key => $value)
            {
                $this->assertSame($key, $value, "{$file} translates a key into something other than itself.");
            }
        }
    }

    // ------------------------------------------------------------- reading

    /**
     * @param array<string, string> $literals key => where it was found
     */
    private function assertEveryLiteralIsInTheCatalogue(array $literals, string $cataloguePath): void
    {
        $catalogue = json_decode(File::get($cataloguePath), true, flags: JSON_THROW_ON_ERROR);

        $this->assertGreaterThan(10, count($literals), 'Nothing was read - the scan stopped finding translated strings.');

        foreach ($literals as $key => $where)
        {
            $this->assertArrayHasKey(
                $key,
                $catalogue,
                "{$where} translates a string that " . basename(dirname($cataloguePath)) . "/en.json does not carry: \"{$key}\""
            );
        }
    }

}
