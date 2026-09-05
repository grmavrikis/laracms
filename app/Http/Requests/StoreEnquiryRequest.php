<?php

namespace App\Http\Requests;

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
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:180'],
            'phone' => ['nullable', 'string', 'max:40'],
            'message' => ['required', 'string', 'max:4000'],

            // A date in the past is somebody typing the wrong year, not an
            // enquiry - but today is allowed, because "tonight" is a real ask.
            'arrives_on' => ['nullable', 'date', 'after_or_equal:today'],
            'departs_on' => ['nullable', 'date', 'after:arrives_on'],
            'guests' => ['nullable', 'integer', 'min:1', 'max:99'],

            // Without it there is no lawful basis to keep the row, so there is
            // no row. `accepted` covers the shapes a checkbox arrives as.
            'consent' => ['accepted'],

            // The page they were on. Sent by the form rather than read from
            // the referer, which is absent often enough to be useless.
            'source_url' => ['nullable', 'string', 'max:512'],

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
        ];
    }
}
