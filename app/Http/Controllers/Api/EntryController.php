<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEntryRequest;
use App\Http\Requests\UpdateEntryRequest;
use App\Models\Entry;
use App\Models\Module;
use App\Services\RichTextDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
    public function __construct(private readonly RichTextDocument $richText)
    {
    }

    public function index(Module $module)
    {
        $this->authorize('view', $module);

        // `sort_order` leads, ascending, so position 1 is the top of the list -
        // which is what somebody typing a position expects. Everything starts
        // at 0, so a Module nobody has ordered keeps the old newest-first
        // behaviour rather than being silently rearranged.
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
     */
    public function order(Module $module)
    {
        $this->authorize('view', $module);

        return response()->json([
            'ids' => $module->entries()->inListOrder()->pluck('id'),
        ]);
    }

    public function store(StoreEntryRequest $request, Module $module)
    {
        // Authorized by StoreEntryRequest::authorize().
        //
        // The entry and its URLs are one write. Without the transaction the
        // entry row was committed first, so a slug failure left a saved entry
        // the client had been told nothing about (TASKS.md #77).
        $entry = DB::transaction(function () use ($request, $module)
        {
            $entry = $module->entries()->create($this->attributes($request, $module));

            $this->syncSlugs($entry, $request, $module);

            return $entry;
        });

        return response()->json($entry, 201);
    }

    public function show(Module $module, Entry $entry)
    {
        $this->authorize('view', $module);

        // The form needs the URL segments alongside the content.
        return response()->json($entry->load('slugs'));
    }

    public function update(UpdateEntryRequest $request, Module $module, Entry $entry)
    {
        // Authorized by UpdateEntryRequest::authorize().
        //
        // The same single write as store(), and here it is what keeps the
        // entry's live pages alive: syncSlugs deletes before it inserts, so
        // an insert that failed used to commit the delete on its own and take
        // every existing public URL with it (TASKS.md #77).
        DB::transaction(function () use ($request, $module, $entry)
        {
            $entry->update($this->attributes($request, $module, $entry));

            $this->syncSlugs($entry, $request, $module);
        });

        return response()->json($entry);
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
            'ids' => ['present', 'array', $this->coversTheWholeModule($existing)],
            'ids.*' => [
                'integer',
                Rule::exists('entries', 'id')->where('module_id', $module->id),
            ],
        ]);

        DB::transaction(function () use ($validated, $module)
        {
            foreach ($validated['ids'] as $position => $id)
            {
                $module->entries()->whereKey($id)->update(['sort_order' => $position + 1]);
            }
        });

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
                $fail('The order must list every entry in this module exactly once. Reload the list and try again.');
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
        StoreEntryRequest|UpdateEntryRequest $request,
        Module $module,
        ?Entry $entry = null
    ): array {
        $validated = $request->validated();

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
        StoreEntryRequest|UpdateEntryRequest $request,
        Module $module
    ): void {
        // Called inside the transaction store() and update() open: the delete
        // below has to be undone with the insert that follows it, or a failure
        // halfway leaves the entry with no URLs at all.
        $validated = $request->validated();

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
