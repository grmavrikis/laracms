<?php

namespace Tests\Feature;

use App\Mail\EnquiryReceived;
use App\Models\Enquiry;
use App\Models\Language;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * The first inbound path from an anonymous visitor in the whole application
 * (TASKS.md #66).
 *
 * Every other write sits behind `auth:sanctum`; this one is open to the
 * internet, so it carries validation, a honeypot, a limiter of its own and a
 * consent record. The tests below are as much about what it **refuses** as
 * about what it stores.
 *
 * The enquiry is the record. An accommodation owner who loses one loses a
 * booking and blames the website, so nothing downstream - a mail server that
 * is down, a notification address nobody configured - may cost the row.
 */
class EnquiryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);

        Mail::fake();
        RateLimiter::clear('enquiries|127.0.0.1');
    }

    private function valid(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Μαρία Παπαδοπούλου',
            'email' => 'maria@example.com',
            'phone' => '+30 694 000 0000',
            'message' => 'Έχετε διαθεσιμότητα τον Ιούλιο για τέσσερις;',
            'arrives_on' => '2027-07-10',
            'departs_on' => '2027-07-17',
            'guests' => 4,
            'consent' => '1',
            'source_url' => 'https://mini-cms.test/el/domatia/souita',
        ], $overrides);
    }

    private function send(array $data = [], string $language = 'el')
    {
        return $this->post("/{$language}/enquiries", $this->valid($data));
    }

    // ------------------------------------------------------------ the happy path

    public function test_an_enquiry_is_stored_with_everything_it_was_sent(): void
    {
        $this->send()->assertRedirect();

        $enquiry = Enquiry::sole();

        $this->assertSame('Μαρία Παπαδοπούλου', $enquiry->name);
        $this->assertSame('maria@example.com', $enquiry->email);
        $this->assertSame('+30 694 000 0000', $enquiry->phone);
        $this->assertStringContainsString('Ιούλιο', $enquiry->message);
        $this->assertSame(4, $enquiry->guests);
        $this->assertSame('2027-07-10', $enquiry->arrives_on->toDateString());
        $this->assertSame('2027-07-17', $enquiry->departs_on->toDateString());
        $this->assertSame('https://mini-cms.test/el/domatia/souita', $enquiry->source_url);
    }

    /**
     * The language is taken from the URL rather than the payload: it is the
     * language the visitor was reading, and the owner replies in it.
     */
    public function test_the_language_comes_from_the_address_it_was_sent_from(): void
    {
        $this->send(language: 'en')->assertRedirect();

        $this->assertSame('en', Enquiry::sole()->language_code);
    }

    public function test_an_unknown_language_is_not_an_address(): void
    {
        $this->post('/de/enquiries', $this->valid())->assertNotFound();

        $this->assertSame(0, Enquiry::count());
    }

    /**
     * Consent is a record of a moment, not a boolean somebody can flip later.
     */
    public function test_consent_is_stored_as_the_time_it_was_given(): void
    {
        $this->send()->assertRedirect();

        $this->assertNotNull(Enquiry::sole()->consented_at);
    }

    // ------------------------------------------------------------- what it refuses

    public function test_the_message_the_name_and_the_email_are_required(): void
    {
        foreach (['name', 'email', 'message'] as $field)
        {
            $this->send([$field => ''])->assertSessionHasErrors($field);
        }

        $this->assertSame(0, Enquiry::count());
    }

    public function test_an_address_that_is_not_an_email_is_refused(): void
    {
        $this->send(['email' => 'not-an-email'])->assertSessionHasErrors('email');
    }

    /**
     * Without consent there is no lawful basis to keep the row, so there is no
     * row.
     */
    public function test_an_enquiry_without_consent_is_refused(): void
    {
        $this->send(['consent' => null])->assertSessionHasErrors('consent');

        $this->assertSame(0, Enquiry::count());
    }

    public function test_a_departure_before_the_arrival_is_refused(): void
    {
        $this->send(['arrives_on' => '2027-07-17', 'departs_on' => '2027-07-10'])
            ->assertSessionHasErrors('departs_on');
    }

    public function test_the_dates_are_optional_because_an_enquiry_is_not_a_booking(): void
    {
        $this->send(['arrives_on' => null, 'departs_on' => null, 'guests' => null])
            ->assertRedirect();

        $this->assertSame(1, Enquiry::count());
    }

    // ------------------------------------------------------------------ the honeypot

    /**
     * A honeypot rather than a captcha: at this volume a captcha costs
     * conversions and buys nothing (TASKS.md #66).
     *
     * A filled trap answers exactly as a real submission does. Telling a bot
     * it was caught is how it learns to stop filling the field.
     */
    public function test_a_filled_honeypot_looks_like_success_and_stores_nothing(): void
    {
        $this->send(['website' => 'http://spam.example'])->assertRedirect();

        $this->assertSame(0, Enquiry::count());
        Mail::assertNothingSent();
    }

    public function test_an_empty_honeypot_is_the_normal_case(): void
    {
        $this->send(['website' => ''])->assertRedirect();

        $this->assertSame(1, Enquiry::count());
    }

    // --------------------------------------------------------------- rate limiting

    /**
     * The public write needs a tighter limit than the `api` one: an open
     * endpoint is somebody's afternoon, and the visitor sending a genuine
     * enquiry sends one.
     */
    public function test_the_endpoint_is_limited_far_below_the_api(): void
    {
        for ($i = 0; $i < Enquiry::PER_HOUR; $i++)
        {
            $this->send(['email' => "visitor{$i}@example.com"])->assertRedirect();
        }

        $this->send(['email' => 'one-too-many@example.com'])->assertStatus(429);

        $this->assertSame(Enquiry::PER_HOUR, Enquiry::count());
    }

    // ------------------------------------------------------------------ the owner

    public function test_the_owner_is_told(): void
    {
        config(['site.enquiries_to' => 'owner@example.com']);

        $this->send()->assertRedirect();

        Mail::assertSent(EnquiryReceived::class, fn(EnquiryReceived $mail) => $mail->hasTo('owner@example.com'));
    }

    public function test_nothing_is_sent_when_nobody_has_said_where(): void
    {
        config(['site.enquiries_to' => null]);

        $this->send()->assertRedirect();

        Mail::assertNothingSent();
        $this->assertSame(1, Enquiry::count(), 'The enquiry is the record; the email is a courtesy.');
    }

    /**
     * A mail server being down must never cost the booking.
     */
    public function test_a_failing_mailer_does_not_lose_the_enquiry(): void
    {
        config(['site.enquiries_to' => 'owner@example.com']);

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));

        $this->send()->assertRedirect();

        $this->assertSame(1, Enquiry::count());
    }

    // ------------------------------------------------------------------- the admin

    public function test_the_admin_list_needs_a_session(): void
    {
        $this->getJson('/api/enquiries')->assertUnauthorized();
    }

    public function test_the_admin_sees_the_newest_first(): void
    {
        $this->send(['name' => 'Πρώτη'])->assertRedirect();
        $this->travel(1)->minutes();
        $this->send(['name' => 'Δεύτερη', 'email' => 'b@example.com'])->assertRedirect();

        $this->actingAs(User::factory()->create())
            ->getJson('/api/enquiries')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Δεύτερη');
    }

    public function test_an_enquiry_can_be_deleted(): void
    {
        $this->send()->assertRedirect();

        $this->actingAs(User::factory()->create())
            ->deleteJson('/api/enquiries/' . Enquiry::sole()->id)
            ->assertNoContent();

        $this->assertSame(0, Enquiry::count());
    }

    /**
     * An enquiry is a record of what somebody sent, not a document to revise
     * (TASKS.md #66). There is no route that could rewrite one.
     */
    public function test_an_enquiry_cannot_be_edited(): void
    {
        $this->send()->assertRedirect();

        $id = Enquiry::sole()->id;
        $user = User::factory()->create();

        $this->actingAs($user)->putJson("/api/enquiries/{$id}", ['name' => 'Rewritten'])
            ->assertStatus(405);

        $this->assertSame('Μαρία Παπαδοπούλου', Enquiry::sole()->name);
    }

    // ---------------------------------------------------------------- retention

    /**
     * The form states a retention period, so something has to enforce it -
     * a promise nothing keeps is worse than no promise.
     */
    public function test_enquiries_older_than_the_retention_period_are_pruned(): void
    {
        $this->send()->assertRedirect();
        $old = Enquiry::sole();
        $old->forceFill(['created_at' => now()->subMonths(Enquiry::RETENTION_MONTHS)->subDay()])->save();

        $this->send(['email' => 'recent@example.com'])->assertRedirect();

        $this->artisan('enquiries:prune')->assertSuccessful();

        $this->assertSame(1, Enquiry::count());
        $this->assertSame('recent@example.com', Enquiry::sole()->email);
    }

    public function test_pruning_keeps_one_that_has_just_reached_the_limit(): void
    {
        $this->send()->assertRedirect();
        Enquiry::sole()->forceFill([
            'created_at' => now()->subMonths(Enquiry::RETENTION_MONTHS)->addDay(),
        ])->save();

        $this->artisan('enquiries:prune')->assertSuccessful();

        $this->assertSame(1, Enquiry::count());
    }

    // ------------------------------------------------- the form inside a cache

    /**
     * The public pages are cached whole (#59), and a CSRF token is bound to
     * one session. Cache a page with a form in it and every visitor after the
     * first is handed **somebody else's token** - so every enquiry answers
     * 419 and the owner never learns the form is broken.
     *
     * Found by posting the form over real HTTP against MySQL rather than by
     * any test: the suite builds each page fresh, so the token always matched.
     */
    public function test_a_cached_page_does_not_serve_a_stale_csrf_token(): void
    {
        $first = $this->get('/el');
        $first->assertOk();

        $tokenFor = function (string $html): ?string
        {
            preg_match('/name="_token" value="([^"]+)"/', $html, $m);

            return $m[1] ?? null;
        };

        $one = $tokenFor($first->getContent());
        $this->assertNotNull($one, 'The home page carries no form to speak of.');

        // A different visitor: a new session, and the page comes from cache.
        $this->flushSession();

        $two = $tokenFor($this->get('/el')->assertOk()->getContent());

        $this->assertNotNull($two);
        $this->assertNotSame($one, $two, 'The cached page served one visitor the token of another.');
        $this->assertSame(csrf_token(), $two, 'The token served is not the one this session would accept.');
    }
}
