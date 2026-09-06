<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Services\StaticPages;

/**
 * `sitemap.xml`, generated from the entries rather than maintained by hand.
 *
 * The template is **core**, not part of the theme: its structure is fixed by
 * sitemaps.org and by the hreflang work, not by anybody's design, and a client
 * theme that mangled or omitted it would break indexing silently - the one
 * failure invisible from inside the panel.
 *
 * Every URL carries its translations as `xhtml:link` alternates. That is not
 * decoration: without them Google does not know the Greek and English pages
 * are the same content in two languages, and the multilingual advantage - the
 * whole sales argument in this market - is invisible to it (TASKS.md #59).
 *
 * Baked like every public page (#97), and dropped by the same observer: any
 * entry write changes it. It is written as `sitemap.xml` rather than
 * `sitemap.xml.html`, and `public/.htaccess` has its own rule for it - the
 * extension is what decides the content type, and a sitemap served as
 * `text/html` is a sitemap no crawler reads.
 */
class SitemapController extends Controller
{
    public function __construct(private readonly StaticPages $pages)
    {
    }

    public function show()
    {
        $xml = (function ()
        {
            $languages = Language::where('is_active', true)->orderBy('id')->get();
            $modules = Module::query()->orderBy('name')->get();

            $urls = [];

            foreach ($languages as $language)
            {
                $urls[] = ['loc' => url("/{$language->code}"), 'alternates' => $this->homeAlternates($languages)];
            }

            foreach ($modules as $module)
            {
                // Only the languages this module exists in (#114). A module
                // nobody has translated into French has no French address, and
                // advertising one is worse than omitting it: it is a 404 with
                // an invitation attached.
                foreach ($languages as $language)
                {
                    $section = $module->slugFor($language->code);

                    if ($section === null)
                    {
                        continue;
                    }

                    $urls[] = [
                        'loc' => url("/{$language->code}/{$section}"),
                        'alternates' => $this->moduleAlternates($languages, $module),
                    ];
                }

                // A singleton's content lives at the Module's address, which
                // is already listed above, and its entry address redirects
                // there. Listing it would advertise a hop and claim two pages
                // where the site has one (TASKS.md #60).
                if ($module->isSingleton())
                {
                    continue;
                }

                $entries = $module->entries()->published()->withSlugs()->inListOrder()->get();

                foreach ($entries as $entry)
                {
                    $alternates = $this->entryAlternates($languages, $module, $entry);

                    // The alternates are the entry's addresses, so each of them
                    // is also a URL in its own right. Listing them from the same
                    // array is what keeps the two from ever disagreeing.
                    foreach ($alternates as $loc)
                    {
                        $urls[] = ['loc' => $loc, 'alternates' => $alternates];
                    }
                }
            }

            return view('sitemap', ['urls' => $urls])->render();
        })();

        $this->pages->write('sitemap.xml', $xml);

        return response($xml)->header('Content-Type', 'application/xml');
    }

    /** @return array<string, string> */
    private function entryAlternates($languages, Module $module, Entry $entry): array
    {
        $alternates = [];

        foreach ($languages as $language)
        {
            $slug = $entry->slugFor($language->code);
            $section = $module->slugFor($language->code);

            // Both segments, since #114: an entry translated into a language
            // whose module is not has no address there at all.
            if ($slug !== null && $section !== null)
            {
                $alternates[$language->code] = url("/{$language->code}/{$section}/{$slug}");
            }
        }

        return $alternates;
    }

    /** @return array<string, string> */
    private function moduleAlternates($languages, Module $module): array
    {
        $alternates = [];

        foreach ($languages as $language)
        {
            $section = $module->slugFor($language->code);

            if ($section !== null)
            {
                $alternates[$language->code] = url("/{$language->code}/{$section}");
            }
        }

        return $alternates;
    }

    /** @return array<string, string> */
    private function homeAlternates($languages): array
    {
        return $languages->mapWithKeys(fn(Language $l) => [$l->code => url("/{$l->code}")])->all();
    }
}
