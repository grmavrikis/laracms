{{--
    The enquiry form (TASKS.md #66), submitted as a JS island since #97.

    Part of the theme, because where a client puts their contact form is a
    design decision. The route, the validation, the limiter and the honeypot
    are core - a theme cannot get those wrong by leaving something out.

    Plain like the rest of this theme: #62 replaces it with the bought one.

    **Nothing here belongs to one visitor**, and that is the whole reason the
    page it sits on can be a file on disk. No CSRF token, no confirmation from
    the session, no error bag, no `old()` - a cached page was rendered before
    any of those existed and is handed to everybody unchanged. `public/forms.js`
    supplies the token and fills the two empty slots below from the endpoint's
    JSON; the visitor's own browser still holds what they typed, because the
    page never reloads.

    It takes `$current` from the page around it when there is one and falls
    back to the default language otherwise, so a client route in
    `site/routes.php` can `@include` it without rebuilding what PageController
    hands its own templates.
--}}
@php($enquiryLanguage = ($current ?? \App\Models\Language::default())?->code)

{{-- @once so several forms on one page load the submitter once. It travels
     with the form rather than sitting in the layout, so a theme that adds a
     form cannot forget to bring the thing that sends it. --}}
@once
    <script src="{{ url('/forms.js') }}" defer></script>
@endonce

<section id="enquiry">
    <h2>{{ __('Ask us') }}</h2>

    <form method="POST"
          action="{{ url('/' . $enquiryLanguage . '/enquiries') }}"
          data-cms-form
          data-cms-form-sending="{{ __('Sending…') }}"
          data-cms-form-error="{{ __('Your message could not be sent. Please try again in a moment.') }}">

        {{-- Filled in by the submitter, from the answer. Empty and hidden
             until then, so a page served from disk carries no claim about
             anybody's submission. --}}
        <p role="status" class="sent" data-cms-form-status hidden></p>
        <ul class="errors" role="alert" data-cms-form-errors hidden></ul>

        {{-- The honeypot. Hidden from people and from screen readers, and left
             out of the tab order - anything that fills it is not a visitor.
             `display:none` rather than an off-screen trick, because some bots
             now check for that. --}}
        <div style="display:none" aria-hidden="true">
            <label>{{ __('Website') }}<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>

        <p>
            <label for="enq-name">{{ __('Name') }} *</label>
            <input id="enq-name" type="text" name="name" required maxlength="120">
        </p>

        <p>
            <label for="enq-email">{{ __('Email') }} *</label>
            <input id="enq-email" type="email" name="email" required maxlength="180">
        </p>

        <p>
            <label for="enq-phone">{{ __('Phone') }}</label>
            <input id="enq-phone" type="tel" name="phone" maxlength="40">
        </p>

        <p>
            <label for="enq-arrives">{{ __('Arrival') }}</label>
            <input id="enq-arrives" type="date" name="arrives_on">

            <label for="enq-departs">{{ __('Departure') }}</label>
            <input id="enq-departs" type="date" name="departs_on">

            <label for="enq-guests">{{ __('Guests') }}</label>
            <input id="enq-guests" type="number" name="guests" min="1" max="99">
        </p>

        <p>
            <label for="enq-message">{{ __('Message') }} *</label>
            <textarea id="enq-message" name="message" required maxlength="4000" rows="5"></textarea>
        </p>

        {{-- The retention period is stated because the form asks for consent,
             and consent to "we keep this indefinitely" is not consent. The
             number is passed in from the model, so the promise and the command
             that enforces it cannot drift apart in any language. --}}
        <p>
            <label>
                <input type="checkbox" name="consent" value="1" required>
                {{ __('I agree to you keeping my details in order to reply. They are deleted after :months months.', ['months' => \App\Models\Enquiry::RETENTION_MONTHS]) }}
            </label>
        </p>

        <input type="hidden" name="source_url" value="{{ url()->current() }}">

        <button type="submit">{{ __('Send') }}</button>
    </form>
</section>
