<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEntryRequest;
use App\Http\Requests\UpdateEntryRequest;
use App\Models\Entry;
use App\Models\Module;
use App\Services\PageCache;
use App\Services\RichTextDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Entries are always addressed through their parent Module.
 *
 * Two things guarantee that, and both are needed:
 *   - scoped route model binding (routes/api.php) resolves {entry} through
 *     $module->entries(), so an Entry belonging to another Module is a 404;
 *   - ModulePolicy checks that the authenticated User owns the Module, so
 *     another user's Module is a 403.
 */
class EntryController extends Controller
{
    public function __construct(
        private readonly RichTextDocument $richText,
        private readonly PageCache $pages,
    ) {
    }

    public function index(Module $module)
    {
        $this->authorize('view', $module);

        // Ordering lives in Entry::inListOrder(), because `order()` below has
        // to agree with it exactly. `sort_order` leads, ascending, so position
        // 1 is the top of the list - which is what somebody typing a position
        // expects.
        //
        // Everything starts at Entry::UNPOSITIONED (100000), **not 0**, so a
        // Module nobody has ordered keeps its newest-first order rather than
        // being silently rearranged. A default of 0 inverted that: setting an
        // entry to position 1 pushed it below everything nobody had positioned.
        // See the migration, and Entry::UNPOSITIONED.
        //
        // The id tie-break is what makes this a total order. Entries saved in
        // the same second tie on created_at as well, and the database is then
        // free to return them in any order - which for a paginated list means
        // rows can repeat across pages or be skipped entirely.
        //
        // Drafts are listed. This is the admin, and an author has to be able to
        // see what they have not published yet.
        return $module->entries()->inListOrder()->paginate(15);
    }

    /**
     * Every id in the module, in listing order.
     *
     * The panel reorders against this rather than against the page it can
     * see. `paginate(15)` means the table holds fifteen rows at most, and
     * `reorder` takes the order of the whole module - so without this the
     * panel could only ever describe one page of it, and a move on page 2
     * wrote positions 1..5 straight over page 1 (TASKS.md #75).
     *
     * One `select id`. A list somebody hand-orders is a menu or a set of
     * rooms, so it is small by the nature of the thing.
     *
     * Past `Entry::MAX_REORDER` the module cannot be reordered at all: the
     * request would carry the whole set, which the cap refuses. Saying so here
     * is what stops the panel rendering arrows that answer 422 on every click
     * with nothing to explain why - an empty list disables them, and the flag
     * says the emptiness is a limit rather than an empty module.
     */
    public function order(Module $module)
    {
        $this->authorize('view', $module);

        // One id more than the cap allows is enough to answer both questions,
        // and it bounds the query: without the limit a module of fifty
        // thousand entries hydrated all fifty thousand ids on every listing
        // load, only to discard them and return an empty list.
        $ids = $module->entries()->inListOrder()->limit(Entry::MAX_REORDER + 1)->pluck('id');
        $reorderable = $ids->count() <= Entry::MAX_REORDER;

        return response()->json([
            'ids' => $reorderable ? $ids : [],
            'reorderable' => $reorderable,
        ]);
    }

    public function store(StoreEntryRequest $request, Module $module)
    {
        // Authorized by StoreEntryRequest::authorize().
        //
        // Read once and passed down. Both writers used to call
        // `$request->validated()` for themselves, which walks the whole rule
        // set again to rebuild the array - and the schema-derived `data.*`
        // rules are the largest part of it (TASKS.md #88).
        $validated = $request->validated();

        // The entry and its URLs are one write. Without the transaction the
        // entry row was committed first, so a slug failure left a saved entry
        // the client had been told nothing about (TASKS.md #77).
        $entry = DB::transaction(function () use ($validated, $module)
        {
            // The request rule that refuses a second entry in a singleton is a
            // read, and a read before a write is a race: two requests can both
            // find nothing and both insert, leaving the site with two About
            // pages and no way to say which is the About page.
            //
            // Re-checked here, inside the transaction and holding the rows, so
            // the second one waits for the first and then finds it. The rule
            // in the request stays: it is what turns the ordinary case into a
            // 422 that names the module instead of a 500.
            if ($module->isSingleton() && $module->entries()->lockForUpdate()->exists())
            {
                throw ValidationException::withMessages([
                    'data' => __(":module holds a single entry, which already exists. Edit that one instead.", ['module' => $module->name]),
                ]);
            }

            $entry = $module->entries()->create($this->attributes($validated, $module));

            $this->syncSlugs($entry, $validated, $module);

            return $entry;
        });

        return response()->json($this->asResource($entry), 201);
    }

