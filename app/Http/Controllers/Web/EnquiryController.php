<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnquiryRequest;
use App\Mail\EnquiryReceived;
use App\Models\Enquiry;
use App\Models\Language;
use App\Services\InterfaceLocales;
use App\Services\SiteSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The public side of #66: the one route an anonymous visitor may POST to.
 *
 * The order of what happens here is the whole design. **The enquiry is stored
 * first**, and everything after it is a courtesy that cannot cost the row -
 * an owner who loses an enquiry loses a booking and blames the website.
 *
 * **It answers in two shapes** (#97). The shipped theme's form is a JS island
 * and reads JSON; a client route in `site/routes.php` may render a plain Blade
 * form with `@csrf`, and that one still gets its redirect and its flash. The
 * second is not a leftover - such a page carries a token, so `PageCache`
 * refuses to store it, which is exactly the case the guard exists for.
 */
class EnquiryController extends Controller
{
    public function store(StoreEnquiryRequest $request, string $language)
    {
        $current = Language::where('is_active', true)->where('code', $language)->first();

        if ($current === null)
        {
            throw new NotFoundHttpException();
        }

        // The honeypot, checked before anything is written and answered
        // exactly as a real submission is. Telling a bot it was caught is how
        // it learns to leave the field alone; a silent success costs it the
        // feedback and costs us nothing.
        if (filled($request->input('website')))
        {
            return $this->sent($request);
        }

        $enquiry = Enquiry::create([
            ...$request->safe()->only([
                'name', 'email', 'phone', 'message',
                'arrives_on', 'departs_on', 'guests', 'source_url',
            ]),
            // From the address, not the payload: it is the language they were
            // reading, and the owner replies in it.
            'language_code' => $current->code,
            // The moment, not a flag. A boolean could be flipped afterwards;
            // a timestamp is a record of when consent was actually given.
            'consented_at' => now(),
        ]);

        $this->notify($enquiry);

        return $this->sent($request);
    }

    /**
     * One confirmation, in whichever shape the sender can read.
     *
     * The wording is translated here rather than in JavaScript: the answer is
     * already being built by the server, in the language the `locale`
     * middleware resolved from the address, and a catalogue in the island
     * would ship every language to every visitor to say one sentence.
     */
    private function sent(Request $request)
    {
        if ($request->expectsJson())
        {
            return response()->json([
                'status' => 'sent',
                'message' => __('Thank you, we have your message.'),
            ]);
        }

        return back()->with('enquiry', 'sent');
    }

    /**
     * Tell the owner, if anybody has said where and the mailer is willing.
     *
     * The address comes from the settings screen since #67, with
     * `config('site.enquiries_to')` as the default for an installation nobody
     * has configured yet - so a fresh copy still works on its first day.
     *
     * Wrapped, and deliberately so: the row is already committed, and a mail
     * server that is down must not turn a stored enquiry into a 500 the
     * visitor reads as "it did not go through" - they would send it again, or
     * give up. The failure goes to the log, where it is somebody's problem
     * later rather than the visitor's now.
     */
    private function notify(Enquiry $enquiry): void
    {
        $to = app(SiteSettings::class)->get('enquiries_to');

        if (blank($to))
        {
            return;
        }

        try
        {
            // **The owner's language, not the visitor's** (TASKS.md #100).
            // This is built inside the visitor's request, where `SetLocale`
            // has already set the application to the language of the page they
            // were reading - so the moment this template is translated, a
            // French enquiry would arrive at a Greek owner in French, and it
            // would read as a mail defect rather than a locale one.
            //
            // `resolve(null)` is the installation's own locale: the settings
            // screen's `panel_locale`, falling back the way the panel does.
            // There is no user in a public request to ask.
            Mail::to($to)
                ->locale(app(InterfaceLocales::class)->resolve(null))
                ->send(new EnquiryReceived($enquiry));
        }
        catch (\Throwable $e)
        {
            Log::error('Could not notify the owner of enquiry ' . $enquiry->id . ': ' . $e->getMessage());
        }
    }
}
