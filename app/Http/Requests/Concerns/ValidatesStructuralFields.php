<?php

namespace App\Http\Requests\Concerns;

use App\Models\Entry;
use App\Models\EntrySlug;
use App\Models\Language;
use App\Models\Module;
use Illuminate\Validation\Rule;

/**
 * The rules for the columns that are not part of a Module's schema.
 *
 * `status`, `sort_order` and the per-language slugs mean the same thing for
 * every Module, so they are real columns rather than schema fields and their
 * rules are written here rather than derived by `SchemaRuleBuilder`. Shared by
 * both Entry requests, which are otherwise near-identical and would otherwise
 * hold two copies of a slug-collision check.
 *
 * All three are `sometimes`: an update that sends only `data` leaves them as
 * they are.
 */
trait ValidatesStructuralFields
{
    /**
     * @param Entry|null $entry the entry being updated, whose own slugs must
     *        not count as a collision with itself. Null when creating.
     */
    protected function structuralRules(Module $module, ?Entry $entry = null): array
    {
        return [
            'status' => ['sometimes', Rule::in(Entry::STATUSES)],
            // `null` is how the panel says "no position"; the model turns it
            // into the sentinel the column stores. Capped at that sentinel so
            // a real position can never sort after an unpositioned entry.
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:' . Entry::UNPOSITIONED],

            // Sending the key at all replaces the whole set, so an empty map
            // is "this entry has no URLs" rather than "leave them alone".
            'slugs' => ['sometimes', 'array', $this->keysAreActiveLanguages()],
            'slugs.*' => [
                'nullable',
                'string',
                'max:255',
                // The same shape a Module slug must have, and for the same
                // reason: it is one URL segment, so `a/b` could never route.
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                $this->slugIsFree($module, $entry),
            ],
        ];
    }

    /**
     * The key of a slug is a language, and only a language the site has.
     *
     * Nothing checked it, which was two holes in one (TASKS.md #76):
     *
     *   - `entry_slugs.language_code` is `varchar(5)`, so a longer key passed
     *     validation and MySQL threw `1406 Data too long` - a **500** where
     *     the author should get a 422. SQLite, which the suite runs on, has
     *     no varchar limits, so no test could have found it;
     *   - `{"zz": "about"}` created a public URL in a language the site does
     *     not have, and nothing would ever read it.
     *
     * Membership in the active languages closes both: every code the site has
     * fits the column, because `languages.code` is `varchar(5)` as well.
     *
     * Written as a closure rather than `Rule::in` on `slugs.*` because it is
     * the *key* being checked, and Laravel's wildcard reaches values only.
     */
    private function keysAreActiveLanguages(): callable
    {
        return function (string $attribute, mixed $value, callable $fail): void
        {
            if (!is_array($value))
            {
                return;
            }

            $active = Language::query()->where('is_active', true)->pluck('code')->all();

            foreach (array_keys($value) as $language)
            {
                if (!in_array((string) $language, $active, true))
                {
                    $fail("'{$language}' is not one of this site's languages.");
                }
            }
        };
    }

    /**
     * Uniqueness is per Module and per language, which `Rule::unique` cannot
     * express here: the language is the wildcard key, so it has to be read off
     * the attribute name.
     *
     * The database has the same unique index, and it stays the real guarantee -
     * this exists so the author gets a 422 naming the language rather than a
     * 500 from a constraint violation.
     */
    private function slugIsFree(Module $module, ?Entry $entry): callable
    {
        return function (string $attribute, mixed $value, callable $fail) use ($module, $entry): void
        {
            if (!is_string($value) || $value === '')
            {
                return;
            }

            $language = (string) str($attribute)->afterLast('.');

            $taken = EntrySlug::query()
                ->where('module_id', $module->id)
                ->where('language_code', $language)
                ->where('slug', $value)
                ->when($entry, fn($query) => $query->where('entry_id', '!=', $entry->id))
                ->exists();

            if ($taken)
            {
                $fail("Another entry in this module already uses '{$value}' for '{$language}'.");
            }
        };
    }
}
