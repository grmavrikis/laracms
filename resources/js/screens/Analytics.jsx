import { ChartNoAxesColumn, TrendingUp } from 'lucide-react';
import { t } from '../lib/i18n';
import PageHeader from '../ui/PageHeader';
import Preview from '../ui/Preview';

/**
 * What the site did last month (#117 item 18).
 *
 * **Every figure here is invented**, which is why the whole screen sits inside
 * one `ui/Preview` rather than marking a block at a time: nothing on it is
 * real, and a marker around part of a screen implies the rest is not marked
 * because it does not need to be.
 *
 * TODO(#117 item 18): this screen wants `GET /api/stats/traffic`, answering
 * `{ range, visitors, views, series: [{ date, visitors, views }], pages: [{
 * path, views }], referrers: [{ host, visits }] }`. Nothing in the application
 * records any of it today - the public site is static HTML served by Apache
 * before PHP starts (#97), so the request never reaches Laravel and there is
 * nothing to count. Making this real is therefore **not** one endpoint: it is a
 * decision about where the numbers come from at all. The two plausible answers
 * are parsing Apache's access log on a schedule, or a one-pixel beacon the
 * baked pages carry. Both are a Phase 3 conversation, and BUSINESS.md's ceiling
 * on support minutes per client is the argument for the log: nothing to embed,
 * nothing for a client to break.
 */

/**
 * The shape a real answer would take, drawn from figures that are not.
 *
 * `label` is a function rather than a string so each one is written as a
 * literal single-quoted call at the point of use. `CatalogueCoversTheCodeTest`
 * scans for exactly that shape, and `t(stat.label)` slips past it - which is how
 * a string reaches a client untranslated.
 */
const SUMMARY = [
    { key: 'visitors', label: () => t('Visitors'), value: '1,284', change: '+12%' },
    { key: 'views', label: () => t('Page views'), value: '4,019', change: '+8%' },
    // Deliberately **not** an enquiry count. The dashboard shows the site's
    // real one, and two screens a click apart reporting different totals for
    // the same named thing makes a reader work out which is which - the marker
    // says a figure is a sample, it does not say which real figure it collides
    // with.
    { key: 'duration', label: () => t('Time on page'), value: '1m 48s', change: '+11s' },
    { key: 'rate', label: () => t('Enquiry rate'), value: '2.9%', change: '+0.4pp' },
];

const SERIES = [18, 24, 21, 33, 29, 41, 38, 52, 47, 61, 55, 68];

const PAGES = [
    { path: '/el/domatia/thea-sti-thalassa', views: 812 },
    { path: '/el', views: 640 },
    { path: '/en/rooms/sea-view', views: 431 },
    { path: '/el/paroches', views: 298 },
    { path: '/el/epikoinonia', views: 187 },
];

const REFERRERS = [
    { host: 'google.com', visits: 706 },
    { host: 'booking.com', visits: 214 },
    { host: 'instagram.com', visits: 152 },
    { host: 'direct', visits: 212 },
];

export default function Analytics() {
    const tallest = Math.max(...SERIES);
    const busiest = Math.max(...PAGES.map((page) => page.views));

    return (
        <div className="space-y-6">
            <PageHeader
                icon={ChartNoAxesColumn}
                title={t('Analytics')}
                description={t('Who came to the site, and what they read.')}
            />

            <Preview note={t('Nothing here is measured yet. The shape is real; the numbers are invented.')}>
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {SUMMARY.map((stat) => (
                            <div key={stat.key} className="rounded-xl border border-line bg-surface p-4">
                                <p className="text-sm text-fg-muted">{stat.label()}</p>
                                <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{stat.value}</p>
                                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success-text">
                                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                                    {stat.change}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-xl border border-line bg-surface p-4">
                        <h2 className="text-sm font-semibold text-fg">{t('Visitors, last twelve weeks')}</h2>
                        {/* Bars, not a chart library: twelve numbers do not
                            justify a dependency, and this is a placeholder for
                            a shape nobody has agreed on yet. */}
                        <ol className="mt-4 flex h-32 items-end gap-1.5" aria-hidden="true">
                            {SERIES.map((value, week) => (
                                <li
                                    key={week}
                                    style={{ height: `${Math.round((value / tallest) * 100)}%` }}
                                    className="flex-1 rounded-t bg-accent/70"
                                />
                            ))}
                        </ol>
                        {/* The bars are decorative; this is the same information
                            for anybody who cannot see them. */}
                        <p className="mt-2 text-xs text-fg-muted">
                            {t('From :low to :high visitors a week, rising.', {
                                low: Math.min(...SERIES),
                                high: tallest,
                            })}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-line bg-surface p-4">
                            <h2 className="text-sm font-semibold text-fg">{t('Most read pages')}</h2>
                            <ul className="mt-3 space-y-2">
                                {PAGES.map((page) => (
                                    <li key={page.path}>
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="truncate font-mono text-xs text-fg">{page.path}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-fg-muted">{page.views}</span>
                                        </div>
                                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                                            <div
                                                style={{ width: `${Math.round((page.views / busiest) * 100)}%` }}
                                                className="h-full rounded-full bg-accent/70"
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-xl border border-line bg-surface p-4">
                            <h2 className="text-sm font-semibold text-fg">{t('Where they came from')}</h2>
                            <ul className="mt-3 divide-y divide-line">
                                {REFERRERS.map((referrer) => (
                                    <li key={referrer.host} className="flex items-baseline justify-between gap-3 py-2">
                                        <span className="truncate text-sm text-fg">{referrer.host}</span>
                                        <span className="shrink-0 text-sm tabular-nums text-fg-muted">{referrer.visits}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </Preview>
        </div>
    );
}
