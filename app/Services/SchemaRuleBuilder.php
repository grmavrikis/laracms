<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

class SchemaRuleBuilder
{
    /**
     * The one list of field types the CMS understands.
     *
     * ModuleController validates incoming schemas against this same constant,
     * so the API and the rule builder cannot drift apart - which is how
     * `datetime` ended up being accepted by the API while quietly validating
     * as a plain string here.
     */
    public const SUPPORTED_TYPES = [
        'string',
        'text',
        'integer',
        'boolean',
        'date',
        'datetime',
        'select',
        'image',
        'gallery',
    ];

    /**
     * Field types whose value is an ordered list of images.
     *
     * `image` holds one URL, and until this existed no field type repeated at
     * all - so a room could carry a single photograph, which for tourist
     * accommodation is the whole product missing. Kept as a list, next to
     * SUPPORTED_TYPES, so there is one place to look for what a type is.
     */
    public const GALLERY_FIELD_TYPES = ['gallery'];

    /**
     * A type's predicate lives beside the constant that lists it.
     *
     * That is why this is here and `isRichTextField()` is on
     * `RichTextDocument`: that class owns the rich-text lists because it draws
     * the distinction between what is readable and what is creatable, and it
     * is the thing that normalises those values. Anything whose list lives
     * here - the next repeating type among them - gets its predicate here.
     */
    public static function isGalleryField(array $field): bool
    {
        return in_array($field['type'] ?? null, self::GALLERY_FIELD_TYPES, true);
    }

    /**
     * Backstop on how many images one gallery may hold, applied only when the
     * schema states an upper bound of its own.
     *
     * A gallery is the first field type that repeats. Before it every field
     * held one scalar, so a request bounded itself; without a ceiling, one row
     * could carry an unbounded payload into the JSON column.
     *
     * "An upper bound", not "a stricter limit": the check used to stand down
     * for any size rule at all, and `min` is one - so writing "at least one
     * photo" removed the ceiling entirely. A schema naming its own `max` is an
     * explicit decision and wins in either direction; a `min` says nothing
     * about how many are too many.
     */
    public const GALLERY_MAX_IMAGES = 100;

    /**
     * Bounds the URL one image may carry. The upload endpoint produces a path
     * of about fifty characters, so this only ever catches something that did
     * not come from it.
     */
    public const GALLERY_URL_MAX_LENGTH = 2048;

