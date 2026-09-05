<x-mail::message>
# {{ $enquiry->name }} sent you an enquiry

**Email:** {{ $enquiry->email }}
@if ($enquiry->phone)
**Phone:** {{ $enquiry->phone }}
@endif
@if ($enquiry->arrives_on)
**Dates:** {{ $enquiry->arrives_on->toDateString() }} → {{ $enquiry->departs_on?->toDateString() ?? '—' }}
@endif
@if ($enquiry->guests)
**Guests:** {{ $enquiry->guests }}
@endif

{{ $enquiry->message }}

@if ($enquiry->source_url)
Sent from {{ $enquiry->source_url }} ({{ strtoupper($enquiry->language_code) }}).
@endif

Reply to this email and it goes straight to them.
</x-mail::message>
