<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Something a visitor sent, kept because email loses things.
 *
 * An accommodation owner who loses an enquiry loses a booking and blames the
 * website, which is why this is stored before anybody is notified and why
 * nothing downstream can cost the row (TASKS.md #66).
 *
 * There is no `update`: an enquiry is a record of what was sent. The only
 * things that remove one are the owner deleting it and the retention period.
 */
class Enquiry extends Model
{
    /**
     * How long an enquiry is kept, stated on the form and enforced by
     * `enquiries:prune`. Two seasons, so last summer's returning visitor is
     * still on file when they write again.
     */
    public const RETENTION_MONTHS = 24;

    /**
     * Submissions allowed from one address in an hour.
     *
     * Far below the `api` limiter, because this endpoint is open to the
     * internet and a visitor with a genuine question sends one.
     */
    public const PER_HOUR = 5;

    protected $fillable = [
        'name', 'email', 'phone', 'message',
        'arrives_on', 'departs_on', 'guests',
        'language_code', 'source_url', 'consented_at',
    ];

    protected $casts = [
        'arrives_on' => 'date',
        'departs_on' => 'date',
        'consented_at' => 'datetime',
        'guests' => 'integer',
    ];

    /** Newest first: the admin is an inbox, and the newest is the one to answer. */
    public function scopeNewestFirst(Builder $query): Builder
    {
        return $query->orderByDesc('created_at')->orderByDesc('id');
    }

    /** Past the retention period the form promises. */
    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('created_at', '<', now()->subMonths(self::RETENTION_MONTHS));
    }
}
