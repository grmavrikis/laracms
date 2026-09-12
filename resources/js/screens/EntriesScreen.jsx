import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, ArrowLeft, Boxes } from 'lucide-react';
import api from '../lib/api';
import EntriesTable from '../components/EntriesTable';
import { paginationFrom, rowsFrom, isPastLastPage } from '../lib/pagination';
import { t, locale } from '../lib/i18n';
import { onlyPresent } from '../lib/selection';
import { applyToEach, bulkSummary } from './bulk';
import { contentLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { moduleNameForReader } from '../lib/modules';
import { createLatestWriteQueue } from '../lib/latestWriteQueue';
import useRoute from '../hooks/useRoute';
import PageHeader from '../ui/PageHeader';

/**
 * A module's entries (#117 item 12).
 *
 * Split out of `EntriesManager`, which held the listing *and* the form and
 * decided between them with a `view` string. That string was the panel's only
 * record of where you were, so the form had no address and a reload threw the
 * work away. Both halves are screens now and the router decides.
 *
 * **The page lives in the query string**, not in state. Held here it was lost
 * the moment the form replaced this screen, so editing an entry from page two
 * and saving returned the reader to page one - and it could not be bookmarked
 * or reloaded either.
 */
export default function EntriesScreen({ module }) {
    const [route, navigate] = useRoute();

    const [languages, setLanguages] = useState([]);
    const [languagesError, setLanguagesError] = useState(null);
    const [viewLangCode, setViewLangCode] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [orderIds, setOrderIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Reordering reports separately from the listing, and not for tidiness: the
    // listing effect clears `error` every time it runs, and the failure path
    // deliberately triggers that effect to refetch. Sharing one variable meant
    // the message was wiped one frame after it appeared.
    const [orderError, setOrderError] = useState(null);

    // False when the module is past Entry::MAX_REORDER, which is why the arrows
    // are disabled - without it an oversized module is indistinguishable from
    // one whose order simply has not loaded.
    const [reorderable, setReorderable] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    /**
     * Which rows are ticked, and what happened to the last bulk action.
     *
     * **Per page.** `onlyPresent` narrows the selection to the rows now on
     * show, so turning to page two cannot leave a delete acting on entries the
     * reader is no longer looking at while the bar names the old count.
     */
    const [selected, setSelected] = useState([]);
    const [bulkError, setBulkError] = useState(null);

    // The last order the server confirmed, to fall back to when a write fails,
    // and the queue that guarantees one write at a time.
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

    // A page below one is a typed address, not a state this screen can reach.
    const page = Math.max(1, Number.parseInt(route.query.page ?? '1', 10) || 1);

    // `useCallback` and listed in the effect's dependencies rather than closed
    // over silently: it is correct today only because it reads nothing that
    // changes, which stops being true the first time a filter is added.
    const goToPage = useCallback((next) => navigate('entries', { module: module.slug }, {
        // `next > 1` so page one is the plain address: two URLs for the same
        // fifteen rows is what `buildPath` drops empty query values to avoid.
        query: next > 1 ? { page: next } : null,
        // Paging is not a place to return to - Back should leave the listing,
        // not walk through every page somebody clicked past.
        replace: true,
    }), [navigate, module.slug]);

    /**
     * The address of one entry, carrying the page it was opened from.
     *
     * Without this the page was in the URL of the listing and nowhere else, so
     * the form had no idea where the reader came from and saving always
     * returned them to page one - the very regression putting the page in the
     * address was supposed to end. On a module of forty rooms, correcting the
     * last one threw the owner back to the top after every save.
     */
    /**
     * The selection, narrowed to the rows now on show.
     *
     * A selection is **per page**: carrying fifteen ticks to page two would let
     * a delete act on entries the reader is no longer looking at, while the bar
     * still named the old count. Derived rather than cleared in an effect, so
     * there is no render in which the two disagree.
     */
    const onPage = onlyPresent(selected, entries.map((entry) => entry.id));

    /**
     * One action, applied to every ticked entry (#117 item 19).
     *
     * **Delete only, and that is deliberate.** `DELETE` needs no body, so it is
     * n requests and no new PHP - the same rule that kept the dashboard's
     * counts real. Publishing in bulk would need `PUT { status }` to be
     * accepted, and `SchemaRuleBuilder::build()` hard-codes `data` as
     * `required` for both entry requests, so it answers 422 with *The data
     * field is required*. Posting the whole document back instead would re-post
     * everything the listing happened to be holding, which is #86's defect
     * pointing the other way. Those two controls are drawn, disabled and
     * explained in `EntriesTable`.
     *
     * The listing endpoint is the other thing that cannot help - it takes a
     * page and nothing else - which is why sort and filter are marked too.
     */
    const handleBulkAction = async (action, ids) => {
        if (action !== 'delete') {
            return;
        }

        setBulkError(null);

        const result = await applyToEach(ids, (id) => api.delete(`/modules/${module.slug}/entries/${id}`));
        const summary = bulkSummary(result);

        if (summary) {
            console.error(result.reason);
            setBulkError(summary);
        }

        // The selection is dropped either way: the rows it named have moved,
        // and a tick left on an entry that is gone is worse than none.
        setSelected([]);
        setRefreshKey((n) => n + 1);
    };

    const entryHref = (entry) => ({
        name: 'entryEdit',
        params: { module: module.slug, entry: entry.id },
        options: { query: page > 1 ? { page } : null },
    });

    // "About" is one entry, not a list of one (TASKS.md #60). The panel opens
    // straight into it, so the client never meets a table with a single row and
    // an "add" button that must not be pressed.
    const singleton = Boolean(module.is_singleton);

    const moduleName = moduleNameForReader(module, languages, locale);

    useEffect(() => {
        loadLanguages()
            .then((list) => {
                setLanguages(list);

                if (list.length > 0) {
                    // The panel's own language when the site has it, and the
                    // language flagged is_default otherwise (#116).
                    setViewLangCode(contentLangCode(list, locale));
                } else {
                    // Not "no *active* languages": since #114 this list carries
                    // unpublished ones too, so an empty answer means the site
                    // has none at all. And it deliberately does not say "add
                    // one" - there is no endpoint, because adding a language is
                    // a service the agency performs (#52).
                    setLanguagesError(t('This site has no languages yet.'));
                }
            })
            .catch((err) => {
                console.error(err);
                setLanguagesError(t('Could not load the languages.'));
            });
    }, []);

    // Entries do not depend on the selected language: an entry carries every
    // translation and the table picks one to display. A `lang` param used to be
    // sent and the language was a dependency here, so switching tabs refetched
    // a byte-identical response - the endpoint never read it.
    useEffect(() => {
        let current = true;

        setLoading(true);
        setError(null);

        api.get(`/modules/${module.slug}/entries`, { params: { page } })
            .then(({ data }) => {
                if (!current) return;

                const meta = paginationFrom(data);

                if (isPastLastPage(meta)) {
                    goToPage(meta.lastPage);

                    return;
                }

                setEntries(rowsFrom(data));
                setPagination(meta);
            })
            .catch((err) => {
                if (!current) return;

                console.error(err);
                setError(t('Could not load the entries.'));
            })
            .finally(() => current && setLoading(false));


    return () => { current = false; };
    }, [module.slug, refreshKey, page, goToPage]);

    // The order of the whole module, which the table reorders against.
    //
    // The table holds one page of fifteen and the endpoint takes the order of
    // the module - so a move computed from the page renumbered it over
    // everything above (TASKS.md #75). Refetched alongside the listing, since a
    // create or a delete changes it. One `select id`.
    useEffect(() => {
        // A singleton holds one entry by definition and shows no arrows, so
        // its order is a request whose answer can never be used - and three of
        // the demo's six modules are singletons.
        if (singleton) return undefined;

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
    }, [module.slug, refreshKey, singleton]);

    // A singleton has nothing to list, so as soon as the listing says whether
    // its entry exists we go to that entry - or to a blank form for the first
    // one. **`replace`**, or Back from the form returns to this screen, which
    // immediately sends the reader forward again: a trap with no way out but
    // holding the button.
    useEffect(() => {
        if (!singleton || loading || error) return;

        if (entries.length > 0) {
            navigate('entryEdit', { module: module.slug, entry: entries[0].id }, { replace: true });
        } else if (languages.length > 0) {
            navigate('entryCreate', { module: module.slug }, { replace: true });
        }
    }, [singleton, loading, error, entries, languages.length, module.slug]);

    /**
     * A move is applied locally at once and written by a queue that keeps one
     * request in flight (TASKS.md #78).
     *
     * The arrows used to send a PUT per click with nothing serialising them, so
     * a second quick click computed its order from the list the first PUT had
     * not yet refreshed - it sent the same swap again, the row moved one place
     * instead of two, and whichever response landed last won.
     *
     * Applying locally is what makes the next click correct: it computes from
     * the order being written rather than the one on the server. The queue is
     * what makes the writes safe, and it can coalesce because each payload is
     * the whole order rather than a description of one move.
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
            // saying somebody else added or deleted an entry - and without this
            // the panel would hold the same rejected ids for ever, every later
            // move failing identically with no way out but leaving the module.
            setOrderIds(savedOrder.current);
            setRefreshKey((n) => n + 1);
            setOrderError(t('Could not save the new order. The list has been reloaded.'));
        }
    };

    // A singleton is on its way elsewhere; showing its empty table first is a
    // flash of a screen that is not meant to exist.
    //
    // **But not when the trip cannot happen.** The redirect effect bails on an
    // error, so returning the loading line unconditionally left a failed
    // singleton saying "Loading…" for ever with its own message rendered below
    // an early return and unreachable. Every singleton in the demo - About,
    // Contact, Photos - had that path.
    if (singleton) {
        if (!error && !languagesError) {
            return <p className="text-sm text-fg-muted">{t('Loading…')}</p>;
        }

        return (
            <div className="space-y-4">
                <p role="alert" className="text-sm text-danger-text">{error || languagesError}</p>
                <button
                    type="button"
                    onClick={() => setRefreshKey((n) => n + 1)}
                    className="cursor-pointer text-sm font-medium text-accent-text underline-offset-2 hover:underline"
                >
                    {t('Try again')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Boxes}
                title={moduleName}
                description={module.slug}
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => navigate('modules')}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">{t('Back to modules')}</span>
                        </button>
                        {languages.length > 0 && (
                            <button
                                type="button"
                                onClick={() => navigate('entryCreate', { module: module.slug })}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                {t('Add entry')}
                            </button>
                        )}
                    </>
                )}
            />

            {/* Keyed by which failure it is rather than by its own text: two
                sources holding the same string collided on the key and React
                rendered one of them. */}
            {Object.entries({ languages: languagesError, entries: error, order: orderError, bulk: bulkError })
                .filter(([, message]) => message)
                .map(([source, message]) => (
                    <p key={source} role="alert" className="text-sm text-danger-text">{message}</p>
                ))}

            {!reorderable && (
                <p className="text-sm text-fg-muted">
                    {t('This module has too many entries to be ordered by hand, so the arrows are off. Ordering is for short lists — a menu, a set of rooms, the slides on a home page.')}
                </p>
            )}

            {loading ? (
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading entries…')}</p>
            ) : (
                <EntriesTable
                    schema={module.schema ?? []}
                    entries={entries}
                    selected={onPage}
                    onSelectionChange={setSelected}
                    onBulkAction={handleBulkAction}
                    orderIds={orderIds}
                    onEdit={(entry) => {
                        const to = entryHref(entry);

                        navigate(to.name, to.params, to.options);
                    }}
                    onReorder={handleReorder}
                    languages={languages}
                    currentLangCode={viewLangCode}
                    onLanguageChange={setViewLangCode}
                    pagination={pagination}
                    onPageChange={goToPage}
                />
            )}
        </div>
    );
}