    /**
     * @param string $attribute the request field these rules are being built
     *        for, so a complaint about the schema is reported against
     *        something the request actually has. Module creation sends
     *        `schema`; an entry sends `data` and has no `schema` at all.
     */
    public static function build(
        array $schema,
        string $attribute = 'schema',
        ?string $requiredLanguage = null
    ): array {
        $rules = [
            'data' => ['required', 'array'],
        ];

        self::assertNamesAreUnique($schema, $attribute);

        foreach ($schema as $field)
        {
            $name = $field['name'] ?? null;

            if (!$name)
            {
                continue;
            }

            $isTranslatable = filter_var($field['translatable'] ?? false, FILTER_VALIDATE_BOOLEAN);

            if ($isTranslatable && self::isGalleryField($field))
            {
                throw self::galleryCannotBeTranslatable($field, $attribute);
            }

            // Get base rules for the field type
            $typeRules = self::rulesForType($field, $attribute);

            // Extract custom validation rules defined in the Module Builder
            $customRules = [];
            if (!empty($field['validation']))
            {
                $customRules = array_map('trim', explode('|', $field['validation']));

                self::assertCustomRulesFit($field, $customRules, $attribute);
            }

            // Merge type rules with custom rules and remove duplicates
            $fieldRules = array_values(array_unique(array_merge($typeRules, $customRules)));

            // A backstop, not a policy: a schema that names its own upper
            // bound has made the decision and keeps it. A `min` has not - it
            // says nothing about how many are too many, and treating it as an
            // answer removed the ceiling from any gallery asking for "at
            // least one photo".
            if (self::isGalleryField($field) && !self::hasUpperBound($fieldRules))
            {
                $fieldRules[] = 'max:' . self::GALLERY_MAX_IMAGES;
            }

            // `required` is a field of the schema in its own right. Saying it
            // by typing the word into the free-text validation box still works,
            // but nothing in the database ever did - the flag is the mechanism
            // the module form offers.
            $isRequired = filter_var($field['required'] ?? false, FILTER_VALIDATE_BOOLEAN);

            if ($isRequired)
            {
                // Removed first so a schema that sets the flag *and* writes
                // `required` in the validation string does not carry it twice.
                $fieldRules = array_values(array_diff($fieldRules, ['required']));
                array_unshift($fieldRules, 'required');
            }
            elseif (!in_array('required', $fieldRules) && !in_array('nullable', $fieldRules))
            {
                // Optional unless something says otherwise.
                array_unshift($fieldRules, 'nullable');
            }

            if ($isTranslatable)
            {
                // A translatable field produces two levels of rules: the map of
                // language code to value, and each value inside it. Only the
                // inner level used to be built from the field's configuration;
                // the outer one was always `required`, so a field configured as
                // optional still had to be sent.
                $isRequired = in_array('required', $fieldRules, true);

                $rules["data.{$name}"] = $isRequired ? ['required', 'array'] : ['nullable', 'array'];

                if ($isRequired && $requiredLanguage !== null)
                {
                    // `required` means the **default language**, not every
                    // active one. Demanding all of them made adding a language
                    // retroactively unsaveable: every existing entry failed on
                    // the new one until somebody translated it, so an author
                    // could not correct a typo without inventing a translation
                    // (TASKS.md, Decisions 2026-09-05).
                    //
                    // The explicit key and the wildcard both apply to the
                    // default language. That is deliberate and it works:
                    // `required` is one of Laravel's *implicit* rules, so it is
                    // still evaluated on a null value even though the wildcard
                    // marks the attribute nullable.
                    $rules["data.{$name}.{$requiredLanguage}"] = $fieldRules;
                    $rules["data.{$name}.*"] = self::withoutRequired($fieldRules);
                }
                else
                {
                    $rules["data.{$name}.*"] = $fieldRules;
                }
            }
            else
            {
                $rules["data.{$name}"] = $fieldRules;
            }

            if (self::isGalleryField($field))
            {
                // array_merge, not `+=`: the line above assigns and lets the
                // later field win, and `+=` would have kept the earlier one -
                // two answers to the same question inside one loop. Duplicate
                // names are refused outright now, so the two can no longer
                // disagree, but they should still say the same thing.
                $rules = array_merge($rules, self::galleryItemRules($name));
            }
        }

        return $rules;
    }

    /**
     * The same rules, with the demand for a value dropped.
     *
     * `nullable` replaces `required` rather than merely removing it: without
     * it a null value would fail whatever type rule follows, and "this
     * language has not been translated yet" has to be expressible.
     *
     * @param array<int, mixed> $rules
     * @return array<int, mixed>
     */
    private static function withoutRequired(array $rules): array
    {
        $optional = array_values(array_filter(
            $rules,
            fn(mixed $rule) => $rule !== 'required'
        ));

        array_unshift($optional, 'nullable');

        return $optional;
    }

    /**
     * A field's name is the key its value is stored under in `Entry.data`, so
     * two fields sharing one are two fields fighting over the same value.
     *
     * Nothing rejected that, and the failure was silent in both directions:
     * the later field's rules replaced the earlier one's for `data.{name}`,
     * while any sub-rules the earlier one added stayed behind. A gallery
     * followed by a string left a value that had to be both a list of image
     * objects and a string - and, because the wildcards then expanded against
     * a string and matched nothing, the entry saved anyway with the gallery
     * rules doing nothing at all.
     */
    protected static function assertNamesAreUnique(array $schema, string $attribute): void
    {
        $names = [];

        foreach ($schema as $field)
        {
            // No is_array() guard, matching build()'s own loop: `??` uses isset
            // semantics, and a string or number offset by a non-numeric key is
            // simply not set - so a schema element that is not an array reads
            // as nameless and is skipped rather than raising.
            $name = $field['name'] ?? null;

            if (!$name)
            {
                continue;
            }

            $names[] = $name;
        }

        $duplicates = array_keys(array_filter(array_count_values($names), fn($count) => $count > 1));

        if ($duplicates === [])
        {
            return;
        }

        throw ValidationException::withMessages([
            $attribute => 'Field name(s) used more than once: ' . implode(', ', $duplicates)
                . '. A name is the key its value is stored under, so two fields cannot share one.',
        ]);
    }

