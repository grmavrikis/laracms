<?php

namespace Tests\Feature;

use App\Mail\EnquiryReceived;
use App\Models\Enquiry;
use App\Services\SiteSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * **Who each piece of text is for** (TASKS.md #100, #104, #107).
 *
 * `SetLocale` sets the application's language from the address, and two things
 * were reaching a reader outside the window where that is true:
 *
 * - a **rate-limited** visitor, because the limiter ran before the middleware
 *   that decides what language to refuse them in (#107);
 * - the **owner's** notification, which is built inside the visitor's request
 *   and so inherits the visitor's language rather than the owner's (#100).
 *
 * They are opposite rules meeting in one request. The refusal belongs to the
 * person reading the page, so it has to be built after the language of that
 * page is known; the notification belongs to somebody who is not in the request
 * at all, so it has to be built out from under it.
 *
 * The third of these, a route a **client** wrote getting no locale (#104),
 * lives in `CoreSiteBoundaryTest`: proving it needs the application rebuilt
 * around a temporary routes file, and rebuilding it here would take the
 * database with it.
 */
class PublicLocaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->languages('el', 'en');
    }

    private function enquiry(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Μαρία',
            'email' => 'maria@example.com',
            'message' => 'Καλησπέρα σας.',
            'consent' => '1',
        ], $overrides);
    }

    // ------------------------------------------------------------- #107

    /**
     * **The refusal is in the language of the page they wrote from.**
     *
     * The limiter was declared before `locale`, so a 429 was built while the
     * application was still in its default language - and the message it
     * carries is the last thing a visitor reads before giving up.
     */
    public function test_a_rate_limited_visitor_is_refused_in_their_own_language(): void
    {
        $response = $this->postUntilRefused('/el');

        $response->assertStatus(429);

        $this->assertMatchesRegularExpression(
            '/\p{Greek}/u',
            (string) $response->json('message'),
            'A Greek visitor is turned away in English: ' . $response->json('message')
        );
    }

    /** And an English visitor is not turned away in Greek. */
    public function test_an_english_visitor_is_refused_in_english(): void
    {
        $response = $this->postUntilRefused('/en');

        $response->assertStatus(429);

        $this->assertDoesNotMatchRegularExpression('/\p{Greek}/u', (string) $response->json('message'));
    }

    /**
     * Post until the limiter answers, **with the locale put back between
     * requests**.
     *
     * `App::setLocale()` is a write that outlives the request that made it, and
     * the test client reuses one application - so the fifth submission left the
     * language set for the sixth, and the refusal came out in Greek even with
     * the middleware in the order that could not have produced it. Production
     * gets a fresh process per request; this is what says so.
     */
    private function postUntilRefused(string $language): \Illuminate\Testing\TestResponse
    {
        $default = config('app.locale');

        $response = null;

        for ($i = 0; $i <= Enquiry::PER_HOUR; $i++)
        {
            app()->setLocale($default);

            $response = $this->postJson($language . '/enquiries', $this->enquiry());
        }

        return $response;
    }

    // ------------------------------------------------------------- #100

    /**
     * **The owner's notification is the owner's.**
     *
     * It is built inside the visitor's request, where `SetLocale` has already
     * set the application to the language of the page they were reading - so
     * the moment that template is translated, a French visitor's enquiry would
     * produce a French email to a Greek owner. It would read as a mail defect
     * rather than a locale one, because nothing at the call site says the
     * language belongs to somebody who is not in the request.
     */
    public function test_the_owner_is_notified_in_the_owner_s_language(): void
    {
        Mail::fake();

        app(SiteSettings::class)->save([
            'enquiries_to' => 'owner@example.com',
            'panel_locale' => 'el',
        ]);

        $this->postJson('/en/enquiries', $this->enquiry())->assertOk();

        Mail::assertSent(EnquiryReceived::class, function (EnquiryReceived $mail)
        {
            return $mail->locale === 'el';
        });
    }
}
