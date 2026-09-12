<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\Support\TranslatedLiterals;
use Tests\TestCase;

/**
 * **Every string in the catalogue is one the code still asks for**
 * (TASKS.md #117 item 20).
 *
 * `CatalogueCoversTheCodeTest` checks one direction: a `__('…')` the catalogue
 * does not carry is a Greek page shipping an English word. Nothing checked the
 * other, so a key whose call site was renamed or deleted simply stayed.
 *
 * A catalogue is the list a translator works from, and `BUSINESS.md` prices
 * adding a language as a **billable service** - so every orphan is a sentence
 * somebody is paid to translate into a language nobody will read it in.
 *
 * They accumulate quietly and in ordinary work: three arrived in a single item
 * of #117 when `Lang` and `Req` became `Translatable` and `Required`, and the
 * suite stayed green through all of it.
 *
 * ### The one thing to be careful of
 *
 * A key reached only through a variable - `__($field['label'])` - looks like an
 * orphan to any scan, because the literal that feeds it lives elsewhere. There
 * are none today; if one appears, the fix is to give the scan the file that
 * builds the value, not to loosen this test.
 */
class CatalogueHasNoOrphansTest extends TestCase
{
    /**
     * The panel and the backend share `lang/en.json` deliberately (#96): the
     * catalogue is injected into the page rather than bundled, so one file
     * serves both and a key may be claimed from either side.
     */
    public function test_core_asks_for_every_string_in_its_catalogue(): void
    {
        $this->assertNoOrphans(
            base_path('lang/en.json'),
            TranslatedLiterals::everywhereCoreTranslates()
        );
    }

    /** The theme's catalogue is the client's, and so is its code (#61). */
    public function test_the_theme_asks_for_every_string_in_its_catalogue(): void
    {
        $this->assertNoOrphans(
            config('site.lang') . '/en.json',
            TranslatedLiterals::inBlade(config('site.theme'))
        );
    }

    /**
     * @param  array<string, string>  $asked
     */
    private function assertNoOrphans(string $cataloguePath, array $asked): void
    {
        $catalogue = json_decode(File::get($cataloguePath), true, flags: JSON_THROW_ON_ERROR);

        // The same guard the other direction carries: a scan that found nothing
        // would report every key as an orphan and read as a catastrophe.
        $this->assertGreaterThan(
            10,
            count($asked),
            'Nothing was read - the scan stopped finding translated strings.'
        );

        $orphans = array_values(array_diff(array_keys($catalogue), array_keys($asked)));

        $this->assertSame(
            [],
            $orphans,
            basename(dirname($cataloguePath)) . '/en.json carries strings nothing asks for. Delete them, or find '
            . "the call site that was renamed:\n  - " . implode("\n  - ", $orphans)
        );
    }
}
