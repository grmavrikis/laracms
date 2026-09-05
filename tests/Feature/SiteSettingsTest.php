<?php

namespace Tests\Feature;

use App\Mail\EnquiryReceived;
use App\Models\Language;
use App\Models\Setting;
use App\Models\User;
use App\Services\SiteSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The values a client changes about their own site (TASKS.md #67).
 *
 * The point is not the fields. It is that **the owner can change their phone
 * number without calling you**: BUSINESS.md puts the ceiling of the whole
 * business at support minutes per client, and a value that lives in a template
 * is a phone call on a Sunday.
 *
 * **A table rather than the singleton Module the item first described.** A
 * singleton is the client's *content* - they create it, name it, and could
 * rename or empty it. Two of these values are not theirs to lose: an enquiry
 * can arrive on the first day of a fresh install, before any module exists,
 * and the panel has to resolve a language before anyone has signed in. Core
 * cannot read either out of a row the client owns.
 *
 * What is reused instead is the part worth reusing: the fields are declared in
 * the **same shape a Module schema uses**, so `SchemaRuleBuilder` validates
 * them - two-level translatable rules included - rather than a second set of
 * rules growing up beside the first.
 */
class SiteSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Language::create(['name' => 'Greek', 'code' => 'el', 'is_default' => true]);
        Language::create(['name' => 'English', 'code' => 'en']);

        Mail::fake();
    }

    private function owner(): User
    {
        return User::factory()->create();
    }

    // ------------------------------------------------------------- the shape

    /**
     * The panel builds its form from what the server declares, so a field
     * added here needs no second edit in JavaScript - the same reason
     * `fieldTypes.json` is generated.
     */
    public function test_the_panel_is_told_which_settings_exist(): void
    {
        $body = $this->actingAs($this->owner())->getJson('/api/settings')->assertOk()->json();

        $names = array_column($body['schema'], 'name');

        $this->assertContains('enquiries_to', $names);
        $this->assertContains('phone', $names);
        $this->assertContains('address', $names);
        $this->assertArrayHasKey('data', $body);
    }

    /**
     * The one field whose options cannot be written down: they are the files
     * in `lang/`, so the list is built when it is asked for (#96).
     */
    public function test_the_panel_language_offers_the_locales_that_exist(): void
    {
        $schema = collect($this->actingAs($this->owner())->getJson('/api/settings')->json('schema'));

        $field = $schema->firstWhere('name', 'panel_locale');

        $this->assertSame('select', $field['type']);
        $this->assertContains('el', $field['options']);
    }

    // -------------------------------------------------------------- writing

    public function test_the_owner_changes_what_the_site_says_about_itself(): void
    {
        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => [
                'phone' => '+30 26610 12345',
                'address' => ['el' => 'Λεωφόρος Δημοκρατίας 12', 'en' => '12 Dimokratias Avenue'],
            ],
        ])->assertOk();

        $settings = app(SiteSettings::class);

        $this->assertSame('+30 26610 12345', $settings->get('phone'));
        $this->assertSame('Λεωφόρος Δημοκρατίας 12', $settings->for('el')['address']);
        $this->assertSame('12 Dimokratias Avenue', $settings->for('en')['address']);
    }

    /**
     * The same rules an entry gets, from the same builder - which is the whole
     * reason the fields are declared in a Module schema's shape.
     */
    public function test_a_setting_is_validated_the_way_a_field_is(): void
    {
        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['enquiries_to' => 'not-an-email'],
        ])->assertStatus(422)->assertJsonValidationErrors('data.enquiries_to');
    }

    /**
     * The complaint names the field the way the screen does. Without it the
     * owner reads "The data.facebook url field must be a valid URL" - the
     * request key, spelled out, under a box labelled "Facebook page".
     */
    public function test_a_refusal_names_the_field_the_owner_sees(): void
    {
        $message = $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['facebook_url' => 'not a url'],
        ])->assertStatus(422)->json('errors')['data.facebook_url'][0];

        $this->assertStringContainsString('Facebook page', $message);
        $this->assertStringNotContainsString('data.', $message);
    }

    public function test_a_setting_nobody_declared_is_refused(): void
    {
        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['admin_password' => 'nice try'],
        ])->assertStatus(422);

        $this->assertNull(app(SiteSettings::class)->get('admin_password'));
    }

    public function test_reading_and_writing_both_need_a_session(): void
    {
        $this->getJson('/api/settings')->assertUnauthorized();
        $this->putJson('/api/settings', ['data' => []])->assertUnauthorized();
    }

    /**
     * There is one row, however many times it is written.
     */
    public function test_saving_twice_does_not_make_a_second_site(): void
    {
        $user = $this->owner();

        $this->actingAs($user)->putJson('/api/settings', ['data' => ['phone' => '1']])->assertOk();
        $this->actingAs($user)->putJson('/api/settings', ['data' => ['phone' => '2']])->assertOk();

        $this->assertSame(1, Setting::count());
        $this->assertSame('2', app(SiteSettings::class)->get('phone'));
    }

    // -------------------------------------------------- what core reads back

    /**
     * The value `config/site.php` held until now. The config stays as the
     * default for an installation nobody has configured yet, so a fresh copy
     * still works and `.env` still means something - but once the owner has
     * saved, the database is the answer.
     */
    public function test_the_enquiry_notification_follows_the_setting(): void
    {
        config(['site.enquiries_to' => 'from-the-env@example.com']);

        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['enquiries_to' => 'owner@example.com'],
        ])->assertOk();

        $this->post('/el/enquiries', [
            'name' => 'Μαρία',
            'email' => 'maria@example.com',
            'message' => 'Έχετε δωμάτιο;',
            'consent' => '1',
        ])->assertRedirect();

        Mail::assertSent(EnquiryReceived::class, fn(EnquiryReceived $mail) => $mail->hasTo('owner@example.com'));
    }

    public function test_an_installation_nobody_has_configured_still_uses_the_env(): void
    {
        config(['site.enquiries_to' => 'from-the-env@example.com']);

        $this->post('/el/enquiries', [
            'name' => 'Μαρία',
            'email' => 'maria@example.com',
            'message' => 'Έχετε δωμάτιο;',
            'consent' => '1',
        ])->assertRedirect();

        Mail::assertSent(EnquiryReceived::class, fn(EnquiryReceived $mail) => $mail->hasTo('from-the-env@example.com'));
    }

    /**
     * The panel's default language, which #96 read from `config('site.locale')`
     * and which the owner can now set themselves.
     */
    public function test_the_panel_opens_in_the_language_the_owner_chose(): void
    {
        config(['site.locale' => 'en']);

        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['panel_locale' => 'el'],
        ])->assertOk();

        $this->get('/admin')->assertOk()->assertSee('lang="el"', false);
    }

    /**
     * The same argument that chose a table over a singleton Module, one step
     * earlier: core has to keep working before anybody has configured
     * anything, which includes before anybody has *migrated* anything.
     * `InterfaceLocales` asks for a setting on every API request and on the
     * login screen, so an unmigrated copy would show a stack trace where the
     * sign-in form goes.
     */
    public function test_the_panel_still_opens_before_the_table_exists(): void
    {
        Schema::drop('settings');

        $this->get('/admin')->assertOk();
        $this->assertNull(app(SiteSettings::class)->get('phone'));
    }

    // ---------------------------------------------------------- the theme

    /**
     * Every public template gets them, resolved to the language being
     * rendered - so a footer can say the address in Greek on a Greek page
     * without the theme knowing anything about how settings are stored.
     */
    public function test_the_public_templates_are_given_the_settings(): void
    {
        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['address' => ['el' => 'Κέρκυρα', 'en' => 'Corfu']],
        ])->assertOk();

        // Followed to the page rather than read out of the service: a value
        // the theme cannot reach is not a setting, it is a row.
        $this->get('/el')->assertOk()->assertSee('Κέρκυρα', false)->assertDontSee('Corfu', false);
        $this->get('/en')->assertOk()->assertSee('Corfu', false)->assertDontSee('Κέρκυρα', false);
    }

    /**
     * Saving settings changes what a page says, so the cache cannot outlive
     * them - the same rule publishing an entry follows (#59).
     */
    public function test_saving_settings_drops_the_page_cache(): void
    {
        $this->get('/el')->assertOk();

        $before = app(\App\Services\PageCache::class)->version();

        $this->actingAs($this->owner())->putJson('/api/settings', [
            'data' => ['phone' => '+30 26610 99999'],
        ])->assertOk();

        $this->assertGreaterThan($before, app(\App\Services\PageCache::class)->version());
    }
}
