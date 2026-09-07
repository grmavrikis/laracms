<?php

namespace App\Http\Requests;

use App\Models\Enquiry;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The only validation in this application that runs for somebody who is not
 * signed in (TASKS.md #66).
 *
 * Two things follow from that. Every field is bounded, because an unbounded
 * `text` from the open internet is somebody's afternoon. And the rules are
 * deliberately forgiving about the *booking* - dates and guest count are
 * optional, since "do you have anything in July" is exactly the enquiry worth
 * having and refusing it to tidy the data would throw away the lead.
 */
class StoreEnquiryRequest extends FormRequest
{
    /**
     * Anyone. This is the public endpoint, and the guard is the limiter, the
     * honeypot and the rules below rather than a session.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:' . Enquiry::NAME_MAX_LENGTH],
            'email' => ['required', 'string', 'email', 'max:' . Enquiry::EMAIL_MAX_LENGTH],
            'phone' => ['nullable', 'string', 'max:' . Enquiry::PHONE_MAX_LENGTH],
            'message' => ['required', 'string', 'max:' . Enquiry::MESSAGE_MAX_LENGTH],

            // A date in the past is somebody typing the wrong year, not an
            // enquiry - but today is allowed, because "tonight" is a real ask.
            //
            // **`bail`, so a date answers one complaint at a time.** Laravel
            // runs every rule on a field, and `after_or_equal` fails for a
            // value that is not a date at all - so `15/07/2027`, which is how
            // Greek writes a date, was told both that it is not a date and
            // that it is in the past. The second is false and sends somebody
            // looking for a problem that is not there.
            'arrives_on' => ['nullable', 'bail', 'date', 'after_or_equal:today'],
            'departs_on' => ['nullable', 'bail', 'date', 'after:arrives_on'],
            'guests' => ['nullable', 'integer', 'min:1', 'max:' . Enquiry::GUESTS_MAX],

            // Without it there is no lawful basis to keep the row, so there is
            // no row. `accepted` covers the shapes a checkbox arrives as.
            'consent' => ['accepted'],

            // The page they were on. Sent by the form rather than read from
            // the referer, which is absent often enough to be useless.
            'source_url' => ['nullable', 'string', 'max:' . Enquiry::SOURCE_URL_MAX_LENGTH],

            // The honeypot is deliberately **not** validated here. A rule
            // would answer a bot with an error naming a field no human can
            // see, which is how a bot learns to stop filling it - and would
            // show a real visitor with an over-eager autofill an error they
            // could not act on. EnquiryController checks it and answers as
            // though the submission had succeeded.
        ];
    }

    /**
     * The only core text an anonymous visitor ever reads, so it is translated
     * into the language of the address they wrote from (TASKS.md #96). The
     * `locale` middleware on the route has already set it.
     */
    public function messages(): array
    {
        return [
            'consent.accepted' => __('Please agree to us keeping your details so we can reply.'),
            'departs_on.after' => __('The departure date has to come after the arrival date.'),

            // The framework's line for this interpolates `:date` with the
            // rule's own parameter, so a Greek reader got *«…μεταγενέστερη της
            // today»* - the sentence translated and the last word not (#99).
            // A written-out message is what the rule beside it already does,
            // and it is better English too.
            'arrives_on.after_or_equal' => __('The arrival date cannot be in the past.'),
        ];
    }

    /**
     * What each field is called inside a refusal (TASKS.md #99).
     *
     * Every framework message interpolates `:attribute`, which is the request
     * key unless something says otherwise - so a translated `validation.php`
     * alone produces *«Το πεδίο arrives_on είναι υποχρεωτικό»*, a Greek
     * sentence closing around an English column name.
     *
     * **Here rather than in each locale's `attributes` array**, which is the
     * other place Laravel would take them from: one declaration then serves
     * every language, including one a client's site has and core has no file
     * for. It is also what `SettingController` already does with the settings
     * screen's own labels (#67).
     *
     * **The keys are core's own, not the theme's.** `Name`, `Email`, `Arrival`
     * and the rest belong to `site/lang/`, and `TranslationTest` fails if both
     * sides translate one key - core reading a string the client owns is the
     * boundary #61 draws, and a second theme need not define it at all. So the
     * words are core's, and a client whose form says *Όνομα* gets a refusal
     * that says *Ονοματεπώνυμο*: two words for one field, which is the price of
     * the line being in the right place.
     *
     * **And they are this form's alone**, which is the same argument one level
     * in. `Email address` is the login screen's label and `Telephone` is the
     * settings screen's word for the number printed on the site; borrowing
     * either meant that clarifying a label on one screen silently reworded a
     * refusal on another, with nothing linking them and no test to notice.
     * Nothing else may use the keys below.
     */
    public function attributes(): array
    {
        return [
            'name' => __('Full name'),
            'email' => __('Contact email'),
            'phone' => __('Contact telephone'),
            'message' => __('Enquiry message'),
            'arrives_on' => __('Arrival date'),
            'departs_on' => __('Departure date'),
            'guests' => __('Number of guests'),

            // No `consent`: its only rule is `accepted`, and the message above
            // is written out rather than interpolating `:attribute`, so a label
            // for it could never be printed.

            // Hidden, and only ever refused for length - but a message naming
            // `source_url` would be the one thing on the page a visitor could
            // not place.
            'source_url' => __('Page address'),
        ];
    }
}
