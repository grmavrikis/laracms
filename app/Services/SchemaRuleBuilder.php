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
            }

            // Merge type rules with custom rules and remove duplicates
            $fieldRules = array_values(array_unique(array_merge($typeRules, $customRules)));

            // Add nullable if required is not explicitly set
            if (!in_array('required', $fieldRules) && !in_array('nullable', $fieldRules))
            {
                array_unshift($fieldRules, 'nullable');
            }

            if ($isTranslatable)
            {
                $rules["data.{$name}"] = ['required', 'array'];
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
        $type = $field['type'] ?? 'string';

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

    protected static function unsupportedType(array $field, mixed $type): ValidationException
    {
        $name = $field['name'] ?? '(unnamed)';
        $type = is_scalar($type) ? (string) $type : get_debug_type($type);

        return ValidationException::withMessages([
            'data' => "Module schema field '{$name}' declares unsupported type '{$type}'."
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
