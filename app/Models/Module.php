<?php

namespace App\Models;

use App\Observers\PageCacheObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy(PageCacheObserver::class)]
class Module extends Model
{
    protected $fillable = ['user_id', 'name', 'slug', 'schema', 'is_singleton'];

    protected $casts = [
        'schema' => 'array',
        'is_singleton' => 'boolean',
    ];

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
        return (bool) $this->is_singleton;
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
}
