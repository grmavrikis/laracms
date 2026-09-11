import { useState, useEffect } from 'react';
import { Inbox, ArrowLeft, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { paginationFrom, rowsFrom, isPastLastPage } from '../lib/pagination';
import { formatDate, formatDateTime } from '../lib/format';
import { t } from '../lib/i18n';
import fieldTypes from '../lib/fieldTypes.json';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import PageHeader from '../ui/PageHeader';
import Pagination from '../ui/Pagination';

/**
 * The owner's enquiry inbox (TASKS.md #66).
 *
 * Read and delete, and nothing else. An enquiry is a record of what somebody
 * sent, not a document to revise, so there is no edit here and no route behind
 * one either.
 *
 * Deletion is permanent and asks first: a "deleted" enquiry still sitting in
 * the table is hard to explain to anybody asking what happened to their data,
 * and the confirmation is what catches the wrong click.
 *
 * **Dates go through `lib/format`** (#117 item 17). This screen called
 * `toLocaleString()` with no argument, which formats in the *browser's* locale
 * rather than the panel's - so a Greek panel on an English machine printed
 * `9/3/2026` for the third of September, which reads as the ninth of March.
 * That helper was written in item 13 after the identical defect in `EntryForm`;
 * this file kept its own two one-liners and never received the fix.
 */
export default function EnquiriesManager({ onBack }) {
    const [enquiries, setEnquiries] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);
    const [confirming, setConfirming] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        setLoading(true);
        setErrors([]);

        api.get('/enquiries', { params: { page } })
            .then(({ data }) => {
                const meta = paginationFrom(data);

                if (isPastLastPage(meta)) {
                    setPage(meta.lastPage);
                    return;
                }

                setEnquiries(rowsFrom(data));
                setPagination(meta);
            })
            .catch((err) => {
                console.error(err);
                setErrors(errorSummary(err, t('Could not load the enquiries.')));
            })
            .finally(() => setLoading(false));
    }, [page, refreshKey]);

    const handleDelete = async (enquiry) => {
        setDeleting(true);
        setErrors([]);

        try {
            await api.delete(`/enquiries/${enquiry.id}`);
            setConfirming(null);
            setRefreshKey((n) => n + 1);
        } catch (err) {
            console.error(err);
            setErrors(errorSummary(err, t('Could not delete that enquiry.')));
        } finally {
            setDeleting(false);
        }
    };

    /** A date a reader and a machine can both read. */
    const On = ({ value, withTime = false }) => (
        <time dateTime={value}>{withTime ? formatDateTime(value) : formatDate(value)}</time>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Inbox}
                title={t('Enquiries')}
                description={t(':total received. Kept for :months months, then deleted.', {
                    total: pagination?.total ?? enquiries.length,
                    months: fieldTypes.enquiryRetentionMonths,
                })}
                actions={onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        {t('Back to modules')}
                    </button>
                )}
            />

            <Alert messages={errors} />

            {loading ? (
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading enquiries…')}</p>
            ) : enquiries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted py-16 text-center">
                    <Inbox className="mx-auto h-8 w-8 text-fg-subtle" aria-hidden="true" />
                    <h2 className="mt-3 text-sm font-semibold text-fg">{t('No enquiries yet')}</h2>
                    <p className="mt-1 text-sm text-fg-muted">
                        {t('They arrive here the moment somebody sends the form on the site.')}
                    </p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {enquiries.map((enquiry) => (
                        <li key={enquiry.id}>
                            {/* Its own landmark, named by whoever sent it: an
                                enquiry is a self-contained thing to read, and a
                                reader should be able to move *between* them
                                rather than through every line of each. */}
                            <article
                                aria-label={enquiry.name}
                                className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="font-semibold text-fg">{enquiry.name}</span>
                                        {' '}
                                        <a href={`mailto:${enquiry.email}`} className="text-accent-text hover:underline">
                                            {enquiry.email}
                                        </a>
                                        {enquiry.phone && <span className="text-fg-muted"> · {enquiry.phone}</span>}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2 text-xs text-fg-muted">
                                        <On value={enquiry.created_at} withTime />
                                        <Badge tone="neutral">{enquiry.language_code}</Badge>
                                    </div>
                                </div>

                                {(enquiry.arrives_on || enquiry.guests) && (
                                    <p className="mt-1 text-sm text-fg">
                                        {enquiry.arrives_on && (
                                            <>
                                                <On value={enquiry.arrives_on} />
                                                {' → '}
                                                {enquiry.departs_on ? <On value={enquiry.departs_on} /> : '—'}
                                            </>
                                        )}
                                        {enquiry.guests ? ` · ${t(':count guests', { count: enquiry.guests })}` : ''}
                                    </p>
                                )}

                                <p className="mt-2 whitespace-pre-line text-sm text-fg">{enquiry.message}</p>

                                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                                    <span className="truncate text-xs text-fg-muted">{enquiry.source_url}</span>

                                    {confirming === enquiry.id ? (
                                        <span className="flex shrink-0 items-center gap-2 text-sm">
                                            <span className="text-fg">{t('Delete permanently?')}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(enquiry)}
                                                disabled={deleting}
                                                className="cursor-pointer rounded-md bg-danger px-3 py-1 font-semibold text-danger-fg transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {t('Delete')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirming(null)}
                                                className="cursor-pointer rounded-md px-2 py-1 text-fg-muted transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                            >
                                                {t('Cancel')}
                                            </button>
                                        </span>
                                    ) : (
                                        // One word on screen, the whole phrase
                                        // in the accessibility tree: a column
                                        // of identical `Delete` buttons says
                                        // nothing about which row it belongs
                                        // to, and spelling the sender out in
                                        // the row would be a sentence where a
                                        // verb belongs.
                                        <button
                                            type="button"
                                            onClick={() => setConfirming(enquiry.id)}
                                            aria-label={t('Delete the enquiry from :name', { name: enquiry.name })}
                                            title={t('Delete the enquiry from :name', { name: enquiry.name })}
                                            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-sm text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            {t('Delete')}
                                        </button>
                                    )}
                                </div>
                            </article>
                        </li>
                    ))}
                </ul>
            )}

            <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
    );
}
