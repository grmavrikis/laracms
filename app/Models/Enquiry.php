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

    /**
     * How many an inbox shows at once. An enquiry is read and answered, so
     * the page is a queue rather than a table somebody rearranges.
     */
    public const PER_PAGE = 20;

    /*
     * **The width of each column, and the rule that fills it** (TASKS.md #98).
     *
     * One number each, read by the migration, by `StoreEnquiryRequest` and by
     * the theme's `maxlength`. They were three separate literals, and `phone`
     * and `source_url` happened to sit exactly at the column limit - so
     * relaxing a rule without a migration answered MySQL 1406, which is a 500
     * on the one form open to strangers (#76, one table over).
     *
     * `ColumnWidthTest` pins all three readers. What it cannot pin is a column
     * that already exists, because editing a constant does not alter one -
     * that is what a migration is for.
     */
    public const NAME_MAX_LENGTH = 120;

    public const EMAIL_MAX_LENGTH = 180;

    public const PHONE_MAX_LENGTH = 40;

    /**
     * **Wide enough for the addresses this application itself generates.**
     *
     * The form fills this with `url()->current()`, so the value is a scheme, a
     * host and `/{language}/{module}/{slug}` - and the two slug columns are 255
     * each. At 512 a site with long slugs refused *every* enquiry from such a
     * page, with a message naming a hidden field the visitor cannot see or fix.
     * 2048 is the conventional practical ceiling for a URL and leaves the sum
     * far behind.
     */
    public const SOURCE_URL_MAX_LENGTH = 2048;

    /**
     * **A rule rather than a width.** The column is `text`, which holds far
     * more; this is how much anybody may type, and the form stops there too.
     */
    public const MESSAGE_MAX_LENGTH = 4000;

    /** Likewise: the column is a small integer, this is what an enquiry means. */
    public const GUESTS_MAX = 99;

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
