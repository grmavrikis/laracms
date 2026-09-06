<?php

namespace App\Observers;

use App\Models\Entry;
use App\Models\Module;
use App\Services\StaticPages;

/**
 * Publishing removes the baked pages it changed (TASKS.md #97).
 *
 * One observer for four models, because what each of them invalidates is
 * different in scope rather than in kind:
 *
 * | Saved      | Removed                                                     |
 * |------------|-------------------------------------------------------------|
 * | `Entry`    | its own addresses, its module's listings, the home pages, the sitemap |
 * | `Module`   | everything - a rename moves every address underneath it      |
 * | `Setting`  | everything - the footer is on every page                     |
 * | `Language` | everything - the hreflang set of every page changes          |
 *
 * **`Language` was not observed before**, and had to be once pages became
 * files: `PageCache` carried a seven-day TTL underneath its explicit
 * invalidation, so a page nobody thought to drop eventually went anyway. A
 * file does not expire, so a page missed here is wrong until somebody notices.
 *
 * **Model events do not cover everything.** A mass update fires none, so
 * `EntryController::reorder` - one CASE statement over a whole module - and
 * `syncSlugs` - which deletes the slug rows en masse - both call
 * `StaticPages` by hand. Anything added later that writes without going
 * through a model has to do the same.
 */
class StaticPageObserver
{
    public function __construct(private readonly StaticPages $pages)
    {
    }

    public function saved(mixed $model): void
    {
        $this->drop($model);
    }

    /**
     * **Before** the row goes, for an Entry.
     *
     * `entry_slugs` cascades on delete, so by the time `deleted` fires the
     * rows that named this entry's files are gone and nothing can say where
     * they were - the pages would sit at addresses no row mentions, served for
     * ever. The same reasoning as `EntryController::syncSlugs`, one event
     * earlier.
     */
    public function deleting(mixed $model): void
    {
        if ($model instanceof Entry)
        {
            $this->drop($model);
        }
    }

    /**
     * Everything except an Entry, whose pages `deleting` has already dropped -
     * running it again here would re-query slug rows that have cascaded away
     * and re-delete files that are already gone, and would leave a reader
     * unable to tell which of the two hooks is the load-bearing one.
     */
    public function deleted(mixed $model): void
    {
        if ($model instanceof Entry)
        {
            return;
        }

        $this->drop($model);
    }

    private function drop(mixed $model): void
    {
        if ($model instanceof Entry)
        {
            $module = $model->module;

            if ($module !== null)
            {
                $this->pages->forgetEntry($model, $module);

                return;
            }
        }

        if ($model instanceof Module)
        {
            // Not `forgetModule`: this fires for a **rename** too, and by now
            // the slug on the model is the new one, so every address the old
            // slug produced would be left behind with nothing pointing at it.
            $this->pages->flush();

            return;
        }

        $this->pages->flush();
    }
}
