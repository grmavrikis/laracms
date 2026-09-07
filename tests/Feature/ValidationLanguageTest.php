<?php

namespace Tests\Feature;

use App\Http\Requests\StoreEnquiryRequest;
use App\Models\Language;
use App\Models\User;
use App\Services\SchemaRuleBuilder;
use App\Services\SiteSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * **A Greek visitor is refused in Greek** (TASKS.md #99).
 *
 * `lang:publish` created `lang/en/` only, and Laravel falls back per key to
 * `APP_FALLBACK_LOCALE` - so the two messages this project wrote by hand were
 * Greek while every *framework* one stayed English:
 *
 *     The email field must be a valid email address.
 *     Παρακαλούμε συμφωνήστε να κρατήσουμε τα στοιχεία σας για να σας απαντήσουμε.
 *
 * The framework messages are the **majority** of what anyone ever reads -
 * every `required`, `email`, `max`, `date` and `integer` on the form. The
 * hand-written pair is the exception.
 *
 * **Neither `TranslationTest` nor the live probe caught it**, because both
 * asserted on the consent message, which is the one that had been translated.
 * A test written from the same understanding as the code cannot find what that
 * understanding missed - so this one asserts over *every* message the response
 * carries rather than over a chosen one, and asks only that each is in the
 * reader's alphabet.
 */
class ValidationLanguageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);

        // The enquiry route allows five an hour per address, and every request
        // in the suite shares one. Two posts per refusal leaves room for one
        // more payload before the answers become 429s and every assertion here
        // starts failing as though the route were broken. What the limiter does
        // is `EnquiryTest`'s subject; this class is about wording.
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    /**
     * The words a Greek sentence may contain in Latin script: loanwords the
     * language actually uses, and nothing else.
     *
     * Asking that a message merely *contains* Greek is not enough - a Greek
     * label sits inside an English sentence, which is how *"The Σελίδα Facebook
     * field must be a valid URL"* reads as translated, and it is the shape of
     * this whole finding. Found live once more after that: the arrival date
     * answered *"…μεταγενέστερη της today"*, because `:date` interpolates the
     * rule's own parameter.
     */
    private function assertReadsAsGreek(string $message): void
    {
        $this->assertMatchesRegularExpression(
            '/\p{Greek}/u',
            $message,
            'A Greek reader gets this in English: ' . $message
        );

        preg_match_all('/[A-Za-z]{3,}/u', $message, $latin);

        foreach ($latin[0] as $word)
        {
            $this->assertContains(
                mb_strtolower($word),
                self::LOANWORDS,
                "'{$word}' is English, in: " . $message
            );
        }
    }

    /**
     * Everything a visitor can get wrong on the enquiry form, in two posts
     * because some rules cannot fail on the same field at once.
     *
     * Between them: `required`, `email`, `max` on a string, `date`,
     * `after_or_equal`, `after`, `integer`, `min` on a number and `accepted`.
     *
     * @return array<int, string> every message, flattened
     */
    private function refusals(string $language): array
    {
        $payloads = [
            [
                'name' => '',
                'email' => 'not-an-email',
                'phone' => str_repeat('9', 60),
                'message' => '',
                'arrives_on' => '2020-01-01',
                'departs_on' => '2019-01-01',
                'guests' => 0,
                'source_url' => 'https://example.com/' . str_repeat('x', 600),
            ],
            [
                'name' => 'Μαρία',
                'email' => 'maria@example.com',
                'message' => 'Καλησπέρα σας.',
                'arrives_on' => 'not-a-date',
                'guests' => 'four',
                'consent' => '1',
            ],
        ];

        $messages = [];

        foreach ($payloads as $payload)
        {
            $errors = $this->postJson("/{$language}/enquiries", $payload)
                ->assertStatus(422)
                ->json('errors');

            foreach ($errors as $field)
            {
                foreach ($field as $message)
                {
                    $messages[] = $message;
                }
            }
        }

        return $messages;
    }

    // --------------------------------------------------------- the public form

    /**
     * Each one is a word Greek writes in Latin script, in a message these two
     * surfaces actually produce. Nothing goes in defensively: an entry here is
     * a hole in the check above it, so it waits for a failure that needs it.
     */
    private const LOANWORDS = ['email', 'json', 'kilobytes', 'url', 'facebook', 'instagram'];

    public function test_every_refusal_a_greek_visitor_reads_is_in_greek(): void
    {
        $messages = $this->refusals('el');

        $this->assertGreaterThan(8, count($messages), 'The payloads stopped breaking the rules they were written to break.');

        foreach ($messages as $message)
        {
            $this->assertReadsAsGreek($message);
        }
    }

    /**
     * **One complaint at a time about a date.** Laravel runs every rule on a
     * field, so `15/07/2027` - which is how Greek writes a date - failed `date`
     * *and* `after_or_equal`, and the visitor was told both that it is not a
     * date and that it is in the past. The second is false, and sends them
     * looking for a problem that is not there.
     */
    public function test_a_date_that_cannot_be_read_is_not_also_called_past(): void
    {
        $errors = $this->postJson('/el/enquiries', [
            'name' => 'Μαρία',
            'email' => 'maria@example.com',
            'message' => 'Καλησπέρα σας.',
            'arrives_on' => '15/07/2027',
            'departs_on' => 'κάποια στιγμή',
            'consent' => '1',
        ])->assertStatus(422)->json('errors');

        $this->assertCount(1, $errors['arrives_on'], 'The arrival date was refused twice: ' . implode(' / ', $errors['arrives_on']));
        $this->assertCount(1, $errors['departs_on'], 'The departure date was refused twice: ' . implode(' / ', $errors['departs_on']));

        $this->assertStringContainsString('ημερομηνία', $errors['arrives_on'][0]);
    }

    /**
     * **The messages are half of it.** Every framework line interpolates
     * `:attribute`, which resolves to the request key - so a Greek
     * `validation.php` on its own produces *«Το πεδίο arrives_on είναι
     * υποχρεωτικό»*, a Greek sentence around an English column name.
     */
    public function test_a_field_is_named_the_way_the_form_names_it(): void
    {
        $messages = $this->refusals('el');

        // What Laravel prints when nothing names the field: the column itself,
        // with its underscores turned into spaces.
        foreach (['arrives_on', 'arrives on', 'departs_on', 'departs on', 'source_url', 'source url'] as $leak)
        {
            foreach ($messages as $message)
            {
                $this->assertStringNotContainsString(
                    $leak,
                    $message,
                    "The column name '{$leak}' is showing through: " . $message
                );
            }
        }

        // And a label is there in its place, so this cannot pass by the
        // messages simply having gone missing.
        $this->assertNotEmpty(
            preg_grep('/' . preg_quote(__('Arrival date', [], 'el'), '/') . '/u', $messages),
            'No refusal names the arrival date the way the panel does.'
        );
    }

    /**
     * **The rules, not the sentences a payload happens to trigger.**
     *
     * The tests above prove what these two payloads produce; this proves the
     * file covers what the form *declares*, so a rule added to it later
     * without a Greek message fails here rather than in front of a visitor.
     * That is the gap #99 was found in: `TranslationTest` asserted the one
     * message somebody had thought about.
     *
     * A partial `lang/el/validation.php` is correct on purpose - the fallback
     * covers every rule nobody uses - and this is what says which rules are
     * "used".
     */
    public function test_every_rule_the_two_surfaces_use_has_a_greek_message(): void
    {
        $public = collect((new StoreEnquiryRequest())->rules())->flatten();

        $panel = collect(SchemaRuleBuilder::build(app(SiteSettings::class)->schema(), 'data'))->flatten();

        // **And the entry screens**, which validate against a *module's*
        // schema rather than a fixed one - so the rules depend on which field
        // types a module uses. One field of every supported type is what makes
        // this the whole set rather than the settings screen's corner of it.
        //
        // What it still cannot cover is a field's own `validation` string,
        // which its author writes: `digits:10` is a rule nobody here can
        // predict, and it falls back to English by design (see
        // `lang/el/validation.php`).
        $entries = collect(SchemaRuleBuilder::build($this->aFieldOfEveryType()))->flatten();

        $rules = $public->merge($panel)->merge($entries)
            ->filter(fn (mixed $rule) => is_string($rule))
            ->map(fn (string $rule) => Str::before($rule, ':'))
            // None of these ever produces a message: they decide whether the
            // other rules run, and how far.
            ->reject(fn (string $rule) => in_array($rule, ['nullable', 'sometimes', 'bail'], true))
            ->unique()
            ->values();

        $this->assertGreaterThan(5, $rules->count(), 'The rules stopped being readable from the requests.');

        // Each of these reaches a reader through exactly one of the three, so
        // together they say the set is all three rather than whichever one
        // somebody left in. Without this, dropping a source could never fail:
        // the loop below only asks about the rules it is given.
        $this->assertContains('accepted', $rules->all(), 'The enquiry form is not in this set.');
        $this->assertContains('url', $rules->all(), 'The settings screen is not in this set.');
        $this->assertContains('distinct', $rules->all(), 'The entry screens are not in this set.');

        foreach ($rules as $rule)
        {
            $this->assertTrue(
                Lang::has("validation.{$rule}", 'el'),
                "The '{$rule}' rule has no Greek message, so a Greek reader gets the English one."
            );

            // **Read out of the catalogue, not out of a response.** In a
            // rendered message `:attribute` has already been replaced by a
            // Greek label, so an English sentence around it still contains
            // Greek letters - which is how "The Σελίδα Facebook field must be a
            // valid URL" passes for translated, and it is the whole shape of
            // this finding. The raw line has no label in it.
            $greek = Lang::get("validation.{$rule}", [], 'el');
            $english = Lang::get("validation.{$rule}", [], 'en');

            foreach (Arr::wrap($greek) as $key => $line)
            {
                $this->assertNotSame(
                    is_array($english) ? ($english[$key] ?? null) : $english,
                    $line,
                    "The '{$rule}' rule reads the same in both languages, so it is the English one."
                );

                $this->assertMatchesRegularExpression(
                    '/\p{Greek}/u',
                    $line,
                    "The '{$rule}' rule is not in Greek: " . $line
                );
            }
        }
    }

    /**
     * A module schema using every type the builder supports, half of them
     * translatable and required, so the rules it emits are the whole set an
     * entry screen can produce rather than one module's corner of it.
     *
     * Read from `SUPPORTED_TYPES`, so a type added later is covered here the
     * day it is added.
     *
     * @return array<int, array<string, mixed>>
     */
    private function aFieldOfEveryType(): array
    {
        $schema = [];

        foreach (SchemaRuleBuilder::SUPPORTED_TYPES as $index => $type)
        {
            $field = [
                'name' => 'field_' . $index,
                'type' => $type,
                // A gallery cannot be translatable, and the builder refuses it.
                'translatable' => $index % 2 === 0 && !in_array($type, SchemaRuleBuilder::GALLERY_FIELD_TYPES, true),
                'required' => $index % 2 === 1,
            ];

            if ($type === 'select')
            {
                $field['options'] = ['one', 'two'];
            }

            $schema[] = $field;
        }

        return $schema;
    }

    /**
     * The fallback still carries English, which is the half a partial
     * `lang/el/` depends on: only the rules the forms use are translated, and
     * every other key resolves through `APP_FALLBACK_LOCALE`.
     */
    public function test_an_english_visitor_still_reads_english(): void
    {
        foreach ($this->refusals('en') as $message)
        {
            $this->assertDoesNotMatchRegularExpression(
                '/\p{Greek}/u',
                $message,
                'An English visitor reads this in Greek: ' . $message
            );
        }
    }

    // --------------------------------------------------------------- the panel

    /**
     * **The panel has the same gap**, and #67 already fixed the half of it that
     * names the field - the settings screen passes its own labels as
     * `attributes`. That makes what is left the exact mirror of the public
     * form's:
     *
     *     The Σελίδα Facebook field must be a valid URL.
     */
    public function test_the_panel_refuses_in_the_language_it_is_read_in(): void
    {
        $owner = User::factory()->create(['locale' => 'el']);

        $message = $this->actingAs($owner)->putJson('/api/settings', [
            'data' => ['facebook_url' => 'not a url'],
        ])->assertStatus(422)->json('errors')['data.facebook_url'][0];

        // The same scan the public form gets. Checking for a phrase this
        // reviewer happened to think of - `must be` - let *"The Σελίδα Facebook
        // field is required."* through, on the surface the owner reads daily.
        $this->assertReadsAsGreek($message);
    }

    /** And an English panel is unchanged. */
    public function test_an_english_panel_is_refused_in_english(): void
    {
        $owner = User::factory()->create(['locale' => 'en']);

        $message = $this->actingAs($owner)->putJson('/api/settings', [
            'data' => ['facebook_url' => 'not a url'],
        ])->assertStatus(422)->json('errors')['data.facebook_url'][0];

        $this->assertDoesNotMatchRegularExpression('/\p{Greek}/u', $message);
    }
}
