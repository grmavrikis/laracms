<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Services\EntryPresenter;
use App\Services\PageCache;
use App\Services\SiteSettings;
use Closure;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The public site: Blade, served from this same application, reading through
 * Eloquent with no API in between (TASKS.md #59, and Decisions).
 *
 * Every address carries its language, the default one included:
 *
 *     /el                     the home page
 *     /el/rooms               a module's published entries
 *     /el/rooms/thea          one entry
 *
 * The prefix is not optional for the default language, and that is the point:
 * one page has exactly one address, so nothing is served twice under different
 * URLs and the hreflang set is symmetric. `/` redirects to whichever language
 * is flagged default.
 *
 * **Nothing below touches the database on a cache hit.** Each action hands
 * PageCache a path and a closure, and the closure - which resolves the
 * language, the module and the entry - only runs on a miss. That ordering is
 * the requirement, not an optimisation.
 */
class PageController extends Controller
{
    public function __construct(
        private readonly EntryPresenter $presenter,
        private readonly PageCache $cache,
        private readonly SiteSettings $settings,
    ) {
    }

    public function root()
    {
        return redirect('/' . $this->defaultLanguage()->code);
    }

    public function home(string $language)
    {
        return $this->serve("home:{$language}", function () use ($language)
        {
            $current = $this->language($language);

            if ($current === null)
            {
                return null;
            }

            return ['html' => view('theme::home', [
                ...$this->chrome($current, $this->alternatesForHome()),
                'title' => config('app.name'),
                'modules' => Module::query()->orderBy('name')->get(),
            ])->render()];
        });
    }

    public function index(string $language, string $module)
    {
        return $this->serve("index:{$language}:{$module}", function () use ($language, $module)
        {
            $current = $this->language($language);
            $found = Module::where('slug', $module)->first();

            if ($current === null || $found === null)
            {
                return null;
            }

            // A singleton is not a list of one. Its content is served here,
            // at the Module's own address, and that address is the only one it
            // has (TASKS.md #60).
            if ($found->isSingleton())
            {
                return $this->singletonPage($current, $found);
            }

            // Only entries with a slug in this language: one nobody has
            // translated here has no address, so a listing cannot link to it.
            $entries = $found->entries()
                ->published()
                ->withSlugs()
                ->inListOrder()
                ->get()
                ->filter(fn(Entry $entry) => $entry->slugFor($current->code) !== null);

            return ['html' => view('theme::module', [
                ...$this->chrome($current, $this->alternatesForModule($found)),
                'title' => $found->name,
                'module' => $found,
                'rows' => $entries->map(fn(Entry $entry) => [
                    'title' => $this->presenter->title($found, $entry, $current->code),
                    'url' => url("/{$current->code}/{$found->slug}/" . $entry->slugFor($current->code)),
                ])->values(),
            ])->render()];
        });
    }

    public function show(string $language, string $module, string $slug)
    {
        return $this->serve("entry:{$language}:{$module}:{$slug}", function () use ($language, $module, $slug)
        {
            $current = $this->language($language);
            $found = Module::where('slug', $module)->first();

            if ($current === null || $found === null)
            {
                return null;
            }

            $entry = Entry::forSlug($found, $current->code, $slug)
                ->published()
                ->with('slugs')
                ->first();

            if ($entry === null)
            {
                return null;
            }

            // A singleton's content already has an address, so the entry's own
            // one redirects there rather than serving it a second time. A 404
            // would be simpler and would break links that exist if a Module is
            // turned into a singleton - which today means a hand-written
            // database edit, since there is no endpoint that updates a Module.
            //
            // **After** the entry is resolved, not before: redirecting first
            // made every invented slug under the module a 301, which is a soft
            // 404 to a crawler and - because a redirect is not `null` - one
            // cached entry per made-up address, the thing PageCache exists to
            // prevent.
            if ($found->isSingleton())
            {
                return ['redirect' => url("/{$current->code}/{$found->slug}")];
            }

            return ['html' => $this->entryHtml($current, $found, $entry, $this->alternatesForEntry($found, $entry))];
        });
    }

    /**
     * A singleton's page: its one published entry, at the Module's address.
     *
     * The alternates are the Module's own URLs rather than the entry's, since
     * that is where the content lives in each language - and the canonical
     * follows from them, so the page cannot advertise an address that
     * redirects away.
     *
     * @return array{html: string}|null
     */
    private function singletonPage(Language $current, Module $module): ?array
    {
        $entry = $module->entries()->published()->inListOrder()->first();

        if ($entry === null)
        {
            return null;
        }

        return ['html' => $this->entryHtml($current, $module, $entry, $this->alternatesForModule($module))];
    }

    /** @param array<string, string> $alternates */
    private function entryHtml(Language $current, Module $module, Entry $entry, array $alternates): string
    {
        $fields = $this->presenter->fields($module, $entry, $current->code);

        // The field standing in for a title becomes the heading, so the body
        // must not repeat it.
        $heading = collect($fields)->first(
            fn(array $field) => $field['kind'] === 'text' && ($field['text'] ?? '') !== ''
        );

        return view('theme::entry', [
            ...$this->chrome($current, $alternates),
            'title' => $heading['text'] ?? '#' . $entry->id,
            'module' => $module,
            'entry' => $entry,
            'fields' => $fields,
            'titleField' => $heading['name'] ?? null,
        ])->render();
    }

    /**
     * Cache first, database second. A closure returning null means there is no
     * such page, which becomes a 404 and is not cached.
     *
     * The closure answers with what the page *is* - HTML, or a permanent
     * redirect for a singleton's entry address - so that decision is cached
     * alongside the document rather than costing a query on every hit.
     *
     * **What may be stored is PageCache's decision, not this one.** A page
     * carrying a form is rendered on every visit, because a form is session
     * state and a cached page belongs to nobody.
     */
    private function serve(string $path, Closure $render)
    {
        $page = $this->cache->remember($path, $render);

        if ($page === null)
        {
            throw new NotFoundHttpException();
        }

        // The query string is appended here rather than baked into the cached
        // target: the cache key does not include it, so a stored redirect
        // carrying one visitor's `utm_source` would be handed to the next.
        if (isset($page['redirect']))
        {
            $query = request()->getQueryString();

            return redirect($page['redirect'] . ($query === null ? '' : '?' . $query), 301);
        }

        // Explicit, so a shape nobody planned for fails where it happens. The
        // previous form fell through to `$page['html']` and served an empty
        // 200 - which keeps monitoring green, caches the blank and lets it be
        // indexed, all worse than a fault.
        if (isset($page['html']))
        {
            return response($page['html']);
        }

        throw new RuntimeException('A cached page carried neither html nor a redirect: ' . json_encode(array_keys($page)));
    }

    /**
     * What every public template needs regardless of what it is showing.
     *
     * `canonical` is the address of the page being served, which is always the
     * current language's own alternate - the two cannot disagree, because they
     * are read out of the same array. `x-default` points at the default
     * language, which is what a search engine should offer a visitor whose own
     * language the site does not have.
     *
     * @param array<string, string> $alternates
     */
    private function chrome(Language $current, array $alternates): array
    {
        return [
            'languages' => $this->activeLanguages(),
            'current' => $current,
            'alternates' => $alternates,
            'canonical' => $alternates[$current->code] ?? url()->current(),
            'defaultAlternate' => $alternates[$this->defaultLanguage()->code] ?? null,
            // What the client says about themselves (#67), already resolved to
            // the language being rendered - so a template prints
            // `$settings['address']` without knowing which of them is a map.
            // Inside the cached closure, so it costs nothing on a hit.
            'settings' => $this->settings->for($current->code),
        ];
    }

    /**
     * The translations of a page, as hreflang wants them: every language the
     * page actually exists in, and no others.
     *
     * Declaring a language the entry has no slug in would point a search
     * engine at a 404 and waste the multilingual advantage this is for.
     *
     * @return array<string, string>
     */
    private function alternatesForEntry(Module $module, Entry $entry): array
    {
        $alternates = [];

        foreach ($this->activeLanguages() as $language)
        {
            $slug = $entry->slugFor($language->code);

            if ($slug !== null)
            {
                $alternates[$language->code] = url("/{$language->code}/{$module->slug}/{$slug}");
            }
        }

        return $alternates;
    }

    /** @return array<string, string> */
    private function alternatesForModule(Module $module): array
    {
        return $this->activeLanguages()
            ->mapWithKeys(fn(Language $l) => [$l->code => url("/{$l->code}/{$module->slug}")])
            ->all();
    }

    /** @return array<string, string> */
    private function alternatesForHome(): array
    {
        return $this->activeLanguages()
            ->mapWithKeys(fn(Language $l) => [$l->code => url("/{$l->code}")])
            ->all();
    }

    private function activeLanguages()
    {
        return Language::where('is_active', true)->orderBy('id')->get();
    }

    private function language(string $code): ?Language
    {
        return $this->activeLanguages()->firstWhere('code', $code);
    }

    /**
     * The same answer the validator uses, from the same place - the rule
     * "which language is the default, and what if none is flagged" was
     * written out twice and the two could have drifted.
     */
    private function defaultLanguage(): Language
    {
        $default = Language::default();

        if ($default === null)
        {
            throw new NotFoundHttpException();
        }

        return $default;
    }
}
