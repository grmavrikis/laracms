<?php

namespace App\Services;

class SchemaRuleBuilder
{
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

        return match ($type)
        {
            'integer', 'number' => ['numeric'],
            'boolean' => ['boolean'],
            'email' => ['email'],
            'url' => ['url'],
            'date' => ['date'],
            'select' => self::buildSelectRules($field),
            'image' => ['string'],
            default => ['string'],
        };
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
