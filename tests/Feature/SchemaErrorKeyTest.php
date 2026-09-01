<?php

namespace Tests\Feature;

use App\Services\SchemaRuleBuilder;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Where a complaint about the schema is reported.
 *
 * `SchemaRuleBuilder::build()` serves two requests that carry different
 * fields: creating a Module sends `schema`, saving an Entry sends `data` and
 * has no `schema` at all. A 422 naming a field the request does not have is
 * one a client cannot show against anything - TASKS.md #39.
 *
 * That was fixed for all of the throws and tested for one of them, so
 * reverting either of the other two to its old hardcoded key broke nothing.
 * This pins the property for every throw `build()` can raise, under both
 * callers, which is the shape the rule actually has.
 */
class SchemaErrorKeyTest extends TestCase
{
    /**
     * @return array<string, array{array<int, array<string, mixed>>}>
     */
    public static function schemasThatCannotProduceRules(): array
    {
        return [
            'unsupported type' => [[
                ['name' => 'body', 'type' => 'nope', 'translatable' => false],
            ]],
            'no type at all' => [[
                ['name' => 'body', 'translatable' => false],
            ]],
            'rule contradicting the type' => [[
                ['name' => 'body', 'type' => 'text', 'translatable' => false, 'validation' => 'string'],
            ]],
            'size rule on rich text' => [[
                ['name' => 'body', 'type' => 'text', 'translatable' => false, 'validation' => 'max:255'],
            ]],
            'translatable gallery' => [[
                ['name' => 'photos', 'type' => 'gallery', 'translatable' => true],
            ]],
            'two fields sharing a name' => [[
                ['name' => 'body', 'type' => 'string', 'translatable' => false],
                ['name' => 'body', 'type' => 'integer', 'translatable' => false],
            ]],
        ];
    }

    #[DataProvider('schemasThatCannotProduceRules')]
    public function test_the_complaint_names_the_field_the_caller_sent(array $schema): void
    {
        foreach (['schema', 'data'] as $attribute)
        {
            try
            {
                SchemaRuleBuilder::build($schema, $attribute);

                $this->fail("A schema this broken should not produce rules: " . json_encode($schema));
            }
            catch (ValidationException $e)
            {
                $this->assertSame(
                    [$attribute],
                    array_keys($e->errors()),
                    "Reported against the wrong field when the caller sent '{$attribute}'."
                );
            }
        }
    }

    /**
     * Module creation is the common case and the one that cannot pass an
     * argument it does not know it needs, so the default has to suit it.
     */
    #[DataProvider('schemasThatCannotProduceRules')]
    public function test_the_default_suits_module_creation(array $schema): void
    {
        try
        {
            SchemaRuleBuilder::build($schema);

            $this->fail("A schema this broken should not produce rules: " . json_encode($schema));
        }
        catch (ValidationException $e)
        {
            $this->assertSame(['schema'], array_keys($e->errors()));
        }
    }
}
