<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEntryRequest;
use App\Http\Requests\UpdateEntryRequest;
use App\Models\Entry;
use App\Models\Module;

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
    public function index(Module $module)
    {
        $this->authorize('view', $module);

        return $module->entries()->latest()->paginate(15);
    }

    public function store(StoreEntryRequest $request, Module $module)
    {
        // Authorized by StoreEntryRequest::authorize().
        // $request->validated() returns the array ['data' => [...]]
        $entry = $module->entries()->create($request->validated());

        return response()->json($entry, 201);
    }

    public function show(Module $module, Entry $entry)
    {
        $this->authorize('view', $module);

        return response()->json($entry);
    }

    public function update(UpdateEntryRequest $request, Module $module, Entry $entry)
    {
        // Authorized by UpdateEntryRequest::authorize().
        $entry->update($request->validated());

        return response()->json($entry);
    }

    public function destroy(Module $module, Entry $entry)
    {
        $this->authorize('update', $module);

        $entry->delete();

        return response()->noContent();
    }
}
