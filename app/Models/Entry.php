<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
            get: fn(mixed $value) => (int) $value === self::UNPOSITIONED ? null : (int) $value,
            set: fn(mixed $value) => $value === null || $value === '' ? self::UNPOSITIONED : (int) $value,
        );
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
        return $query->where('status', self::STATUS_PUBLISHED);
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
     * This entry's URL segment in one language, or null where nobody has
     * written that translation yet.
     */
    public function slugFor(string $language): ?string
    {
        return $this->slugs->firstWhere('language_code', $language)?->slug;
    }
}
