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
    ];

    public static function build(array $schema): array
    {
        $rules = [
            'data' => ['required', 'array'],
        ];

        foreach ($schema as $field)
        {
            $name = $field['name'] ?? null;

            if (!$name)
            {
                continue;
            }

            $isTranslatable = filter_var($field['translatable'] ?? false, FILTER_VALIDATE_BOOLEAN);

            // Get base rules for the field type
            $typeRules = self::rulesForType($field);

            // Extract custom validation rules defined in the Module Builder
            $customRules = [];
            if (!empty($field['validation']))
            {
                $customRules = array_map('trim', explode('|', $field['validation']));

                self::assertCustomRulesFit($field, $customRules);
            }

            // Merge type rules with custom rules and remove duplicates
            $fieldRules = array_values(array_unique(array_merge($typeRules, $customRules)));

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
                $rules["data.{$name}"] = in_array('required', $fieldRules, true)
                    ? ['required', 'array']
                    : ['nullable', 'array'];

                $rules["data.{$name}.*"] = $fieldRules;
            }
            else
            {
                $rules["data.{$name}"] = $fieldRules;
            }
        }

        return $rules;
    }

    protected static function rulesForType(array $field): array
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
            // Rich text is stored as an editor document (JSON tree), not HTML.
            // Laravel only checks the outer shape here; the tree itself is
            // validated node by node by RichTextDocument, since a recursive
            // structure cannot be expressed as validation rules.
            'text' => ['array'],
            // No silent fallback: an unrecognised type used to validate as a
            // string, so a schema typo passed unnoticed and the field was
            // never really checked.
            default => throw self::unsupportedType($field, $type),
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
     * Reject a custom rule that cannot coexist with the field's type.
     *
     * These were merged in unchecked, so the two ways of getting it wrong both
     * failed quietly: an impossible combination rejected every value that was
     * ever submitted, and a size rule measured something other than what its
     * author meant.
     */
    protected static function assertCustomRulesFit(array $field, array $customRules): void
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
            $ruleName = strtolower(explode(':', trim($rule), 2)[0]);

            if (in_array($ruleName, self::TYPE_ASSERTING_RULES, true))
            {
                throw ValidationException::withMessages([
                    'schema' => "Field '{$name}' has validation rule '{$ruleName}', which asserts a data"
                        . " type. The field's type already decides that - use validation for constraints"
                        . ' such as max:60 instead.',
                ]);
            }

            if ($isDocument && in_array($ruleName, self::SIZE_RULES, true))
            {
                throw ValidationException::withMessages([
                    'schema' => "Field '{$name}' has validation rule '{$ruleName}', which would count"
                        . ' the nodes of a rich-text document rather than its characters. Size rules do'
                        . ' not apply to rich text.',
                ]);
            }
        }
    }

    protected static function unsupportedType(array $field, mixed $type): ValidationException
    {
        $name = $field['name'] ?? '(unnamed)';

        // A missing type and a misspelled one are different mistakes, and
        // "unsupported type 'null'" would describe the first one badly.
        $problem = $type === null
            ? 'declares no type'
            : "declares unsupported type '"
                . (is_scalar($type) ? (string) $type : get_debug_type($type)) . "'";

        return ValidationException::withMessages([
            'data' => "Module schema field '{$name}' {$problem}."
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
