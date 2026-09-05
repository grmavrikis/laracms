import { useState, useEffect } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { paginationFrom, rowsFrom, isPastLastPage } from '../lib/pagination';

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
                setErrors(errorSummary(err, 'Could not load the enquiries.'));
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
            setErrors(errorSummary(err, 'Could not delete that enquiry.'));
        } finally {
            setDeleting(false);
        }
    };

    const when = (value) => (value ? new Date(value).toLocaleString() : '—');
    const day = (value) => (value ? new Date(value).toLocaleDateString() : null);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">Enquiries</h2>
                    <p className="text-sm text-gray-500">
                        {pagination?.total ?? enquiries.length} received. Kept for 24 months, then deleted.
                    </p>
                </div>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                    >
                        &larr; Back to Modules
                    </button>
                )}
            </div>

            {errors.length > 0 && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                    {errors.map((message, i) => <div key={i}>{message}</div>)}
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading enquiries...</div>
            ) : enquiries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
                    <h3 className="text-sm font-semibold text-gray-900">No enquiries yet</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        They arrive here the moment somebody sends the form on the site.
                    </p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {enquiries.map((enquiry) => (
                        <li key={enquiry.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div>
                                    <span className="font-semibold text-gray-900">{enquiry.name}</span>
                                    {' '}
                                    <a href={`mailto:${enquiry.email}`} className="text-indigo-600 hover:underline">
                                        {enquiry.email}
                                    </a>
                                    {enquiry.phone && <span className="text-gray-500"> · {enquiry.phone}</span>}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {when(enquiry.created_at)}
                                    {' · '}
                                    <span className="uppercase">{enquiry.language_code}</span>
                                </div>
                            </div>

                            {(day(enquiry.arrives_on) || enquiry.guests) && (
                                <p className="mt-1 text-sm text-gray-700">
                                    {day(enquiry.arrives_on) && (
                                        <>{day(enquiry.arrives_on)} → {day(enquiry.departs_on) ?? '—'}</>
                                    )}
                                    {enquiry.guests ? ` · ${enquiry.guests} guests` : ''}
                                </p>
                            )}

                            <p className="mt-2 whitespace-pre-line text-sm text-gray-800">{enquiry.message}</p>

                            <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                                <span className="truncate text-xs text-gray-400">{enquiry.source_url}</span>

                                {confirming === enquiry.id ? (
                                    <span className="flex shrink-0 items-center gap-2 text-sm">
                                        <span className="text-gray-700">Delete permanently?</span>
                                        <button
                                            onClick={() => handleDelete(enquiry)}
                                            disabled={deleting}
                                            className="rounded-md bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                        <button
                                            onClick={() => setConfirming(null)}
                                            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100"
                                        >
                                            Cancel
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => setConfirming(enquiry.id)}
                                        className="shrink-0 rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-red-50 hover:text-red-700"
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {(pagination?.lastPage ?? 1) > 1 && (
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Showing {pagination.from}–{pagination.to} of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(pagination.currentPage - 1)}
                            disabled={pagination.currentPage <= 1}
                            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40"
                        >
                            &larr; Previous
                        </button>
                        <span className="text-sm text-gray-600">
                            Page {pagination.currentPage} of {pagination.lastPage}
                        </span>
                        <button
                            onClick={() => setPage(pagination.currentPage + 1)}
                            disabled={pagination.currentPage >= pagination.lastPage}
                            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40"
                        >
                            Next &rarr;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
