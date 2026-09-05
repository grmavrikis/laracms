import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import EntryForm from './EntryForm';
import EntriesTable from './EntriesTable';
import { paginationFrom, rowsFrom, isPastLastPage } from '../lib/pagination';
import { t } from '../lib/i18n';
import { defaultLangCode, languagesFrom } from '../lib/languages';
import { createLatestWriteQueue } from '../lib/latestWriteQueue';

export default function EntriesManager({ module, onBack }) {
    const [languages, setLanguages] = useState([]);
    const [languagesError, setLanguagesError] = useState(null);
    const [viewLangCode, setViewLangCode] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [orderIds, setOrderIds] = useState([]);

    // The last order the server confirmed, to fall back to when a write
    // fails, and the queue that guarantees one write at a time.
    const savedOrder = useRef([]);
    const slugRef = useRef(module.slug);
    slugRef.current = module.slug;

    const orderQueue = useRef(null);

    if (!orderQueue.current) {
        orderQueue.current = createLatestWriteQueue(async (ids) => {
            await api.put(`/modules/${slugRef.current}/entries/order`, { ids });
            savedOrder.current = ids;
        });
    }
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Reordering reports separately from the listing, and not for tidiness:
    // the listing effect clears `error` every time it runs, and the failure
    // path deliberately triggers that effect to refetch. Sharing one variable
    // meant the message was wiped one frame after it appeared.
    const [orderError, setOrderError] = useState(null);

    // False when the module is past Entry::MAX_REORDER, which is why the
    // arrows are disabled - without it an oversized module is indistinguishable
    // from one whose order simply has not loaded.
    const [reorderable, setReorderable] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // "About" is one entry, not a list of one (TASKS.md #60). The panel opens
    // straight into it, so the client never meets a table with a single row
    // and an "add" button that must not be pressed.
    const singleton = Boolean(module.is_singleton);

    const [view, setView] = useState('list');
    const [editingEntry, setEditingEntry] = useState(null);

    useEffect(() => {
        api.get('/languages')
            .then(({ data }) => {
                const list = languagesFrom(data);
                setLanguages(list);

                // `loading` belongs to the entries request alone. These used to
                // clear it because entries were gated behind a language.
                if (list.length > 0) {
                    // The language flagged is_default, not merely the first one
                    // the endpoint happened to return.
                    setViewLangCode(defaultLangCode(list));
                } else {
                    setLanguagesError(t('No active languages. Add one before writing content.'));
                }
            })
            .catch((err) => {
                console.error(err);
                setLanguagesError(t('Could not load the languages.'));
            });
    }, []);

    // Entries do not depend on the selected language: an entry carries every
    // translation, and the table picks one to display. A `lang` param used to
    // be sent and the language was a dependency of this effect, so switching
    // tabs refetched a byte-identical response - the endpoint never read it.
    useEffect(() => {
        if (view !== 'list') return;
        setLoading(true);
        setError(null);
        api.get(`/modules/${module.slug}/entries`, { params: { page } })
            .then(({ data }) => {
                const meta = paginationFrom(data);

                if (isPastLastPage(meta)) {
                    setPage(meta.lastPage);
                    return;
                }

                setEntries(rowsFrom(data));
                setPagination(meta);
            })
            .catch((err) => {
                console.error(err);
                setError(t('Could not load the entries.'));
            })
            .finally(() => setLoading(false));
    }, [module.slug, refreshKey, view, page]);

    // The order of the whole module, which the table reorders against.
    //
    // The table holds one page of fifteen, and the endpoint takes the order of
    // the module - so a move computed from the page renumbered it over
    // everything above (TASKS.md #75). Refetched alongside the listing, since
    // a create or a delete changes it. One `select id`.
    useEffect(() => {
        if (view !== 'list') return;

        let current = true;

        api.get(`/modules/${module.slug}/entries/order`)
            .then(({ data }) => {
                if (!current) return;

                // A write in flight means the local order is newer than this
                // answer, which was asked for before the move was made.
                if (orderQueue.current.busy) return;

                const ids = Array.isArray(data?.ids) ? data.ids : [];

                setOrderIds(ids);
                setReorderable(data?.reorderable !== false);
                savedOrder.current = ids;
            })
            .catch((err) => {
                console.error(err);
                // Not an error banner of its own: the listing still works and
                // the arrows stay disabled, which is honest about what the
                // panel can do without knowing the module's order.
                if (current) setOrderIds([]);
            });

        return () => { current = false; };
    }, [module.slug, refreshKey, view]);

    // A singleton has nothing to list, so as soon as the listing tells us
    // whether its entry exists we go to that entry - or to a blank form for
    // the first one. Driven off the listing rather than a request of its own,
    // which is why it waits for `loading` to finish.
    useEffect(() => {
        if (!singleton || view !== 'list' || loading || error) return;

        if (entries.length > 0) {
            handleEdit(entries[0]);
        } else if (languages.length > 0) {
            setEditingEntry(null);
            setView('create');
        }
    }, [singleton, view, loading, error, entries, languages.length]);

    const handleEdit = async (entry) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/modules/${module.slug}/entries/${entry.id}`);
            setEditingEntry(data);
            setView('edit');
        } catch (err) {
            console.error(err);
            setError(t('Could not open that entry.'));
        } finally {
            setLoading(false);
        }
    };

    /**
     * The table hands over the order the list should end up in, and the whole
     * of it goes in one request - so a move is one round trip rather than two
     * writes that could half-fail and leave the list in an order nobody chose.
     */
    /**
     * A move is applied locally at once and written by a queue that keeps one
     * request in flight (TASKS.md #78).
     *
     * The arrows used to send a PUT per click with nothing serialising them,
     * so a second quick click computed its order from the list the first PUT
     * had not yet refreshed - it sent the same swap again, the row moved one
     * place instead of two, and whichever response landed last won.
     *
     * Applying locally is what makes the next click correct: it computes from
     * the order being written rather than the one on the server. The queue is
     * what makes the writes safe, and it can coalesce because each payload is
     * the whole order rather than a description of one move - so three quick
     * presses are two requests and three places moved.
     */
    const handleReorder = async (ids) => {
        setOrderError(null);
        setOrderIds(ids);

        try {
            await orderQueue.current.push(ids);
            setRefreshKey((n) => n + 1);
        } catch (err) {
            console.error(err);

            // Revert to the last order the server confirmed, then ask it for
            // the real one. The common rejection is the completeness rule
            // saying somebody else added or deleted an entry - its message
            // asks the reader to reload the list, and without this the panel
            // never does: it would hold the same rejected ids and every later
            // move would fail identically, with no way out but leaving the
            // module.
            setOrderIds(savedOrder.current);
            setRefreshKey((n) => n + 1);
            setOrderError(t('Could not save the new order. The list has been reloaded.'));
        }
    };

    const handleFormClose = (saved = false) => {
        const wasCreating = view === 'create';

        // A singleton has no list behind the form, so closing it cannot mean
        // "go back to the list".
        //
        // Saving keeps the author on the content they just wrote - throwing
        // them out to the modules list meant they could not see the result,
        // and a second correction needed navigating back in, on the one screen
        // a client edits most. Cancelling leaves, because there is nothing
        // else here to show them.
        if (singleton) {
            if (saved) {
                if (editingEntry?.id) {
                    handleEdit(editingEntry);
                } else {
                    // Just created: the listing has to name it before the
                    // effect above can open it.
                    setView('list');
                    setRefreshKey((n) => n + 1);
                }

                return;
            }

            onBack?.();
            return;
        }

        setView('list');
        setEditingEntry(null);

        if (saved) {
            // Entries are listed newest first, so a new one is on page one.
            // After an edit the entry stays where it was, so does the reader.
            if (wasCreating) {
                setPage(1);
            }

            setRefreshKey((n) => n + 1);
        }
    };

    if (view === 'create' || view === 'edit') {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                    <div className="flex items-center space-x-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={view === 'edit' ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 4.5v15m7.5-7.5h-15"} />
                            </svg>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <h2 className="text-xl font-bold tracking-tight text-gray-900">
                                {view === 'edit' ? t('Edit entry') : t('New entry')}
                            </h2>
                            <span className="text-gray-300 font-light">/</span>
                            <span className="text-lg font-medium text-gray-600">
                                {module.name}
                            </span>
                            {view === 'edit' && editingEntry?.id && (
                                <>
                                    <span className="text-gray-300 font-light">/</span>
                                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 font-mono">
                                        #{editingEntry.id}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <EntryForm
                        moduleSlug={module.slug}
                        schema={module.schema ?? []}
                        languages={languages}
                        initialData={editingEntry}
                        onSaved={() => handleFormClose(true)}
                        onCancel={() => handleFormClose(false)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-gray-900">{module.name}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {languages.length > 0 && !singleton && (
                        <button
                            onClick={() => {
                                setEditingEntry(null);
                                setView('create');
                            }}
                            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                        >
                            + {t('Add entry')}
                        </button>
                    )}
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                        >
                            &larr; {t('Back to modules')}
                        </button>
                    )}
                </div>
            </div>

            {languagesError && <p className="text-sm text-red-600">{languagesError}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {orderError && <p className="text-sm text-red-600">{orderError}</p>}
            {!reorderable && (
                <p className="text-sm text-gray-500">
                    {t('This module has too many entries to be ordered by hand, so the arrows are off. Ordering is for short lists — a menu, a set of rooms, the slides on a home page.')}
                </p>
            )}

            {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">{t('Loading entries…')}</div>
            ) : (
                <EntriesTable
                    schema={module.schema ?? []}
                    entries={entries}
                    orderIds={orderIds}
                    onEdit={handleEdit}
                    onReorder={handleReorder}
                    languages={languages}
                    currentLangCode={viewLangCode}
                    onLanguageChange={setViewLangCode}
                    pagination={pagination}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
}