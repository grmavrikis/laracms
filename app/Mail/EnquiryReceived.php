<?php

namespace App\Mail;

use App\Models\Enquiry;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Tells the owner something arrived. **Not** the record of it - that is the
 * row, which is already written before this is built (TASKS.md #66).
 *
 * The visitor's address goes in `replyTo` rather than `from`: sending as them
 * fails SPF at most providers and lands the whole thing in spam, which is the
 * problem storing enquiries was meant to solve.
 */
class EnquiryReceived extends Mailable
{
    public function __construct(public readonly Enquiry $enquiry)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Enquiry from ' . $this->enquiry->name,
            replyTo: [$this->enquiry->email],
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.enquiry-received');
    }
}
