<?php

namespace App\Models;

use App\Observers\PageCacheObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;

/**
 * The installation's own settings, in exactly one row (TASKS.md #67).
 *
 * Observed like a Module and an Entry: the address in the footer is on every
 * public page, so changing it has to drop the cache for the same reason
 * publishing does (#59).
 *
 * Nothing is fillable. `SiteSettings::save()` assigns the column and the row's
 * fixed key by hand, so a `#[Fillable]` here would be a guard over a door
 * nobody uses - and would read as one that had been thought about.
 */
#[ObservedBy(PageCacheObserver::class)]
class Setting extends Model
{
    protected function casts(): array
    {
        return ['data' => 'array'];
    }
}
