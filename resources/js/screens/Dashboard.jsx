import { useState, useEffect } from 'react';
import { LayoutDashboard, Inbox, Layers, FileText, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { loadModules } from '../lib/moduleStore';
import { loadLanguages } from '../lib/languageStore';
import { moduleNameForReader } from '../lib/modules';
import { paginationFrom, rowsFrom } from '../lib/pagination';
import { formatDateTime } from '../lib/format';
import { t, locale } from '../lib/i18n';
import { hrefFor } from '../routes';
import PageHeader from '../ui/PageHeader';
import Alert from '../ui/Alert';
import Preview from '../ui/Preview';
import Link from '../ui/Link';

/**
 * The screen the panel opens on (#117 item 18).
 *
 * **Real where an endpoint already exists, invented where one does not**, which
 * is the phase rule at the top of the item rather than a compromise: the module
 * list and the enquiry inbox are both served today, so those numbers are this
 * site's. What is missing is a count of entries per module - the listing
 * endpoint takes `?page` and answers rows, so counting them from here would
 * mean one request per module and a `total` read out of a paginator built to be
 * thrown away.
 *
 * TODO(#117 item 18): the entry counts want `GET /api/stats/entries`, answering
 * `{ module_slug: { total, draft, published } }` in one query - a `GROUP BY
 * module_id, status` over `entries`. Until it exists that block is drawn from
 * invented figures and wears `ui/Preview`.
 */

/** One number worth looking at, and where it leads. */
const Stat = ({ icon: Icon, label, value, href, onNavigate }) => {
    const body = (
        <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
                <span className="block text-2xl font-bold tabular-nums text-fg">{value}</span>
                <span className="block truncate text-sm text-fg-muted">{label}</span>
            </span>
        </>
    );

    const className = 'flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors';

    return (
        <Link
            href={href}
            onNavigate={onNavigate}
            // The number and the label are separate blocks, so the name is
            // stated rather than left to how an engine joins them: read from
            // the DOM they run together as "6Modules".
            aria-label={`${value} ${label}`}
            className={`${className} cursor-pointer hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent`}
        >
            {body}
        </Link>
    );
};

export default function Dashboard({ navigate }) {
    const [modules, setModules] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [enquiries, setEnquiries] = useState([]);
    const [enquiryCount, setEnquiryCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState([]);
    const [attempt, setAttempt] = useState(0);

    /**
     * **Which halves failed, kept apart from which are empty.**
     *
     * A screen holding only `loading`, `errors` and the data cannot tell "the
     * site has no sections" from "the sections could not be read", and this one
     * drew the first for the second: an owner whose network blipped was told
     * their content was gone. `ByModuleSlug` fixed the same confusion once,
     * where a failed fetch read *That section no longer exists*.
     */
    const [failed, setFailed] = useState({ modules: false, enquiries: false });

    useEffect(() => {
        let current = true;

        setLoading(true);
        setErrors([]);

        // `allSettled`, not `all`: these are three independent requests and
        // `all` rejects as a unit, so an unreachable inbox discarded the
        // sections that had already arrived. Same reasoning `GalleryEditor`
        // records for keeping the uploads that succeeded.
        Promise.allSettled([loadModules(), loadLanguages(), api.get('/enquiries', { params: { page: 1 } })])
            .then(([mods, langs, inbox]) => {
                if (!current) return;

                if (mods.status === 'fulfilled') setModules(mods.value);
                if (langs.status === 'fulfilled') setLanguages(langs.value);

                if (inbox.status === 'fulfilled') {
                    const rows = rowsFrom(inbox.value.data);

                    setEnquiries(rows.slice(0, 3));
                    setEnquiryCount(paginationFrom(inbox.value.data)?.total ?? rows.length);
                }

                // The module list decides the screen; the languages only decide
                // which name a section shows, so a failure there is not worth a
                // banner of its own.
                setFailed({
                    modules: mods.status === 'rejected',
                    enquiries: inbox.status === 'rejected',
                });

                const refused = [mods, langs, inbox].find((r) => r.status === 'rejected');

                if (refused) {
                    console.error(refused.reason);
                    setErrors(errorSummary(refused.reason, t('Could not load the dashboard.')));
                }
            })
            .finally(() => current && setLoading(false));

        return () => { current = false; };
    }, [attempt]);

    const go = (name, params) => () => navigate?.(name, params);

    /** Said where the data would have been, rather than as an empty list. */
    const Unreadable = () => (
        <p className="rounded-xl border border-dashed border-danger/40 p-6 text-center text-sm text-fg-muted">
            {t('This could not be read just now.')}
        </p>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                icon={LayoutDashboard}
                title={t('Dashboard')}
                description={t('Where your site stands today.')}
            />

            <Alert messages={errors}>
                {errors.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setAttempt((n) => n + 1)}
                        className="mt-2 cursor-pointer font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                    >
                        {t('Try again')}
                    </button>
                )}
            </Alert>

            {loading ? (
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading…')}</p>
            ) : (
                <>
                    {/* Both of these are this site's own numbers: `/api/modules`
                        and `/api/enquiries` are served today. */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Stat
                            icon={Layers}
                            // `Modules`, not `Sections`: the sidebar already
                            // uses the latter for its `nav` label, where Greek
                            // reads "navigation sections" - correct there and
                            // wrong on a card counting content. The catalogue
                            // maps a key to one string and cannot tell two
                            // meanings of an English word apart, so the only
                            // lever is to pick a different key.
                            label={t('Modules')}
                            value={modules.length}
                            href={hrefFor('modules')}
                            onNavigate={go('modules')}
                        />
                        <Stat
                            icon={Inbox}
                            label={t('Enquiries')}
                            value={enquiryCount}
                            href={hrefFor('enquiries')}
                            onNavigate={go('enquiries')}
                        />
                    </div>

                    <section className="space-y-3">
                        <h2 className="text-base font-semibold text-fg">{t('Your sections')}</h2>

                        {failed.modules ? (
                            <Unreadable />
                        ) : modules.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
                                {t('No sections yet.')}
                            </p>
                        ) : (
                            <Preview note={t('The counts below are examples. Everything else on this screen is your own.')}>
                                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    {modules.map((module, index) => (
                                        <li key={module.id ?? module.slug}>
                                            <Link
                                                href={hrefFor('entries', { module: module.slug })}
                                                onNavigate={() => navigate?.('entries', { module: module.slug })}
                                                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <FileText className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                                                    <span className="truncate text-sm font-medium text-fg">
                                                        {moduleNameForReader(module, languages, locale)}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
                                                    {/* Invented, and inside the marker above.
                                                        A stable figure per row rather than a
                                                        random one, so the screen does not
                                                        reshuffle itself on every render. */}
                                                    <span className="tabular-nums">
                                                        {t(':count entries', { count: 4 + (index * 3) % 11 })}
                                                    </span>
                                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </Preview>
                        )}
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-semibold text-fg">{t('Latest enquiries')}</h2>

                        {failed.enquiries ? (
                            <Unreadable />
                        ) : enquiries.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-muted">
                                {t('No enquiries yet')}
                            </p>
                        ) : (
                            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                                {enquiries.map((enquiry) => (
                                    <li key={enquiry.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                                        <span className="min-w-0">
                                            <span className="font-medium text-fg">{enquiry.name}</span>
                                            <span className="ml-2 text-sm text-fg-muted">{enquiry.email}</span>
                                        </span>
                                        <time dateTime={enquiry.created_at} className="text-xs text-fg-muted">
                                            {formatDateTime(enquiry.created_at)}
                                        </time>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
