<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEntryRequest;
use App\Http\Requests\UpdateEntryRequest;
use App\Models\Entry;
use App\Models\Module;

class EntryController extends Controller
{
    public function index($moduleSlugOrId)
    {
        $module = Module::where('slug', $moduleSlugOrId)
            ->orWhere('id', $moduleSlugOrId)
            ->firstOrFail();

        return $module->entries()->latest()->paginate(15);
    }

    public function store(StoreEntryRequest $request, $moduleSlugOrId)
    {
        \Log::info('DEBUG_PAYLOAD', $request->all()); // Debug payload

        $module = Module::where('slug', $moduleSlugOrId)
            ->orWhere('id', $moduleSlugOrId)
            ->firstOrFail();

        // $request->validated() returns the array ['data' => [...]]
        $entry = $module->entries()->create($request->validated());

        return response()->json($entry, 201);
    }

    public function show($moduleSlug, $id)
    {
        return Entry::findOrFail($id);
    }

    public function update(UpdateEntryRequest $request, $moduleSlug, $id)
    {
        $entry = Entry::findOrFail($id);
        $entry->update($request->validated());

        return response()->json($entry);
    }

    public function destroy($moduleSlug, $id)
    {
        $entry = Entry::findOrFail($id);
        $entry->delete();

        return response()->noContent();
    }
}
