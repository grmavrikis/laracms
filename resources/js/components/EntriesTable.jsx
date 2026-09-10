import { isRichTextField, docToText } from '../lib/richText';
import { isGalleryField, galleryPreview } from '../lib/gallery';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { isPublished, reorderedIds, positionInOrder, sortByOrder, valueForLanguage } from '../lib/entries';

export default function EntriesTable({
    schema,
    entries,
    onEdit,
    onReorder,
    orderIds = [],
    languages = [],
    currentLangCode = 'en',
    onLanguageChange,
    pagination = null,
    onPageChange,
}) {
    // Fall back to the row count only when the response was not paginated;
    // otherwise this counted one page and labelled it the total.
    const total = pagination?.total ?? entries?.length ?? 0;
    const hasPages = (pagination?.lastPage ?? 1) > 1;

    // A reorder is applied to the id list before the server confirms it, so
    // the rows follow that rather than waiting for the refetch - otherwise
    // pressing the arrow three times looks like nothing happening.
    const rows = sortByOrder(entries, orderIds);

    return (
        <div className="mt-6 flex flex-col">
            {/* Header section with title/actions and unified language switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold leading-6 text-fg">{t('Entries')}</h3>
                    <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg">
                        {t(':total total', { total })}
                    </span>
                </div>

                {languages && languages.length > 0 && (
                    <div className="flex p-1 space-x-1 bg-surface-muted/80 rounded-lg w-max border border-line/50">
                        {languages.map((l) => {
                            const code = getLangCode(l);
                            const isActive = code === currentLangCode;
                            return (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => onLanguageChange?.(code)}
                                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${isActive
                                        ? 'bg-surface text-accent-text shadow-sm'
                                        : 'text-fg-muted hover:text-fg hover:bg-surface-muted/50'
                                        }`}
                                >
                                    {code.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {!entries || entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-muted py-16 px-4 text-center">
                    <svg className="mx-auto h-12 w-12 text-fg-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="mt-4 text-sm font-semibold text-fg">{t('No entries yet')}</h3>
                    <p className="mt-1 text-sm text-fg-muted">{t('Nothing has been written in this module.')}</p>
                </div>
            ) : (
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                            <table className="min-w-full divide-y divide-line text-left text-sm">
                                <thead className="bg-surface-muted">
                                    <tr>
                                        <th scope="col" className="px-6 py-4 font-semibold text-fg">ID</th>
                                        <th scope="col" className="px-4 py-4 font-semibold text-fg uppercase tracking-wide text-xs">
                                            {t('Status')}
                                        </th>
                                        {schema.map(field => (
                                            <th key={field.name} scope="col" className="px-4 py-4 font-semibold text-fg uppercase tracking-wide text-xs">
                                                {field.name}
                                            </th>
                                        ))}
                                        <th scope="col" className="px-4 py-4 font-semibold text-fg uppercase tracking-wide text-xs">
                                            {t('Created')}
                                        </th>
                                        <th scope="col" className="relative px-6 py-4">
                                            <span className="sr-only">{t('Actions')}</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line bg-surface">
                                    {rows.map((entry) => (
                                        <tr key={entry.id} className="group hover:bg-surface-muted/50 transition-colors duration-150">
                                            <td className="whitespace-nowrap px-6 py-4 font-medium text-fg">
                                                #{entry.id}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isPublished(entry)
                                                    ? 'bg-success-soft text-success-text'
                                                    : 'bg-warning-soft text-warning-text'
                                                    }`}>
                                                    {isPublished(entry) ? t('Published') : t('Draft')}
                                                </span>
                                            </td>
                                            {schema.map(field => {
                                                let rawValue = (entry.data && entry.data[field.name] !== undefined)
                                                    ? entry.data[field.name]
                                                    : entry[field.name];

                                                // Only this language. An empty cell
                                                // is the honest answer for a
                                                // translation nobody has written,
                                                // and it is what makes the table
                                                // show at a glance which ones are
                                                // still missing.
                                                const value = field.translatable
                                                    ? valueForLanguage(rawValue, currentLangCode)
                                                    : rawValue;

                                                // Rich text is a document object, not markup: render a plain
                                                // text excerpt, which React escapes on its own. Nothing here
                                                // injects HTML into the page.
                                                if (isRichTextField(field)) {
                                                    const excerpt = docToText(value);
                                                    return (
                                                        <td key={field.name} className="px-4 py-4 text-fg-muted max-w-xs">
                                                            <div className="line-clamp-2">
                                                                {excerpt || <span className="text-fg-subtle">-</span>}
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                // A gallery is a list of objects. Without its own
                                                // branch it fell through to String() below and the
                                                // column read "[object Object],[object Object]".
                                                if (isGalleryField(field)) {
                                                    const preview = galleryPreview(value);
                                                    return (
                                                        <td key={field.name} className="whitespace-nowrap px-4 py-4 text-fg-muted">
                                                            {preview || <span className="text-fg-subtle">-</span>}
                                                        </td>
                                                    );
                                                }

                                                if (typeof value === 'boolean') {
                                                    return (
                                                        <td key={field.name} className="whitespace-nowrap px-4 py-4 text-fg-muted">
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${value ? 'bg-success-soft text-success-text' : 'bg-surface-muted text-fg'}`}>
                                                                {value ? 'Yes' : 'No'}
                                                            </span>
                                                        </td>
                                                    );
                                                }

                                                // Folded into the string rather
                                                // than reassigning `value`,
                                                // which is now a const.
                                                let displayValue = value === null || value === undefined
                                                    ? ''
                                                    : String(value);

                                                if (displayValue.length > 50) {
                                                    displayValue = displayValue.substring(0, 50) + '...';
                                                }

                                                return (
                                                    <td key={field.name} className="whitespace-nowrap px-4 py-4 text-fg-muted">
                                                        {displayValue || <span className="text-fg-subtle">-</span>}
                                                    </td>
                                                );
                                            })}
                                            <td className="whitespace-nowrap px-4 py-4 text-fg-muted">
                                                {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                                {/* The whole order goes in one
                                                    request, so a move is one
                                                    round trip rather than two
                                                    writes that could half-fail. */}
                                                {onReorder && (() => {
                                                    // Position in the module,
                                                    // not on the page: the row
                                                    // above the first one here
                                                    // may be on the page before
                                                    // (TASKS.md #75). Until the
                                                    // order arrives, -1 leaves
                                                    // both arrows disabled.
                                                    const at = positionInOrder(orderIds, entry.id);

                                                    return (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => onReorder(reorderedIds(orderIds, entry.id, -1))}
                                                                disabled={at <= 0}
                                                                title={t('Move up')}
                                                                className="inline-flex items-center rounded-md px-2 py-1.5 text-fg-muted hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ↑
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => onReorder(reorderedIds(orderIds, entry.id, 1))}
                                                                disabled={at < 0 || at === orderIds.length - 1}
                                                                title={t('Move down')}
                                                                className="inline-flex items-center rounded-md px-2 py-1.5 text-fg-muted hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ↓
                                                            </button>
                                                        </>
                                                    );
                                                })()}
                                                <button
                                                    onClick={() => onEdit(entry)}
                                                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-accent-text hover:bg-accent-soft hover:text-accent-text transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                >
                                                    {t('Edit')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {hasPages && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-fg-muted">
                        {t('Showing :from–:to of :total', {
                            from: pagination.from,
                            to: pagination.to,
                            total: pagination.total,
                        })}
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage - 1)}
                            disabled={pagination.currentPage <= 1}
                            className="inline-flex items-center rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-fg shadow-sm ring-1 ring-inset ring-line-strong hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            &larr; {t('Previous')}
                        </button>

                        <span className="text-sm text-fg-muted px-1">
                            {t('Page :page of :pages', {
                                page: pagination.currentPage,
                                pages: pagination.lastPage,
                            })}
                        </span>

                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage + 1)}
                            disabled={pagination.currentPage >= pagination.lastPage}
                            className="inline-flex items-center rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-fg shadow-sm ring-1 ring-inset ring-line-strong hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            {t('Next')} &rarr;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}