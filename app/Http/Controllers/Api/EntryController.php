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
        return $module->entries()
            ->orderBy('sort_order')
            ->latest()
            ->orderByDesc('id')
            ->paginate(15);
    }

    public function store(StoreEntryRequest $request, Module $module)
    {
        // Authorized by StoreEntryRequest::authorize().
        $entry = $module->entries()->create($this->attributes($request, $module));

        $this->syncSlugs($entry, $request, $module);

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
        $entry->update($this->attributes($request, $module, $entry));

        $this->syncSlugs($entry, $request, $module);

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

        $validated = $request->validate([
            'ids' => ['present', 'array'],
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