    public function show(Module $module, Entry $entry)
    {
        $this->authorize('view', $module);

        return response()->json($this->asResource($entry));
    }

    public function update(UpdateEntryRequest $request, Module $module, Entry $entry)
    {
        // Authorized by UpdateEntryRequest::authorize().
        $validated = $request->validated();

        // The same single write as store(), and here it is what keeps the
        // entry's live pages alive: syncSlugs deletes before it inserts, so
        // an insert that failed used to commit the delete on its own and take
        // every existing public URL with it (TASKS.md #77).
        DB::transaction(function () use ($validated, $module, $entry)
        {
            $entry->update($this->attributes($validated, $module, $entry));

            $this->syncSlugs($entry, $validated, $module);
        });

        return response()->json($this->asResource($entry));
    }

    /**
     * One shape for one resource, from all three endpoints.
     *
     * `store()` used to return the model straight from `create()`, which never
     * reads the row back - so the 201 omitted `sort_order` and `published_at`
     * entirely, and carried `status` only when the client had sent one. A
     * panel creating an entry then read `status` as undefined and showed
     * Draft whatever the database had chosen. `show()` loaded `slugs` and the
     * other two did not, so one resource had three shapes (TASKS.md #81).
     */
    private function asResource(Entry $entry): Entry
    {
        return $entry->refresh()->load('slugs');
    }

    /**
     * Set the order of a whole list in one request.
     *
     * One request rather than one per row: dragging three rows should not be
     * three round trips, and writing positions one at a time would leave the
     * list half-ordered if any of them failed. Positions start at 1, so a
     * reordered list sits above everything nobody has positioned.
     *
     * The ids arrive in the body, where the scoped route binding cannot reach
     * them, so this is the one place the Module has to be checked by hand -
     * otherwise a request could renumber another Module's entries through a
     * Module it is allowed to write to.
     */
    public function reorder(Request $request, Module $module)
    {
        $this->authorize('update', $module);

        // Positions are written 1..N over exactly what arrives, so the body
        // has to be the whole module or the numbering means nothing: a page
        // of fifteen sent on its own renumbered itself over everything above
        // it. Requiring the complete set makes that a 422 instead of a
        // silent rearrangement - and covers duplicates for free, since the
        // same id twice would consume two positions and write one row.
        //
        // It also gives the honest answer when somebody else has added or
        // deleted an entry meanwhile: the list the panel is describing no
        // longer exists, so refuse it rather than apply a stale order.
        $existing = $module->entries()->orderBy('id')->pluck('id')->all();

        $validated = $request->validate([
            'ids' => [
                'present',
                'array',
                'max:' . Entry::MAX_REORDER,
                $this->coversTheWholeModule($existing),
            ],
            // Existence is the completeness rule's job. It compares the body
            // against the module's own ids, so an id that does not exist or
            // belongs to another module cannot survive it - and one comparison
            // in memory replaces one `exists` query per element (TASKS.md #84).
            'ids.*' => ['integer'],
        ]);

        // One statement rather than one per row. Reordering fifteen entries
        // was measured at 32 queries for a single swap - fifteen `exists`,
        // fifteen UPDATEs - and is now two.
        //
        // The CASE is built by hand because the values have to be inlined, and
        // they are safe to inline: each one is an integer that the
        // completeness rule has just matched against a list read out of this
        // module a moment earlier.
        $cases = '';

        foreach ($validated['ids'] as $position => $id)
        {
            $cases .= ' WHEN ' . (int) $id . ' THEN ' . ($position + 1);
        }

        if ($cases !== '')
        {
            // Without this, the Eloquent builder adds `updated_at` and moving
            // one row restamps every entry in the module. A position is not a
            // modification of the entry, and #59 is about to key a public page
            // cache on exactly that column.
            Entry::withoutTimestamps(function () use ($module, $validated, $cases)
            {
                $module->entries()
                    ->whereIn('id', $validated['ids'])
                    ->update(['sort_order' => DB::raw("CASE id{$cases} END")]);
            });
        }

        // The write above is one mass UPDATE, which fires no model events - so
        // the observer that drops the public cache never runs and the listing
        // would keep its old order until the cache expired (TASKS.md #59).
        $this->pages->invalidate();

        return response()->noContent();
    }