    /**
     * Whether the rules already cap how many, in which case a default ceiling
     * would be second-guessing a decision the schema has made.
     *
     * Deliberately narrower than SIZE_RULES: `min` measures size but says
     * nothing about an upper bound, and treating it as one let a gallery
     * asking for "at least one photo" accept any number at all.
     */
    protected static function hasUpperBound(array $rules): bool
    {
        foreach ($rules as $rule)
        {
            if (is_string($rule) && in_array(self::ruleName($rule), self::UPPER_BOUND_RULES, true))
            {
                return true;
            }
        }

        return false;
    }

    /**
     * The name of a rule, without its arguments: `max:255` is `max`.
     *
     * The limit of 2 on the explode matters - a rule's arguments may contain
     * a colon of their own, and only the first one separates the name.
     */
    protected static function ruleName(string $rule): string
    {
        return strtolower(explode(':', trim($rule), 2)[0]);
    }

    /**
     * The shape of one image inside a gallery.
     *
     *     data.photos       => the list itself, from the field's own rules
     *     data.photos.*     => one image, an object rather than a bare URL
     *     data.photos.*.url => where the upload endpoint put the file
     *     data.photos.*.alt => alt text, keyed by language code
     *
     * `alt` is a per-language map *inside* a field that is not translatable,
     * which is the one place this schema nests translations anywhere but at
     * `data.{field}.{lang}`. Deliberate: a translatable gallery would mean a
     * different set of photographs per language, when the photographs are one
     * set and only their description differs. A gallery therefore refuses the
     * translatable flag outright, and carries the translation one level down.
     *
     * Only these keys have rules, and Laravel's validated payload keeps only
     * what was validated - so nothing else riding along in the request reaches
     * the JSON column.
     *
     * @return array<string, array<int, string>>
     */
    protected static function galleryItemRules(string $name): array
    {
        return [
            "data.{$name}.*" => ['array'],
            // `distinct` because the editor keys its list on the URL: two rows
            // sharing a key make React reuse the wrong node, so removing one
            // image hits the other. That uniqueness was asserted in a comment
            // and enforced by nothing - each upload gets its own generated
            // name, but a hand-written payload was free to repeat one.
            "data.{$name}.*.url" => [
                'required', 'string', 'max:' . self::GALLERY_URL_MAX_LENGTH, 'distinct',
            ],
            "data.{$name}.*.alt" => ['nullable', 'array'],
            "data.{$name}.*.alt.*" => ['nullable', 'string'],
        ];
    }

    protected static function galleryCannotBeTranslatable(array $field, string $attribute): ValidationException
    {
        $name = $field['name'] ?? '(unnamed)';

        return ValidationException::withMessages([
            $attribute => "Field '{$name}' is a gallery and cannot be translatable: that would store a"
                . ' different set of images for each language. The images are one set - it is their'
                . ' alt text that is translated, and each image carries its own.',
        ]);
    }

    protected static function rulesForType(array $field, string $attribute): array
    {
        // No `?? 'string'` here. A field with no type used to resolve to one
        // and skip the throw below, which left exactly the silent fallback
        // this method exists to prevent - for the one case the API cannot
        // catch, since a schema can also be written straight to the database.
        $type = $field['type'] ?? null;

        // A schema written before the rich-text aliases were collapsed can
        // still say 'richtext' or 'textarea'. They only ever meant 'text', so
        // they are read as such rather than rejected - see RichTextDocument.
        if (in_array($type, RichTextDocument::LEGACY_FIELD_TYPES, true))
        {
            $type = 'text';
        }

        return match ($type)
        {
            // An image field stores the URL returned by the upload endpoint.
            'string', 'image' => ['string'],
            'integer' => ['numeric'],
            'boolean' => ['boolean'],
            'date', 'datetime' => ['date'],
            'select' => self::buildSelectRules($field),
            // An ordered list of images. Laravel checks the outer shape here;
            // galleryItemRules() describes what one image looks like. A size
            // rule counts the images, which is what "at most 5" should mean -
            // unlike rich text, where it would count document nodes and is
            // refused for exactly that reason.
            'gallery' => ['array'],
            // Rich text is stored as an editor document (JSON tree), not HTML.
            // Laravel only checks the outer shape here; the tree itself is
            // validated node by node by RichTextDocument, since a recursive
            // structure cannot be expressed as validation rules.
            'text' => ['array'],
            // No silent fallback: an unrecognised type used to validate as a
            // string, so a schema typo passed unnoticed and the field was
            // never really checked.
            default => throw self::unsupportedType($field, $type, $attribute),
        };
    }

