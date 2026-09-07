<?php

namespace App\Observers;

use App\Models\Entry;
use App\Models\Module;
use App\Services\Redirects;

/**
 * Nothing redirects to a page that no longer exists (TASKS.md #69).
 *
 * A rename records where a page went; deleting that page afterwards would
 * leave the row pointing at a 404, and **a 301 into a 404 is worse for the
 * client than the old address simply being gone** - a crawler follows it and
 * records the new address as broken, where a plain 404 is a clean signal.
 *
 * Separate from `StaticPageObserver` although both listen to the same two
 * models: that one answers *which files are now wrong*, this one answers
 * *which promises are now false*. `ObservedBy` is repeatable, so each model
 * names both.
 *
 * **`deleting`, not `deleted`**, for the reason spelled out there: `entry_slugs`
 * and `module_slugs` cascade, so once the row is gone nothing can say what its
 * addresses were.
 */
class RedirectObserver
{
    public function __construct(private readonly Redirects $redirects)
    {
    }

    public function deleting(mixed $model): void
    {
        if ($model instanceof Entry)
        {
            $this->redirects->forgetEntry($model);

            return;
        }

        if ($model instanceof Module)
        {
            $this->redirects->forgetModule($model);
        }
    }
}
