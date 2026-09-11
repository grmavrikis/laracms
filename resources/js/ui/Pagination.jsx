import { t } from '../lib/i18n';

/**
 * Where the reader is in a listing, and the two steps either side of it.
 *
 * Extracted at its second use (#117 item 17): `EntriesTable` and
 * `EnquiriesManager` ask the same question of the same shape - whatever
 * `lib/pagination.js` reduced Laravel's envelope to - and the second copy had
 * already drifted, keeping the arrows and the older button styling the first
 * one lost in item 11.
 *
 * **Both counts are shown on purpose.** *Showing 16–30 of 57* answers "how much
 * is there", *Page 2 of 4* answers "how far in am I", and a listing that
 * answers only the second leaves somebody counting pages to guess the first.
 */
const STEP =
    'inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface '
    + 'px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted '
    + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent '
    + 'disabled:cursor-not-allowed disabled:opacity-40';

export default function Pagination({ pagination, onPageChange }) {
    if (!pagination || (pagination.lastPage ?? 1) <= 1) {
        return null;
    }

    const { currentPage, lastPage } = pagination;

    return (
        // A landmark, so a reader can jump to it rather than tabbing the whole
        // listing to find out whether there is a second page.
        <nav
            aria-label={t('Pagination')}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="text-sm text-fg-muted">
                {t('Showing :from–:to of :total', {
                    from: pagination.from,
                    to: pagination.to,
                    total: pagination.total,
                })}
            </p>

            <div className="flex items-center gap-2">
                {/* `type="button"`, because the settings screen is a `<form>`
                    and a bare button inside one submits it. */}
                <button
                    type="button"
                    onClick={() => onPageChange?.(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className={STEP}
                >
                    {t('Previous')}
                </button>

                <span className="px-1 text-sm text-fg-muted">
                    {t('Page :page of :pages', { page: currentPage, pages: lastPage })}
                </span>

                <button
                    type="button"
                    onClick={() => onPageChange?.(currentPage + 1)}
                    disabled={currentPage >= lastPage}
                    className={STEP}
                >
                    {t('Next')}
                </button>
            </div>
        </nav>
    );
}
