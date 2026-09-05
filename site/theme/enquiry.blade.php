{{--
    The enquiry form (TASKS.md #66).

    Part of the theme, because where a client puts their contact form is a
    design decision. The route, the validation, the limiter and the honeypot
    are core - a theme cannot get those wrong by leaving something out.

    Plain like the rest of this theme: #62 replaces it with the bought one.

    It takes `$current` from the page around it when there is one and falls
    back to the default language otherwise, so a client route in
    `site/routes.php` can `@include` it without rebuilding what PageController
    hands its own templates.
--}}
@php($enquiryLanguage = ($current ?? \App\Models\Language::default())?->code)

<section id="enquiry">
    <h2>Ρωτήστε μας / Ask us</h2>

    @if (session('enquiry') === 'sent')
        <p role="status" class="sent">
            Ευχαριστούμε — το μήνυμά σας στάλθηκε. Thank you, we have your message.
        </p>
    @endif

    @if ($errors->any())
        <ul class="errors" role="alert">
            @foreach ($errors->all() as $message)
                <li>{{ $message }}</li>
            @endforeach
        </ul>
    @endif

    <form method="POST" action="{{ url('/' . $enquiryLanguage . '/enquiries') }}">
        @csrf

        {{-- The honeypot. Hidden from people and from screen readers, and left
             out of the tab order - anything that fills it is not a visitor.
             `display:none` rather than an off-screen trick, because some bots
             now check for that. --}}
        <div style="display:none" aria-hidden="true">
            <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>

        <p>
            <label for="enq-name">Όνομα / Name *</label>
            <input id="enq-name" type="text" name="name" required maxlength="120" value="{{ old('name') }}">
        </p>

        <p>
            <label for="enq-email">Email *</label>
            <input id="enq-email" type="email" name="email" required maxlength="180" value="{{ old('email') }}">
        </p>

        <p>
            <label for="enq-phone">Τηλέφωνο / Phone</label>
            <input id="enq-phone" type="tel" name="phone" maxlength="40" value="{{ old('phone') }}">
        </p>

        <p>
            <label for="enq-arrives">Άφιξη / Arrival</label>
            <input id="enq-arrives" type="date" name="arrives_on" value="{{ old('arrives_on') }}">

            <label for="enq-departs">Αναχώρηση / Departure</label>
            <input id="enq-departs" type="date" name="departs_on" value="{{ old('departs_on') }}">

            <label for="enq-guests">Άτομα / Guests</label>
            <input id="enq-guests" type="number" name="guests" min="1" max="99" value="{{ old('guests') }}">
        </p>

        <p>
            <label for="enq-message">Μήνυμα / Message *</label>
            <textarea id="enq-message" name="message" required maxlength="4000" rows="5">{{ old('message') }}</textarea>
        </p>

        {{-- The retention period is stated because the form asks for consent,
             and consent to "we keep this indefinitely" is not consent. The
             number comes from the model, so the promise and the command that
             enforces it cannot drift apart. --}}
        <p>
            <label>
                <input type="checkbox" name="consent" value="1" required @checked(old('consent'))>
                Συμφωνώ να κρατήσετε τα στοιχεία μου για να μου απαντήσετε.
                Διαγράφονται μετά από {{ \App\Models\Enquiry::RETENTION_MONTHS }} μήνες.
                <span lang="en">I agree to you keeping my details in order to reply.
                They are deleted after {{ \App\Models\Enquiry::RETENTION_MONTHS }} months.</span>
            </label>
        </p>

        <input type="hidden" name="source_url" value="{{ url()->current() }}">

        <button type="submit">Αποστολή / Send</button>
    </form>
</section>
