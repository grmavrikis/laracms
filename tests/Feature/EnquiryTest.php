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
use Illuminate\Support\MessageBag;
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
     * **A page carrying a form is cached**, and #97 reversed §25 to get here.
     *
     * §25 found that a cached page hands every visitor the first one's CSRF
     * token, and answered by not caching such a page. That was right about the
     * cause and wrong about the remedy once #97 measured what a cache hit
     * actually costs: the home page is the page a form sits on and the page
     * that matters most, and "never cached" was the wrong half to keep.
     *
     * What changed is the form, not the rule. Nothing on the page belongs to
     * one visitor any more, so there is nothing for a cache to leak - see the
     * test below, which is the one that has to keep this honest.
     */
    public function test_a_page_with_a_form_is_cached(): void
    {
        $module = $this->aModule();

        $this->get('/el')->assertOk()->assertSee('Rooms', false);

        $this->quietlyRename($module);

        $this->get('/el')->assertOk()->assertDontSee('Renamed', false);
    }

    /**
     * The precondition for the test above, and the one that must never be
     * relaxed: **nothing on the page belongs to one visitor.**
     *
     * All four are checked rather than the token alone. The token is the one
     * whose failure is loud - 419 for everybody but the first visitor - and
     * that is exactly why it is not the dangerous one. A cached confirmation
     * tells a visitor who has typed nothing that their message was sent, and
     * cached errors show them somebody else's mistakes; both answer 200 and
     * look like a working page.
     */
    public function test_the_form_carries_nothing_that_belongs_to_one_visitor(): void
    {
        // The session is put in exactly the state the old template read from,
        // and then the partial is rendered directly.
        //
        // **Directly, not through a page**, and that is not a shortcut: the
        // page is cached now, so a GET after a submission would answer with
        // whatever was rendered before the session had any of this in it - and
        // the test would pass without the template having changed at all. What
        // has to be proved is that the *render* consults none of it.
        session()->flash('enquiry', 'sent');
        session()->flashInput(['name' => 'WHAT THE LAST VISITOR TYPED']);

        $errors = new ViewErrorBag();
        $errors->put('default', new MessageBag(['email' => ['WHAT THE LAST VISITOR GOT WRONG']]));

        $html = view('theme::enquiry', ['errors' => $errors])->render();

        $this->assertStringNotContainsString('_token', $html, 'The form still carries a CSRF token.');
        $this->assertStringNotContainsString('WHAT THE LAST VISITOR TYPED', $html, 'The form still repeats what somebody typed.');
        $this->assertStringNotContainsString('WHAT THE LAST VISITOR GOT WRONG', $html, 'The page still carries an error from the session.');
        $this->assertStringNotContainsString(__('Thank you, we have your message.'), $html, 'The page still carries a confirmation from the session.');
    }

    /**
     * The page says which script drives it and the script is fetched from a
     * fixed path.
     *
     * Fixed rather than built: a cached page is a **file**, and a hashed asset
     * name baked into one is a script that disappears on the next
     * `npm run build` while the page pointing at it survives. The public site
     * has no bundle for the same reason it has no React.
     */
    public function test_the_form_declares_itself_to_the_shared_submitter(): void
    {
        $html = $this->get('/el')->assertOk()->getContent();

        // The bare attribute, not the substring. `data-cms-form-sending` also
        // contains "data-cms-form", so a plain search stayed green with the
        // opt-in removed and the form submitting nothing at all - which a
        // mutation found and a passing suite did not.
        $this->assertMatchesRegularExpression(
            '/<form[^>]*\sdata-cms-form[\s>]/',
            $html,
            'The form does not opt in to the submitter.'
        );

        $this->assertStringContainsString('/forms.js', $html, 'The page does not load the submitter.');
    }

    // ------------------------------------------------ what the island is told

    /**
     * The submitter reads the answer, so the answer is JSON - and it carries
     * the wording, translated by the server. The alternative is a catalogue in
     * JavaScript, which is the thing #96 took out of the panel's bundle.
     */
    public function test_a_submission_is_answered_in_json(): void
    {
        $response = $this->postJson('/el/enquiries', $this->valid())
            ->assertOk()
            ->assertJsonPath('status', 'sent');

        $this->assertNotEmpty($response->json('message'), 'The answer carries no wording for the visitor.');
        $this->assertSame(1, Enquiry::count());
    }

    /**
     * The wording follows the address, like everything else public (#96).
     */
    public function test_the_answer_is_in_the_language_of_the_page(): void
    {
        $greek = $this->postJson('/el/enquiries', $this->valid())->json('message');
        $english = $this->postJson('/en/enquiries', $this->valid())->json('message');

        $this->assertNotSame($greek, $english, 'The confirmation is the same text in both languages.');
    }

    public function test_a_refused_submission_answers_the_errors_as_json(): void
    {
        $this->postJson('/el/enquiries', $this->valid(['email' => 'not-an-email']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->assertSame(0, Enquiry::count());
    }

    /**
     * The honeypot answers a bot exactly what it answers a person, in this
     * shape too - the reasoning in `store()` is about what the sender learns,
     * not about which format they asked for.
     */
    public function test_a_filled_honeypot_looks_like_success_in_json_too(): void
    {
        $this->postJson('/el/enquiries', $this->valid(['website' => 'http://spam.example']))
            ->assertOk()
            ->assertJsonPath('status', 'sent');

        $this->assertSame(0, Enquiry::count());
    }

    /**
     * A form posted the old way still works, and this is not a leftover: a
     * client route in `site/routes.php` may render its own Blade form with
     * `@csrf` (#61). Such a page carries a token, so `PageCache` refuses to
     * store it - the guard stays for exactly this.
     */
    public function test_a_plain_form_post_is_still_answered_with_a_redirect(): void
    {
        $this->from('/el')->send()
            ->assertRedirect('/el')
            // The flash has exactly one consumer left - a client's own Blade
            // form - because the shipped theme no longer reads it. Without
            // this assertion, dropping `->with(...)` from `sent()` is green
            // here and silently costs that page its confirmation.
            ->assertSessionHas('enquiry', 'sent');

        $this->assertSame(1, Enquiry::count());
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