    /**
     * @param array<int, int> $existing every id in the module, ascending.
     */
    private function coversTheWholeModule(array $existing): callable
    {
        return function (string $attribute, mixed $value, callable $fail) use ($existing): void
        {
            if (!is_array($value))
            {
                return;
            }

            $given = array_map(fn(mixed $id) => (int) $id, array_values($value));
            sort($given);

            if ($given !== $existing)
            {
                $fail(__('The order must list every entry in this module exactly once. Reload the list and try again.'));
            }
        };
    }

    public function destroy(Module $module, Entry $entry)
    {
        $this->authorize('update', $module);

        // The URL segments go with it: entry_slugs.entry_id cascades.
        $entry->delete();

        return response()->noContent();
    }

    /**
     * The validated payload as columns, with every rich-text document rebuilt
     * from known node types only. The editor is not a security boundary -
     * these endpoints can be called directly - so the document is checked here,
     * on write.
     */
    private function attributes(
        array $validated,
        Module $module,
        ?Entry $entry = null
    ): array {
        $validated['data'] = $this->richText->normalizeEntryData(
            $module->schema ?? [],
            $validated['data'] ?? []
        );

        // Slugs are rows in their own table, not a column on this one.
        unset($validated['slugs']);

        // `published_at` records when the entry *first* went out, so it is
        // stamped on the way to published and never moved afterwards. Editing a
        // live entry, or republishing one that was pulled, must not rewrite
        // that history - and pulling it back off the site keeps the record of
        // what happened rather than erasing it.
        $publishing = ($validated['status'] ?? null) === Entry::STATUS_PUBLISHED;

        if ($publishing && $entry?->published_at === null)
        {
            $validated['published_at'] = now();
        }

        return $validated;
    }

    /**
     * Replace the entry's URL segments with the ones the request carries.
     *
     * Sending `slugs` at all replaces the whole set, so a language left out of
     * it loses its URL - which is what "these are the addresses of this entry"
     * has to mean. Leaving the key out entirely changes nothing, so an update
     * that only touches `data` does not have to restate them.
     */
    private function syncSlugs(
        Entry $entry,
        array $validated,
        Module $module
    ): void {
        // Called inside the transaction store() and update() open: the delete
        // below has to be undone with the insert that follows it, or a failure
        // halfway leaves the entry with no URLs at all.
        if (!array_key_exists('slugs', $validated))
        {
            return;
        }

        $entry->slugs()->delete();

        foreach ((array) $validated['slugs'] as $language => $slug)
        {
            if (!is_string($slug) || $slug === '')
            {
                continue;
            }

            $entry->slugs()->create([
                'module_id' => $module->id,
                'language_code' => $language,
                'slug' => $slug,
            ]);
        }

        // The relation may have been loaded before these rows changed.
        $entry->unsetRelation('slugs');
    }
}
