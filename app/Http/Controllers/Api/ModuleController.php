<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Language;
use App\Models\Module;
use App\Models\ModuleSlug;
use App\Services\SchemaRuleBuilder;
use App\Services\StaticPages;
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
            // A Module holding one Entry rather than a collection of them
            // (TASKS.md #60). Absent means a collection, so nothing that
            // already exists is reinterpreted.
            'is_singleton' => 'sometimes|boolean',

            // What the module is called, and where it lives, in each language
            // (#114). Optional, because the API is public and every client
            // that exists sends the old shape - a module without them still
            // gets a row per active language from the model.
            ...$this->translationRules(),

            'schema' => 'required|array',
            // Reported against the field itself, so the message points at
            // schema.1 rather than at a key that does not exist.
            'schema.*' => [function (string $attribute, mixed $value, callable $fail): void
            {
                $unknown = array_diff(array_keys((array) $value), self::SCHEMA_FIELD_KEYS);

                if ($unknown !== [])
                {
                    $fail(__('Unknown field keys: :unknown. A field may have: :allowed.', [
                        'unknown' => implode(', ', $unknown),
                        'allowed' => implode(', ', self::SCHEMA_FIELD_KEYS),
                    ]));
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
            'slug.regex' => __('The slug may only contain lowercase letters, numbers and single hyphens.'),
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
            // Absent means a collection, which is what every Module that
            // existed before the flag is.
            'is_singleton' => $validated['is_singleton'] ?? false,
        ]);

        $this->syncTranslations($module, $validated['translations'] ?? null);

        return response()->json([
            'message' => __('Module created.'),
            'data' => $module->load('slugs'),
        ], 201);
    }

    /**
     * Rename a Module, per language (TASKS.md #114).
     *
     * The first endpoint that has ever edited a Module. Deliberately narrow:
     * it changes the names and addresses a **visitor** sees and nothing else.
     * The schema is not editable here - what editing one means for the entries
     * already written against it is an open question (TASKS.md, To discuss),
     * and answering it by accident in a rename endpoint would be the wrong
     * place to answer it.
     */
    public function update(Request $request, Module $module): JsonResponse
    {
        $validated = $request->validate(
            $this->translationRules($module),
            ['translations.*.slug.regex' => __('The slug may only contain lowercase letters, numbers and single hyphens.')]
        );

        $this->syncTranslations($module, $validated['translations'] ?? []);

        return response()->json([
            'message' => __('Module updated.'),
            'data' => $module->fresh()->load('slugs'),
        ]);
    }

    /**
     * The rules for the per-language names and addresses.
     *
     * Uniqueness is **per language and excludes this module**: `/el/services`
     * and `/en/services` are different pages, and a client whose Greek and
     * English names coincide is ordinary, but two modules cannot share the
     * first segment of a path in one language.
     *
     * @return array<string, mixed>
     */
    private function translationRules(?Module $module = null): array
    {
        return [
            'translations' => 'sometimes|array',
            'translations.*.name' => 'required|string|max:255',
            'translations.*.slug' => [
                'nullable',
                'string',
                'max:' . self::SLUG_MAX_LENGTH,
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                function (string $attribute, mixed $value, callable $fail) use ($module): void
                {
                    // `translations.fr.slug` -> `fr`.
                    $language = explode('.', $attribute)[1] ?? '';

                    $taken = ModuleSlug::query()
                        ->where('language_code', $language)
                        ->where('slug', $value)
                        ->when($module !== null, fn($q) => $q->where('module_id', '!=', $module->id))
                        ->exists();

                    if ($taken)
                    {
                        $fail(__('Another section already uses :slug in that language.', ['slug' => $value]));
                    }
                },
            ],
        ];
    }

    /**
     * Replace the module's per-language names and addresses.
     *
     * **A language left out loses its translation**, which is what "these are
     * the module's names" has to mean - the same rule `syncSlugs` follows for
     * an entry's addresses, and it is how a client removes a language they no
     * longer want a section to appear in.
     *
     * `null` means the client said nothing about translations at all, so the
     * rows the model created on `created` are left alone.
     */
    private function syncTranslations(Module $module, ?array $translations): void
    {
        if ($translations === null)
        {
            return;
        }

        // **Before the delete, and it has to be here.** A rename moves every
        // address under this module, and nothing else notices: the delete
        // below is a mass delete, which fires no model events, and the module
        // row itself is never saved, so `StaticPageObserver` never runs. The
        // old pages would stay on disk and the web server would go on serving
        // them - found live, after the old French address answered 200 from a
        // file nothing had any reason to remove.
        //
        // The same trap `EntryController::syncSlugs` carries a comment for.
        app(StaticPages::class)->flush();

        $module->slugs()->delete();

        foreach ($translations as $language => $translation)
        {
            $name = $translation['name'];

            $module->slugs()->create([
                'language_code' => $language,
                'name' => $name,
                // Derived from **this language's own name**, never from the
                // module's. `Str::slug` transliterates rather than translates,
                // so deriving every language from one name is what produced
                // `/fr/ypiresies` - the defect this whole item exists for.
                'slug' => $translation['slug'] ?? $this->generateModuleSlug($name, $language, $module),
            ]);
        }

        $module->unsetRelation('slugs');
    }

    /**
     * A free address for `$name` in `$language`.
     *
     * The same shape as `generateSlug` below, against `module_slugs` and
     * within one language: `/el/services` and `/en/services` are different
     * pages, so a slug taken in Greek says nothing about English.
     */
    private function generateModuleSlug(string $name, string $language, Module $module): string
    {
        $base = Str::slug($name) ?: 'section';
        $base = rtrim(substr($base, 0, self::SLUG_MAX_LENGTH - self::SLUG_SUFFIX_BUDGET), '-') ?: 'section';

        $taken = array_flip(
            ModuleSlug::query()
                ->where('language_code', $language)
                ->where('module_id', '!=', $module->id)
                ->where('slug', 'like', $base . '%')
                ->pluck('slug')
                ->all()
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
