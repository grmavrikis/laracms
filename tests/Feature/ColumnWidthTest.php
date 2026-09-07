<?php

namespace Tests\Feature;

use App\Http\Controllers\UploadController;
use App\Models\Enquiry;
use App\Models\EntrySlug;
use App\Models\Module;
use App\Models\ModuleSlug;
use App\Models\Redirect;
use App\Models\User;
use App\Services\SchemaLimits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionClass;
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
 * ### Where each half is kept honest
 *
 * The limits are constants on the models. The columns are **literals in the
 * migrations**, because a migration is a record of what the schema became on
 * the day it ran - one that read a constant would mean something different on
 * a fresh database than on one that had already run it, and the two would
 * diverge in silence.
 *
 * | Drift | Closed by |
 * |---|---|
 * | the rule outgrows the constant | the refusals below, over HTTP |
 * | the form outgrows the constant | the rendered `maxlength` below |
 * | a constant outgrows the column | **`schema:doctor`**, run on a deployment |
 * | a new constant nobody checks | the reflection test below |
 *
 * The third cannot be a test: SQLite records no width at all (Laravel's grammar
 * writes `varchar` with no length), so the suite's own driver has nothing to
 * compare. What *can* be tested here is the command's reading of a type, and
 * that every width constant is on its list.
 */
class ColumnWidthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->languages('el');

        // Each case below is a separate post, and the form allows five an hour
        // per address. What the limiter does is `EnquiryTest`'s subject.
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
     * Every bounded field, and a value of exactly its limit.
     *
     * `email` has to be built rather than repeated, and the first version of
     * this file left it out for that reason - with a comment saying another
     * test covered it, which was true of no test in the file. A data provider
     * rather than a loop, so a field that breaks is named by the failure
     * instead of stopping the ones after it.
     *
     * @return array<string, array{0: string, 1: string, 2: int}>
     */
    public static function boundedFields(): array
    {
        return [
            'name' => ['name', str_repeat('α', Enquiry::NAME_MAX_LENGTH), Enquiry::NAME_MAX_LENGTH],
            'email' => ['email', str_repeat('a', Enquiry::EMAIL_MAX_LENGTH - 12) . '@example.com', Enquiry::EMAIL_MAX_LENGTH],
            'phone' => ['phone', str_repeat('9', Enquiry::PHONE_MAX_LENGTH), Enquiry::PHONE_MAX_LENGTH],
            'message' => ['message', str_repeat('x', Enquiry::MESSAGE_MAX_LENGTH), Enquiry::MESSAGE_MAX_LENGTH],
            'source_url' => [
                'source_url',
                'https://example.com/' . str_repeat('u', Enquiry::SOURCE_URL_MAX_LENGTH - 20),
                Enquiry::SOURCE_URL_MAX_LENGTH,
            ],
        ];
    }

    /**
     * **The rule is the constant.** One character over is refused with a 422 -
     * the answer a form can show - rather than reaching a column that cannot
     * hold it.
     */
    #[DataProvider('boundedFields')]
    public function test_a_value_over_the_limit_is_refused_not_stored(string $field, string $atTheLimit, int $limit): void
    {
        $this->assertSame($limit + 1, mb_strlen($atTheLimit . 'x'));

        $this->postJson('/el/enquiries', $this->enquiry([$field => $atTheLimit . 'x']))
            ->assertStatus(422)
            ->assertJsonValidationErrors($field);

        $this->assertSame(0, Enquiry::count());
    }

    /** And exactly the limit is accepted, so the constant is not one off. */
    #[DataProvider('boundedFields')]
    public function test_a_value_at_the_limit_is_accepted(string $field, string $atTheLimit, int $limit): void
    {
        $this->assertSame($limit, mb_strlen($atTheLimit), 'This case builds a value that is not the limit long.');

        $this->postJson('/el/enquiries', $this->enquiry([$field => $atTheLimit]))->assertOk();

        $this->assertSame($atTheLimit, Enquiry::sole()->{$field});
    }

    /**
     * **The form stops where the rules do.** A `maxlength` above the rule lets
     * a visitor type a message that is refused when they press Send; below it,
     * the browser silently truncates what they wrote.
     *
     * The partial is rendered on its own rather than fetched from `/el`:
     * **where a client puts their contact form is the theme's decision** (#61),
     * and core's suite asserting it is on the home page would fail for the
     * second theme that moves it.
     */
    public function test_the_form_stops_where_the_rules_do(): void
    {
        $html = view('theme::enquiry')->render();

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

    // ------------------------------------------------- what the doctor reads

    /**
     * **A column that is not there is a failure, not an unknown.**
     *
     * The first version read a missing column as "the driver reports no width"
     * and passed - so a dropped or renamed column, which is the completest way
     * for a schema to fall behind the code, made the doctor say everything was
     * well *and* blame the driver for it.
     */
    public function test_the_doctor_separates_missing_from_unknown_from_narrow(): void
    {
        $declared = [];

        foreach (SchemaLimits::expectations() as [$table, $column])
        {
            $declared["{$table}.{$column}"] = 'varchar(9000)';
        }

        $declared['enquiries.source_url'] = null;      // no such column
        $declared['modules.slug'] = 'varchar';         // no declared width
        $declared['entry_slugs.slug'] = 'varchar(10)'; // narrower than the rule

        $report = SchemaLimits::compare($declared);

        $this->assertCount(1, $report['missing']);
        $this->assertStringContainsString('enquiries.source_url', $report['missing'][0]);

        $this->assertCount(1, $report['unknown']);
        $this->assertStringContainsString('modules.slug', $report['unknown'][0]);

        $this->assertCount(1, $report['narrow']);
        $this->assertStringContainsString('entry_slugs.slug', $report['narrow'][0]);
    }

    /** A column the caller never mentioned is missing too, not simply absent. */
    public function test_a_column_nobody_reported_is_reported(): void
    {
        $report = SchemaLimits::compare([]);

        $this->assertCount(count(SchemaLimits::expectations()), $report['missing']);
        $this->assertSame([], $report['narrow']);
    }

    /**
     * **PHP has to be able to receive what the panel accepts.** A default
     * install ships `upload_max_filesize = 2M`, which is exactly the panel's
     * own limit - and `post_max_size` has to be larger still, because the body
     * carries the file plus its multipart wrapper. Under either, the upload
     * never reaches the rule and the owner is told the image is missing.
     */
    public function test_php_limits_below_the_panel_s_are_reported(): void
    {
        $limit = UploadController::MAX_KILOBYTES;

        $this->assertSame([], SchemaLimits::uploadProblems('10M', '10M'));

        $this->assertCount(1, SchemaLimits::uploadProblems('1M', '10M'));
        $this->assertStringContainsString('upload_max_filesize', SchemaLimits::uploadProblems('1M', '10M')[0]);

        // Exactly the limit leaves no room for the rest of the body.
        $this->assertCount(1, SchemaLimits::uploadProblems('10M', $limit . 'K'));

        // Unlimited, and unreadable, are not problems to report.
        $this->assertSame([], SchemaLimits::uploadProblems('0', '0'));
        $this->assertSame([], SchemaLimits::uploadProblems(null, null));
    }

    public function test_a_php_ini_size_is_read_in_kilobytes(): void
    {
        $this->assertSame(2048, SchemaLimits::kilobytesOf('2M'));
        $this->assertSame(512, SchemaLimits::kilobytesOf('512K'));
        $this->assertSame(1024 * 1024, SchemaLimits::kilobytesOf('1G'));
        $this->assertSame(8, SchemaLimits::kilobytesOf('8192'));

        // Zero means no limit at all, which is not a number to compare.
        $this->assertNull(SchemaLimits::kilobytesOf('0'));
        $this->assertNull(SchemaLimits::kilobytesOf('nonsense'));
        $this->assertNull(SchemaLimits::kilobytesOf(null));
    }

    /**
     * A constant that has been renamed is reported, not thrown: this runs on a
     * server, and `constant()` would raise an `Error` where the command's whole
     * job is to answer a question clearly.
     */
    public function test_a_constant_that_no_longer_exists_is_reported(): void
    {
        $report = SchemaLimits::compare(
            ['enquiries.name' => 'varchar(120)'],
            [['enquiries', 'name', Enquiry::class, 'RENAMED_AWAY']]
        );

        $this->assertCount(1, $report['unnamed']);
        $this->assertStringContainsString('RENAMED_AWAY', $report['unnamed'][0]);
        $this->assertSame([], $report['narrow']);

        // And the list the command actually uses names only constants that do.
        $this->assertSame([], SchemaLimits::compare([])['unnamed']);
    }

    /**
     * The command's own reading of a column type, which is the half of it the
     * suite's driver can exercise: SQLite reports `varchar` with no length, so
     * the comparison itself never runs here.
     */
    public function test_a_declared_width_is_read_out_of_a_column_type(): void
    {
        $this->assertSame(120, SchemaLimits::widthOf('varchar(120)'));
        $this->assertSame(5, SchemaLimits::widthOf('CHAR(5)'));
        $this->assertSame(2048, SchemaLimits::widthOf('varchar(2048) COLLATE utf8mb4_bin'));

        // Nothing to compare against, which has to read as "unknown" rather
        // than as zero - a zero would report every column as too narrow.
        $this->assertNull(SchemaLimits::widthOf('varchar'));
        $this->assertNull(SchemaLimits::widthOf('text'));
        $this->assertNull(SchemaLimits::widthOf(''));
    }

    /**
     * **Every width constant is on the doctor's list.**
     *
     * Adding one and forgetting to check it is the same gap one level up: the
     * rule would grow, the column would not, and nothing would say so. Read by
     * reflection, so a constant added tomorrow is covered today.
     */
    public function test_no_width_constant_is_left_unchecked(): void
    {
        // **By name, not by value.** Several of these are 255, so a list of
        // numbers said a constant was covered when what was covering it was
        // somebody else's - dropping `entry_slugs.slug` from the doctor passed.
        $checked = array_map(
            fn (array $one) => $one[2] . '::' . $one[3],
            SchemaLimits::expectations()
        );

        // Limits on a **rule** rather than widths of a column, so there is
        // nothing for the doctor to compare them against.
        $notColumns = [
            Enquiry::class . '::MESSAGE_MAX_LENGTH', // the column is `text`
            Enquiry::class . '::GUESTS_MAX',         // a small integer
        ];

        // **Every model, read off disk.** A hand-written list would reproduce
        // at this level the gap this test exists to close: the seventh model's
        // constant would be invisible to the thing that checks constants.
        $models = collect(File::files(app_path('Models')))
            ->map(fn ($file) => 'App\\Models\\' . $file->getFilenameWithoutExtension())
            ->all();

        $this->assertGreaterThan(5, count($models), 'The models stopped being readable from disk.');

        foreach ($models as $model)
        {
            foreach ((new ReflectionClass($model))->getConstants() as $name => $value)
            {
                if (!str_ends_with($name, '_MAX_LENGTH') && !str_ends_with($name, '_MAX'))
                {
                    continue;
                }

                $this->assertTrue(
                    in_array("{$model}::{$name}", $checked, true)
                        || in_array("{$model}::{$name}", $notColumns, true),
                    "{$model}::{$name} is a limit that `schema:doctor` never compares against a column."
                );
            }
        }
    }

    // ------------------------------- numbers that have to clear a calculation

    /**
     * **A redirect can hold the longest address this site can make.**
     *
     * It was 512 while that address is 518 - a language code, two slugs of 255
     * and their slashes - so a rename of a module with long slugs logged and
     * skipped the redirects for its pages, and those addresses stayed dead. The
     * sum is the assertion; the constant is only where the answer is kept.
     */
    public function test_a_redirect_can_hold_the_longest_address_the_site_can_make(): void
    {
        $longest = 1 + 5 + 1 + ModuleSlug::SLUG_MAX_LENGTH + 1 + EntrySlug::SLUG_MAX_LENGTH;

        $this->assertGreaterThanOrEqual(
            $longest,
            Redirect::PATH_MAX_LENGTH,
            'A rename of a module with the longest slugs it allows cannot record where its pages went.'
        );
    }

    /**
     * And the hidden field the enquiry form fills with `url()->current()`,
     * which is that same path with a scheme and a host in front of it. At 512
     * a page with long slugs refused **every** enquiry sent from it, naming a
     * field the visitor can neither see nor fix.
     */
    public function test_an_enquiry_can_hold_the_address_of_the_page_it_came_from(): void
    {
        $host = 253; // the longest a hostname may be
        $longest = strlen('https://') + $host + 1 + 5 + 1 + ModuleSlug::SLUG_MAX_LENGTH + 1 + EntrySlug::SLUG_MAX_LENGTH;

        $this->assertGreaterThanOrEqual(
            $longest,
            Enquiry::SOURCE_URL_MAX_LENGTH,
            'A visitor writing from a page with long slugs is refused over a field they cannot see.'
        );
    }
}
