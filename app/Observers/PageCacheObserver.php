<?php

namespace App\Observers;

use App\Services\PageCache;

/**
 * Publishing invalidates the public cache (TASKS.md #59).
 *
 * One observer serves both Entry and Module, because the invalidation is
 * site-wide - see PageCache for why that is the right trade when the cache key
 * is the path alone.
 *
 * **Model events do not cover everything.** A mass update fires none, so
 * `EntryController::reorder`, which writes one CASE statement over the whole
 * module, invalidates by hand. Anything added later that writes without going
 * through a model has to do the same.
 */
class PageCacheObserver
{
    public function __construct(private readonly PageCache $cache)
    {
    }

    public function saved(mixed $model): void
    {
        $this->cache->invalidate();
    }

    public function deleted(mixed $model): void
    {
        $this->cache->invalidate();
    }
}