    /**
     * Rules that assert a data type. The field's `type` already decides that,
     * so restating it is at best redundant and at worst impossible to satisfy:
     * a `text` field validates as an array, and `array` plus `string` is a pair
     * no value can meet.
     */
    protected const TYPE_ASSERTING_RULES = [
        'string', 'integer', 'numeric', 'boolean', 'array',
        'date', 'file', 'image', 'json', 'decimal',
    ];

    /**
     * Rules that measure size. Laravel applies them to an array as a count, so
     * on a rich-text document they silently limit the number of nodes rather
     * than the amount of text - a field that reads as "at most 255 characters"
     * is nothing of the sort.
     */
    protected const SIZE_RULES = ['max', 'min', 'size', 'between'];

    /**
     * The subset of those that cap how many. `min` is a floor, not a ceiling,
     * which is the distinction hasUpperBound() exists to draw.
     */
    protected const UPPER_BOUND_RULES = ['max', 'size', 'between'];

    /**
     * Reject a custom rule that cannot coexist with the field's type.
     *
     * These were merged in unchecked, so the two ways of getting it wrong both
     * failed quietly: an impossible combination rejected every value that was
     * ever submitted, and a size rule measured something other than what its
     * author meant.
     */
    protected static function assertCustomRulesFit(array $field, array $customRules, string $attribute): void
    {
        $name = $field['name'] ?? '(unnamed)';
        $isDocument = RichTextDocument::isRichTextField($field);

        foreach ($customRules as $rule)
        {
            if (!is_string($rule) || trim($rule) === '')
            {
                continue;
            }

            // `max:255` and `between:1,5` carry arguments; only the name matters.
            $ruleName = self::ruleName($rule);

            if (in_array($ruleName, self::TYPE_ASSERTING_RULES, true))
            {
                throw ValidationException::withMessages([
                    $attribute => "Field '{$name}' has validation rule '{$ruleName}', which asserts a data"
                        . " type. The field's type already decides that - use validation for constraints"
                        . ' such as max:60 instead.',
                ]);
            }

            if ($isDocument && in_array($ruleName, self::SIZE_RULES, true))
            {
                throw ValidationException::withMessages([
                    $attribute => "Field '{$name}' has validation rule '{$ruleName}', which would count"
                        . ' the nodes of a rich-text document rather than its characters. Size rules do'
                        . ' not apply to rich text.',
                ]);
            }
        }
    }

    protected static function unsupportedType(array $field, mixed $type, string $attribute): ValidationException
    {
        $name = $field['name'] ?? '(unnamed)';

        // A missing type and a misspelled one are different mistakes, and
        // "unsupported type 'null'" would describe the first one badly.
        $problem = $type === null
            ? 'declares no type'
            : "declares unsupported type '"
                . (is_scalar($type) ? (string) $type : get_debug_type($type)) . "'";

        return ValidationException::withMessages([
            $attribute => "Module schema field '{$name}' {$problem}."
                . ' Supported types: ' . implode(', ', self::SUPPORTED_TYPES) . '.',
        ]);
    }

    protected static function buildSelectRules(array $field): array
    {
        $rules = ['string'];

        if (isset($field['options']) && is_array($field['options']))
        {
            $allowedValues = array_map(function ($opt)
            {
                return is_array($opt) ? ($opt['value'] ?? '') : $opt;
            }, $field['options']);

            $allowedValues = array_filter($allowedValues, fn($val) => $val !== '');

            if (!empty($allowedValues))
            {
                $rules[] = 'in:' . implode(',', $allowedValues);
            }
        }

        return $rules;
    }
}
