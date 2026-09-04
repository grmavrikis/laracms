<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use App\Observers\PageCacheObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[ObservedBy(PageCacheObserver::class)]
class Entry extends Model
{
    /** Written but not shown. */
    public const STATUS_DRAFT = 'draft';

    /** The only state a public page may render. */
    public const STATUS_PUBLISHED = 'published';

    public const STATUSES = [self::STATUS_DRAFT, self::STATUS_PUBLISHED];

    /**
     * Where an entry sits when nobody has given it a position.
     *
     * Beyond any position an author would type, so positioned entries come
     * first and the rest keep their newest-first order below. See the
     * migration for why this is not 0.
     */
    public const UNPOSITIONED = 100000;

    /**
     * The most entries one reorder request may carry.
     *
     * Reordering takes the module's whole order, so this is also a ceiling on
     * how large a module can be and still be hand-ordered - which is the
     * honest shape of the thing. A list somebody arranges by hand is a menu or
     * a set of rooms; past a thousand, dragging rows is not the tool. Without
     * a cap one request could ask the server to hold and compare an unbounded
     * array (TASKS.md #84).
     */
    public const MAX_REORDER = 1000;

    protected $fillable = ['module_id', 'data', 'status', 'published_at', 'sort_order'];

    protected $casts = [
        'data' => 'array',
        'published_at' => 'datetime',
    ];

    /**
     * `null` means unpositioned, everywhere above the database.
     *
     * The sentinel exists so ordering stays a plain indexed ascending sort
     * (see the migration). It is a storage detail, and letting it out would
     * mean the admin panel restating a PHP constant in JavaScript - which is
     * the drift this codebase generates `fieldTypes.json` to avoid. So the
     * column holds 100000 and everything else, the API included, says null.
     */
    protected function sortOrder(): Attribute
    {
        return Attribute::make(
            // `null` is checked before the cast, not after: `(int) null` is 0,
            // which is not the sentinel, so an Entry that has never been saved
            // used to read as position 0 - "pinned to the top", the exact
            // inversion the sentinel exists to prevent (TASKS.md #80).
            get: fn(mixed $value) => $value === null || (int) $value === self::UNPOSITIONED
                ? null
                : (int) $value,
            set: fn(mixed $value) => $value === null || $value === '' ? self::UNPOSITIONED : (int) $value,
        );
    }

    /**
     * The order the admin listing is in.
     *
     * A scope because two endpoints have to agree on it: the paginated listing
     * and the id list the panel reorders against. If those two ever disagreed,
     * a move would swap an entry with a neighbour it is not next to on screen.
     */
    public function scopeInListOrder(Builder $query): Builder
    {
        return $query
            ->orderBy('sort_order')
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }

    public function slugs(): HasMany
    {
        return $this->hasMany(EntrySlug::class);
    }

    /**
     * What a public page is allowed to show. The admin listing deliberately
     * does not use this - a draft being visible to its author and to nobody
     * else is the whole point.
     */
    public function scopePublished(Builder $query): Builder
    {
        // Qualified, because this scope is advertised as composing with
        // `forSlug()` - which joins `entry_slugs`. A bare `status` is not
        // ambiguous only for as long as that table has no column by that
        // name, and a per-language publication state is the obvious next
        // request for a multilingual CMS. It would then fail in every public
        // lookup rather than where the column was added (TASKS.md #87).
        return $query->where('entries.status', self::STATUS_PUBLISHED);
    }

    /**
     * The one query a public page makes to find what it is showing.
     *
     * A scope rather than a finder so it composes: the public side asks for
     * `forSlug(...)->published()->first()`, while a preview can leave the
     * second half off. The join hits `entry_slugs`' unique index exactly.
     */
    public function scopeForSlug(Builder $query, Module $module, string $language, string $slug): Builder
    {
        return $query
            ->join('entry_slugs', 'entry_slugs.entry_id', '=', 'entries.id')
            ->where('entry_slugs.module_id', $module->id)
            ->where('entry_slugs.language_code', $language)
            ->where('entry_slugs.slug', $slug)
            ->select('entries.*');
    }

    /**
     * Eager-load the URL segments for a listing.
     *
     *  reads the relation, and an unloaded relation loads itself -
     * per model and per call. A public index of fifteen entries with a link
     * each was fifteen SELECTs against entry_slugs, thirty if the page also
     * carries its hreflang alternates (TASKS.md #85). This is the read path
     * #59 is built on, so it exists before rather than after.
     */
    public function scopeWithSlugs(Builder $query): Builder
    {
        return $query->with('slugs');
    }

    /**
     * This entry's URL segment in one language, or null where nobody has
     * written that translation yet.
     *
     * Free when the relation is loaded, which is what withSlugs() is for. On
     * a model loaded without it this still answers - a convenience worth
     * keeping - but it asks for the one value rather than pulling every slug
     * the entry has into memory to pick one out of them.
     */
    public function slugFor(string $language): ?string
    {
        if ($this->relationLoaded('slugs'))
        {
            return $this->slugs->firstWhere('language_code', $language)?->slug;
        }

        return $this->slugs()->where('language_code', $language)->value('slug');
    }
}
