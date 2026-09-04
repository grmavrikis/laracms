<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\Entry;
use App\Models\Language;
use App\Models\Module;
use App\Services\EntryPresenter;
use App\Services\PageCache;
use Closure;
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

            return view('site.home', [
                ...$this->chrome($current, $this->alternatesForHome()),
                'title' => config('app.name'),
                'modules' => Module::query()->orderBy('name')->get(),
            ])->render();
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

            // Only entries with a slug in this language: one nobody has
            // translated here has no address, so a listing cannot link to it.
            $entries = $found->entries()
                ->published()
                ->withSlugs()
                ->inListOrder()
                ->get()
                ->filter(fn(Entry $entry) => $entry->slugFor($current->code) !== null);

            return view('site.module', [
                ...$this->chrome($current, $this->alternatesForModule($found)),
                'title' => $found->name,
                'module' => $found,
                'rows' => $entries->map(fn(Entry $entry) => [
                    'title' => $this->presenter->title($found, $entry, $current->code),
                    'url' => url("/{$current->code}/{$found->slug}/" . $entry->slugFor($current->code)),
                ])->values(),
            ])->render();
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

            $fields = $this->presenter->fields($found, $entry, $current->code);

            // The field standing in for a title becomes the heading, so the
            // body must not repeat it.
            $heading = collect($fields)->first(
                fn(array $field) => $field['kind'] === 'text' && ($field['text'] ?? '') !== ''
            );

            return view('site.entry', [
                ...$this->chrome($current, $this->alternatesForEntry($found, $entry)),
                'title' => $heading['text'] ?? '#' . $entry->id,
                'module' => $found,
                'entry' => $entry,
                'fields' => $fields,
                'titleField' => $heading['name'] ?? null,
            ])->render();
        });
    }

    /**
     * Cache first, database second. A closure returning null means there is no
     * such page, which becomes a 404 and is not cached.
     */
    private function serve(string $path, Closure $render)
    {
        $html = $this->cache->remember($path, $render);

        if ($html === null)
        {
            throw new NotFoundHttpException();
        }

        return response($html);
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

    private function defaultLanguage(): Language
    {
        $languages = $this->activeLanguages();

        $default = $languages->firstWhere('is_default', true) ?? $languages->first();

        if ($default === null)
        {
            throw new NotFoundHttpException();
        }

        return $default;
    }
}
