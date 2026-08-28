<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Services\SchemaRuleBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ModuleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:modules,slug',
            'schema' => 'required|array',
            'schema.*.name' => 'required|string|alpha_dash',
            // Single source of truth, shared with the rule builder that has to
            // turn these types into entry validation rules.
            'schema.*.type' => ['required', 'string', Rule::in(SchemaRuleBuilder::SUPPORTED_TYPES)],
            'schema.*.translatable' => 'required|boolean',
            'schema.*.validation' => 'nullable|string',
            'schema.*.options' => 'nullable|array',
            'schema.*.options.*' => 'string'
        ]);

        // slug is nullable, so the key is simply absent when it is not sent -
        // reading it directly raised "Undefined array key" and returned a 500.
        $slug = ($validated['slug'] ?? null) ?: $this->generateSlug($validated['name']);

        $module = Module::create([
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'slug' => $slug,
            'schema' => $validated['schema'],
        ]);

        return response()->json([
            'message' => 'Module created successfully.',
            'data' => $module
        ], 201);
    }

    /**
     * Derive a free slug from the Module name.
     *
     * Only used when the client did not supply one. An explicit slug that is
     * already taken is rejected by the `unique` rule above, because the client
     * asked for that exact value; a derived slug means "pick one for me", so a
     * free one is picked instead of failing.
     *
     * This is a check-then-insert, so two simultaneous requests could still
     * race. The unique index on modules.slug remains the actual guarantee.
     */
    private function generateSlug(string $name): string
    {
        // Str::slug transliterates Greek ('Εστιατόρια' -> 'estiatoria') but
        // returns '' for a name made only of punctuation. An empty slug would
        // make the Module unreachable, since the slug is its route key.
        $base = Str::slug($name) ?: 'module';

        $slug = $base;
        $suffix = 2;

        while (Module::where('slug', $slug)->exists())
        {
            $slug = $base . '-' . $suffix++;
        }

        return $slug;
    }

    public function index(Request $request): JsonResponse
    {
        $modules = Module::where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($modules);
    }
}
