<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnquiryRequest;
use App\Mail\EnquiryReceived;
use App\Models\Enquiry;
use App\Models\Language;
use App\Services\SiteSettings;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The public side of #66: the one route an anonymous visitor may POST to.
 *
 * The order of what happens here is the whole design. **The enquiry is stored
 * first**, and everything after it is a courtesy that cannot cost the row -
 * an owner who loses an enquiry loses a booking and blames the website.
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
            return back()->with('enquiry', 'sent');
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
            Mail::to($to)->send(new EnquiryReceived($enquiry));
        }
        catch (\Throwable $e)
        {
            Log::error('Could not notify the owner of enquiry ' . $enquiry->id . ': ' . $e->getMessage());
        }
    }
}
