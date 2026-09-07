<?php

namespace Tests\Feature;

use App\Models\Enquiry;
use App\Models\EntrySlug;
use App\Models\Module;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * **A validation limit and the column behind it are one number** (TASKS.md
 * #98).
 *
 * The enquiry widths were written three times - in the migration, in
 * `StoreEnquiryRequest` and in the theme's `maxlength` - with nothing
 * connecting them, and `phone` (40) and `source_url` (512) sat exactly at the
 * column limit. Relax one of those rules without a migration and MySQL answers
 * **1406** on the insert, which is a 500 on the public form: TASKS.md #76,
 * again, in the one place the application accepts writes from strangers.
 *
 * ### What this can and cannot prove
 *
 * The suite runs on SQLite, and Laravel's SQLite grammar writes `varchar` with
 * **no length at all** (`SQLiteGrammar::typeString`), so there is no declared
 * width here to read back. Three of the four drift paths are still closed:
 *
 * | Drift | Closed by |
 * |---|---|
 * | the rule outgrows the constant | the refusals below, over HTTP |
 * | the migration outgrows the constant | the source assertions below |
 * | the form outgrows the constant | the rendered `maxlength` below |
 * | **a column already created stays narrow** | `php artisan migrate` |
 *
 * The fourth is the one no test can see, because editing a constant does not
 * alter a table that already exists. That is what the migration beside this
 * change is for, and the live widths were read by hand after it ran.
 */
class ColumnWidthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->languages('el');

        // Every refusal below is a separate post, and the form allows five an
        // hour per address. What the limiter does is `EnquiryTest`'s subject.
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /** The valid enquiry these tests push one field over at a time. */
    private function enquiry(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Μαρία Παπαδοπούλου',
            'email' => 'maria@example.com',
            'message' => 'Καλησπέρα σας.',
            'consent' => '1',
        ], $overrides);
    }

    /**
     * @return array<string, array{0: string, 1: int}> field => [what a long
     *                                                 value looks like, limit]
     */
    public static function boundedFields(): array
    {
        return [
            'name' => ['a', Enquiry::NAME_MAX_LENGTH],
            'phone' => ['9', Enquiry::PHONE_MAX_LENGTH],
            'message' => ['x', Enquiry::MESSAGE_MAX_LENGTH],
            'source_url' => ['u', Enquiry::SOURCE_URL_MAX_LENGTH],
        ];
    }

    /**
     * **The rule is the constant.** One character over is refused with a 422 -
     * the answer a form can show - rather than reaching a column that cannot
     * hold it.
     */
    public function test_a_value_over_the_limit_is_refused_not_stored(): void
    {
        foreach (self::boundedFields() as $field => [$character, $limit])
        {
            $this->postJson('/el/enquiries', $this->enquiry([$field => str_repeat($character, $limit + 1)]))
                ->assertStatus(422)
                ->assertJsonValidationErrors($field);
        }

        $this->assertSame(0, Enquiry::count());
    }

    /** And exactly the limit is accepted, so the constant is not one off. */
    public function test_a_value_at_the_limit_is_accepted(): void
    {
        foreach (self::boundedFields() as $field => [$character, $limit])
        {
            $value = str_repeat($character, $limit);

            // `email` is bounded too but cannot be a run of one character; it
            // is covered by the refusal test above.
            $this->postJson('/el/enquiries', $this->enquiry([$field => $value]))
                ->assertOk();

            $this->assertSame($value, Enquiry::query()->latest('id')->first()->{$field});
        }
    }

    /**
     * **The migration reads the constant**, so a fresh installation cannot get
     * a column narrower than the rule that fills it. A literal here is how the
     * two drifted apart in the first place.
     */
    public function test_the_migrations_name_the_constants(): void
    {
        $expected = [
            'enquiries' => [
                'Enquiry::NAME_MAX_LENGTH',
                'Enquiry::EMAIL_MAX_LENGTH',
                'Enquiry::PHONE_MAX_LENGTH',
                'Enquiry::SOURCE_URL_MAX_LENGTH',
            ],
            'entry_slugs' => ['EntrySlug::SLUG_MAX_LENGTH'],
            'module_slugs' => ['Module::NAME_MAX_LENGTH', 'Module::SLUG_MAX_LENGTH'],
        ];

        foreach ($expected as $table => $constants)
        {
            $source = $this->migrationFor($table);

            foreach ($constants as $constant)
            {
                $this->assertStringContainsString(
                    $constant,
                    $source,
                    "The migration for `{$table}` writes a width by hand instead of reading {$constant}."
                );
            }
        }
    }

    /**
     * **The form stops at the same number.** A `maxlength` above the rule lets
     * a visitor type a message that is refused when they press Send; below it,
     * the browser silently truncates what they wrote.
     */
    public function test_the_form_stops_where_the_rules_do(): void
    {
        $html = $this->get('/el')->assertOk()->getContent();

        $widths = [
            'name' => Enquiry::NAME_MAX_LENGTH,
            'email' => Enquiry::EMAIL_MAX_LENGTH,
            'phone' => Enquiry::PHONE_MAX_LENGTH,
            'message' => Enquiry::MESSAGE_MAX_LENGTH,
        ];

        foreach ($widths as $field => $width)
        {
            $this->assertMatchesRegularExpression(
                '/name="' . $field . '"[^>]*maxlength="' . $width . '"|maxlength="' . $width . '"[^>]*name="' . $field . '"/',
                $html,
                "The form's {$field} field does not stop at {$width}."
            );
        }

        $this->assertStringContainsString('max="' . Enquiry::GUESTS_MAX . '"', $html);
    }

    /** The migration that creates `$table`, whatever it is called. */
    private function migrationFor(string $table): string
    {
        foreach (File::files(database_path('migrations')) as $file)
        {
            $source = File::get($file->getPathname());

            if (str_contains($source, "Schema::create('{$table}'"))
            {
                return $source;
            }
        }

        $this->fail("No migration creates `{$table}`.");
    }
}
