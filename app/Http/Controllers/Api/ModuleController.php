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
    /** Matches the modules.slug column, which is varchar(255). */
    private const SLUG_MAX_LENGTH = 255;

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'slug' => [
                'nullable',
                'string',
                'max:' . self::SLUG_MAX_LENGTH,
                // The slug is the Module's route key and routes match a single
                // segment, so 'a/b' would create a Module nothing can address.
                // This is the shape Str::slug produces.
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                'unique:modules,slug',
            ],
            'schema' => 'required|array',
            'schema.*.name' => 'required|string|alpha_dash',
            // Single source of truth, shared with the rule builder that has to
            // turn these types into entry validation rules.
            'schema.*.type' => ['required', 'string', Rule::in(SchemaRuleBuilder::SUPPORTED_TYPES)],
            'schema.*.translatable' => 'required|boolean',
            // Optional so a schema written before the flag existed still posts.
            'schema.*.required' => 'nullable|boolean',
            'schema.*.validation' => 'nullable|string',
            'schema.*.options' => 'nullable|array',
            'schema.*.options.*' => 'string'
        ], [
            'slug.regex' => 'The slug may only contain lowercase letters, numbers and single hyphens.',
        ]);

        // Build the entry rules now and throw them away: a schema that cannot
        // produce rules is not a usable schema, and the author should hear that
        // here rather than the first time somebody tries to save an entry.
        // Reusing the builder keeps one definition of what "usable" means.
        SchemaRuleBuilder::build($validated['schema']);

        // slug is nullable, so the key is simply absent when it is not sent -
        // reading it directly raised "Undefined array key" and returned a 500.
        //
        // Compared against null rather than used with `?:`, because the string
        // "0" is falsy in PHP and a falsy test would silently discard a slug
        // the client explicitly asked for.
        $explicitSlug = $validated['slug'] ?? null;

        $slug = $explicitSlug === null
            ? $this->generateSlug($validated['name'])
            : $explicitSlug;

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

        $slug = $this->fitToColumn($base, '');
        $suffix = 2;

        while (Module::where('slug', $slug)->exists())
        {
            $slug = $this->fitToColumn($base, '-' . $suffix++);
        }

        return $slug;
    }

    /**
     * Join a base and a suffix so the result fits modules.slug.
     *
     * `name` allows 255 characters and Str::slug can return just as many, so
     * appending a collision suffix would overflow the column and fail the
     * insert. The base is shortened to make room instead. Str::slug output is
     * ASCII, so byte-based trimming is safe here.
     */
    private function fitToColumn(string $base, string $suffix): string
    {
        $room = self::SLUG_MAX_LENGTH - strlen($suffix);

        // Truncation can land on a hyphen; leaving it would produce a slug
        // shaped differently from anything Str::slug emits.
        return rtrim(substr($base, 0, $room), '-') . $suffix;
    }

    public function index(Request $request): JsonResponse
    {
        $modules = Module::where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($modules);
    }
}
