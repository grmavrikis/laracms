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

    /** Characters held back from a derived slug for a '-N' collision suffix. */
    private const SLUG_SUFFIX_BUDGET = 8;

    /**
     * Everything a schema field may carry.
     *
     * Laravel validates the keys it is given rules for and ignores the rest, so
     * `requred: true` used to be accepted and stored while doing nothing. The
     * field stayed optional and the author was told nothing - the same silent
     * acceptance removed from field types, one level up.
     */
    private const SCHEMA_FIELD_KEYS = [
        'name', 'type', 'translatable', 'required', 'validation', 'options',
    ];

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
            // Reported against the field itself, so the message points at
            // schema.1 rather than at a key that does not exist.
            'schema.*' => [function (string $attribute, mixed $value, callable $fail): void
            {
                $unknown = array_diff(array_keys((array) $value), self::SCHEMA_FIELD_KEYS);

                if ($unknown !== [])
                {
                    $fail('Unknown field key(s): ' . implode(', ', $unknown)
                        . '. A field may have: ' . implode(', ', self::SCHEMA_FIELD_KEYS) . '.');
                }
            }],
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

        // Shortened once, keeping room for a suffix, rather than per candidate.
        // `name` allows 255 characters and Str::slug can return as many, so a
        // suffix would otherwise overflow the column. Doing it up front also
        // means every candidate begins with this exact string, which is what
        // lets a single query see all of them. Truncation can land on a hyphen,
        // and a trailing one is not a shape Str::slug ever emits.
        $base = rtrim(substr($base, 0, self::SLUG_MAX_LENGTH - self::SLUG_SUFFIX_BUDGET), '-') ?: 'module';

        // One read instead of one per candidate. Str::slug emits only
        // [a-z0-9-], so the base cannot contain a LIKE wildcard.
        $taken = array_flip(
            Module::where('slug', 'like', $base . '%')->pluck('slug')->all()
        );

        if (!isset($taken[$base]))
        {
            return $base;
        }

        $suffix = 2;

        while (isset($taken[$base . '-' . $suffix]))
        {
            $suffix++;
        }

        return $base . '-' . $suffix;
    }

    /**
     * Every Module in the installation, for anyone signed in.
     *
     * This used to filter on `user_id`. One installation serves one site and
     * its Modules are created by the master admin, so that filter showed the
     * client's own staff an entirely empty panel - invisible only because
     * there had never been a second account. Ownership is not the
     * authorization axis here; see ModulePolicy.
     *
     * `id` breaks the tie on `created_at` for the same reason it does in
     * EntryController: without a total order the database is free to return
     * rows differently between requests.
     */
    public function index(): JsonResponse
    {
        $modules = Module::latest()->orderByDesc('id')->get();

        return response()->json($modules);
    }
}
