<?php

namespace App\Models;

use App\Observers\RedirectObserver;
use App\Observers\StaticPageObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy(StaticPageObserver::class)]
#[ObservedBy(RedirectObserver::class)]
class Module extends Model
{
    protected $fillable = ['user_id', 'name', 'slug', 'schema', 'is_singleton'];

    protected $casts = [
        'schema' => 'array',
        'is_singleton' => 'boolean',
    ];

    /**
     * **A new module exists in every language the site has** (TASKS.md #114).
     *
     * "No translation means no page" is a rule about a language the owner has
     * not got to yet, not about the moment a module is created: a module that
     * appeared nowhere until somebody translated it would be a module the
     * owner cannot find. So it starts with its own name and slug in each
     * active language, exactly as the migration backfilled the existing rows,
     * and translating is then something done page by page.
     *
     * On the model rather than in `ModuleController`, because a rule only the
     * panel honours is a rule that holds until somebody uses the API - the
     * same reasoning as `isSingleton()` below.
     */
    protected static function booted(): void
    {
        static::created(function (Module $module)
        {
            foreach (Language::query()->pluck('code') as $code)
            {
                $module->slugs()->create([
                    'language_code' => $code,
                    'name' => $module->name,
                    'slug' => $module->slug,
                ]);
            }
        });
    }

    /**
     * A Module holding exactly one Entry - "About", "Contact" - rather than a
     * collection of them (TASKS.md #60).
     *
     * The panel opens straight into that entry, the public side serves it at
     * the Module's own address, and `StoreEntryRequest` refuses a second one.
     * All three matter: a flag only the panel honours is a rule that holds
     * until somebody uses the API.
     */
    public function isSingleton(): bool
    {
        return $this->is_singleton;
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(Entry::class);
    }

    // ------------------------------------------------- translated (#114)

    /**
     * What this module is called, and where it lives, in each language.
     *
     * `name` and `slug` on the model itself are **the panel's**: the admin API
     * resolves `/api/modules/{module}` by `slug`, and that key cannot depend on
     * a content language because the panel does not have one. These rows are
     * what the public side resolves and prints.
     */
    public function slugs(): HasMany
    {
        return $this->hasMany(ModuleSlug::class);
    }

    /**
     * The one query a public page makes to find which module it is showing.
     *
     * A scope rather than a finder so it composes, and a join rather than a
     * `whereHas` so it hits `module_slugs`' unique index exactly - this runs on
     * every cache miss, and #58 settled that a lookup by a translated value
     * has to be one read of one index.
     */
    public function scopeForSlug(Builder $query, string $language, string $slug): Builder
    {
        return $query
            ->join('module_slugs', 'module_slugs.module_id', '=', 'modules.id')
            ->where('module_slugs.language_code', $language)
            ->where('module_slugs.slug', $slug)
            ->select('modules.*');
    }

    /** Modules that exist at all in `$language`, in the order they are shown. */
    public function scopeInLanguage(Builder $query, string $language): Builder
    {
        return $query
            ->join('module_slugs', 'module_slugs.module_id', '=', 'modules.id')
            ->where('module_slugs.language_code', $language)
            ->orderBy('module_slugs.name')
            ->select('modules.*', 'module_slugs.name as translated_name', 'module_slugs.slug as translated_slug');
    }

    /**
     * `null` when the module is not translated into `$language`, and callers
     * must treat that as "there is no page here" rather than falling back.
     *
     * Falling back to the default language's slug is what produced
     * `/fr/ypiresies` and told a search engine that a Greek address was a
     * French page. Decided by the owner, 2026-09-06.
     */
    public function slugFor(string $language): ?string
    {
        return $this->translation($language)?->slug;
    }

    public function nameFor(string $language): ?string
    {
        return $this->translation($language)?->name;
    }

    /**
     * Free when the relation is loaded; one narrow query when it is not. The
     * same shape as `Entry::slugFor`, for the same reason.
     */
    private function translation(string $language): ?ModuleSlug
    {
        if ($this->relationLoaded('slugs'))
        {
            return $this->slugs->firstWhere('language_code', $language);
        }

        return $this->slugs()->where('language_code', $language)->first();
    }
}
