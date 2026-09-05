<?php

namespace Tests\Feature;

use App\Mail\EnquiryReceived;
use App\Models\Enquiry;
use App\Models\Language;
use App\Models\Module;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ViewErrorBag;
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
     * A module, which the home page lists and which has a page of its own.
     */
    private function aModule(): Module
    {
        return Module::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Rooms',
            'slug' => 'rooms',
            'schema' => [['name' => 'title', 'type' => 'string', 'translatable' => true]],
        ]);
    }

    /**
     * Behind the model's back, so the observer does not invalidate anything
     * and only a cache can hide the new name.
     */
    private function quietlyRename(Module $module): void
    {
        $module->forceFill(['name' => 'Renamed'])->saveQuietly();
    }

    /**
     * **A page carrying a form is not cached**, and this is the reason.
     *
     * The public pages are cached whole (#59), and everything a form needs is
     * session state: the CSRF token, the confirmation after a submission, the
     * errors after a failure, the values to type back into the boxes. A cached
     * page has none of it - it was rendered before any of that existed and is
     * handed to every visitor unchanged.
     *
     * The token half was found by posting the live form and answered by
     * substituting a placeholder. That was the wrong depth: the other three
     * are arbitrary content and cannot be substituted, so what must not be
     * cached is the page.
     */
    public function test_a_page_with_a_form_is_not_cached(): void
    {
        $module = $this->aModule();

        $this->get('/el')->assertOk()->assertSee('Rooms', false);

        $this->quietlyRename($module);

        $this->get('/el')->assertOk()->assertSee('Renamed', false);
    }

    /**
     * A page with no form keeps its cache: the reason to skip one is the form
     * in it, not the address.
     */
    public function test_a_page_without_a_form_is_still_cached(): void
    {
        $module = $this->aModule();

        $this->get('/el/rooms')->assertOk()->assertSee('Rooms', false);

        $this->quietlyRename($module);

        $this->get('/el/rooms')->assertOk()->assertDontSee('Renamed', false);
    }

    /**
     * The whole point of a contact form is that the visitor knows it worked.
     */
    public function test_the_visitor_is_told_the_enquiry_was_sent(): void
    {
        $this->get('/el')->assertOk();

        $this->from('/el')->send()->assertRedirect('/el');

        $this->get('/el')->assertOk()->assertSee('στάλθηκε', false);
    }

    /**
     * And knows when it did not, and does not have to type it all again.
     */
    public function test_a_failed_submission_shows_the_error_and_keeps_what_was_typed(): void
    {
        $this->get('/el')->assertOk();

        $this->from('/el')->send(['email' => 'not-an-email'])->assertRedirect('/el');

        $this->get('/el')
            ->assertOk()
            ->assertSee('email', false)
            ->assertSee('Μαρία Παπαδοπούλου', false);
    }

    /**
     * A CSRF token belongs to one session, so it may never come out of a
     * cache. Same rule as the tests above, pinned separately because it is the
     * one whose failure is silent: a form that answers 419 for everybody but
     * the first visitor.
     */
    public function test_the_token_on_the_form_belongs_to_the_session_reading_it(): void
    {
        $tokenOn = function (string $path): string
        {
            preg_match('/name="_token" value="([^"]+)"/', $this->get($path)->getContent(), $m);

            $this->assertNotEmpty($m[1] ?? '', 'The page carries no form to speak of.');

            return $m[1];
        };

        $first = $tokenOn('/el');

        $this->flushSession();

        // The request first: `csrf_token()` is null until a session that has
        // been flushed is started again.
        $second = $tokenOn('/el');

        $this->assertSame(csrf_token(), $second, 'The token served is not the one this session would accept.');
        $this->assertNotSame($first, $second, 'The page was cached and handed one visitor the token of another.');
    }

    // ------------------------------------------------- the partial on its own

    /**
     * The form is a theme partial, and a client route in `site/routes.php` may
     * render it outside a page this controller built (#61). It must not need
     * variables only `PageController` sets.
     */
    public function test_the_form_renders_without_the_page_around_it(): void
    {
        // `$errors` is shared by the session middleware, which a client route
        // goes through and a bare render does not. `$current` is the one this
        // partial has to be able to do without.
        $html = view('theme::enquiry', ['errors' => new ViewErrorBag])->render();

        $this->assertStringContainsString('/el/enquiries', $html);
    }

    // ------------------------------------------------------ the owner's email

    /**
     * The visitor writes the message and the owner reads it in their mail
     * client. Markdown in it is the visitor's text, not formatting: rendered,
     * `[Confirm your booking](https://phish.example/login)` becomes a live
     * link in an email the owner trusts because their own site sent it.
     */
    public function test_the_message_is_not_rendered_as_markdown(): void
    {
        config(['site.enquiries_to' => 'owner@example.com']);

        $this->send(['message' => 'Hello [Confirm your booking](https://phish.example/login) thanks'])
            ->assertRedirect();

        Mail::assertSent(EnquiryReceived::class, function (EnquiryReceived $mail)
        {
            $html = $mail->render();

            $this->assertStringNotContainsString('phish.example/login"', $html, 'The message became a live link.');
            $this->assertStringContainsString('Confirm your booking', $html, 'The message must still be readable.');

            return true;
        });
    }

    // ----------------------------------------------------------- the schedule

    /**
     * The retention promise is only kept if the command actually runs, and
     * runs in the timezone the promise was made in.
     */
    public function test_the_prune_is_scheduled_in_the_application_timezone_and_does_not_overlap(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn($event) => str_contains($event->command ?? '', 'enquiries:prune'));

        $this->assertNotNull($event, 'Nothing schedules the retention period.');
        $this->assertSame(config('app.timezone'), $event->timezone, 'The promise would be kept on a different day than it was made.');
        $this->assertTrue($event->withoutOverlapping, 'A slow prune would be started again on top of itself.');
    }

    // -------------------------------------------------------- the admin, again

    /**
     * The inbox holds visitors' names, addresses and phone numbers, so it
     * asks a policy like every other admin endpoint rather than trusting the
     * route group alone (TASKS.md #66, ModulePolicy).
     */
    public function test_the_inbox_asks_a_policy_rather_than_only_the_route_group(): void
    {
        $this->send()->assertRedirect();
        $id = Enquiry::sole()->id;

        Gate::before(fn() => false);

        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/enquiries')->assertForbidden();
        $this->actingAs($user)->deleteJson("/api/enquiries/{$id}")->assertForbidden();

        $this->assertSame(1, Enquiry::count());
    }
}
