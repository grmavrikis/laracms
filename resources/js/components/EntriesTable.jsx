import { ChevronUp, ChevronDown, Pencil, Inbox } from 'lucide-react';
import { isRichTextField, docToText } from '../lib/richText';
import { isGalleryField, galleryPreview } from '../lib/gallery';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { isPublished, reorderedIds, positionInOrder, sortByOrder, valueForLanguage } from '../lib/entries';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';

const Empty = () => <span className="text-fg-subtle">—</span>;

/** One schema field's value, in the language on show. */
function Cell({ field, entry, currentLangCode }) {
    const rawValue = (entry.data && entry.data[field.name] !== undefined)
        ? entry.data[field.name]
        : entry[field.name];

    // Only this language. An empty cell is the honest answer for a translation
    // nobody has written, and it is what makes the table show at a glance which
    // ones are still missing.
    const value = field.translatable
        ? valueForLanguage(rawValue, currentLangCode)
        : rawValue;

    // Rich text is a document object, not markup: render a plain text excerpt,
    // which React escapes on its own. Nothing here injects HTML into the page.
    if (isRichTextField(field)) {
        const excerpt = docToText(value);

        return (
            <td className="max-w-xs px-4 py-3 text-fg-muted">
                <div className="line-clamp-2">{excerpt || <Empty />}</div>
            </td>
        );
    }

    // A gallery is a list of objects. Without its own branch it fell through to
    // String() below and the column read "[object Object],[object Object]".
    if (isGalleryField(field)) {
        return (
            <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                {galleryPreview(value) || <Empty />}
            </td>
        );
    }

    if (typeof value === 'boolean') {
        return (
            <td className="whitespace-nowrap px-4 py-3">
                {/* `Yes` and `No` were written in English, outside `t()` - so
                    `CatalogueCoversTheCodeTest` never demanded them and a Greek
                    reader saw them untranslated in every boolean column. */}
                <Badge tone={value ? 'success' : 'neutral'}>
                    {value ? t('Yes') : t('No')}
                </Badge>
            </td>
        );
    }

    const text = value === null || value === undefined ? '' : String(value);

    return (
        <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
            {text ? (text.length > 50 ? `${text.slice(0, 50)}…` : text) : <Empty />}
        </td>
    );
}

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

    // A reorder is applied to the id list before the server confirms it, so the
    // rows follow that rather than waiting for the refetch - otherwise pressing
    // the arrow three times looks like nothing happening.
    const rows = sortByOrder(entries, orderIds);

    return (
        <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-fg">{t('Entries')}</h2>
                    <Badge tone="neutral">{t(':total total', { total })}</Badge>
                </div>

                {languages.length > 0 && (
                    // A group, not a loose row of buttons: without the name and
                    // the role a screen reader hears four unexplained
                    // two-letter buttons.
                    <div
                        role="group"
                        aria-label={t('Content language')}
                        className="flex w-max gap-0.5 rounded-lg border border-line bg-surface-muted p-1"
                    >
                        {languages.map((l) => {
                            const code = getLangCode(l);
                            const active = code === currentLangCode;

                            return (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => onLanguageChange?.(code)}
                                    aria-pressed={active}
                                    className={`cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                        active
                                            ? 'bg-surface text-accent-text shadow-sm'
                                            : 'text-fg-muted hover:text-fg'
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
                <div className="rounded-xl border border-dashed border-line-strong px-4 py-16 text-center">
                    <Inbox className="mx-auto h-10 w-10 text-fg-subtle" aria-hidden="true" />
                    <p className="mt-4 text-sm font-semibold text-fg">{t('No entries yet')}</p>
                    <p className="mt-1 text-sm text-fg-muted">
                        {t('Nothing has been written in this module.')}
                    </p>
                </div>
            ) : (
                // Scrolls inside its own box. The wrapper used to carry
                // negative margins to escape the page padding, which now fights
                // the Shell's own - and a table wide enough to need it took the
                // whole page sideways with it.
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                    <table className="min-w-full divide-y divide-line text-left text-sm">
                        <thead className="bg-surface-muted">
                            <tr>
                                <th scope="col" className="px-4 py-3 font-semibold text-fg sm:pl-6">
                                    {t('ID')}
                                </th>
                                <th scope="col" className="px-4 py-3 font-semibold text-fg">
                                    {t('Status')}
                                </th>
                                {schema.map((field) => (
                                    <th key={field.name} scope="col" className="px-4 py-3 font-semibold text-fg">
                                        {field.name}
                                    </th>
                                ))}
                                <th scope="col" className="hidden px-4 py-3 font-semibold text-fg md:table-cell">
                                    {t('Created')}
                                </th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-fg sm:pr-6">
                                    {t('Actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {rows.map((entry) => {
                                // Position in the module, not on the page: the
                                // row above the first one here may be on the
                                // page before (TASKS.md #75). Until the order
                                // arrives, -1 leaves both arrows disabled.
                                const at = positionInOrder(orderIds, entry.id);

                                return (
                                    <tr key={entry.id} className="transition-colors hover:bg-surface-muted/60">
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-fg sm:pl-6">
                                            #{entry.id}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <Badge tone={isPublished(entry) ? 'success' : 'warning'}>
                                                {isPublished(entry) ? t('Published') : t('Draft')}
                                            </Badge>
                                        </td>

                                        {schema.map((field) => (
                                            <Cell
                                                key={field.name}
                                                field={field}
                                                entry={entry}
                                                currentLangCode={currentLangCode}
                                            />
                                        ))}

                                        <td className="hidden whitespace-nowrap px-4 py-3 text-fg-muted md:table-cell">
                                            {/* Through the panel's own locale.
                                                `toLocaleDateString()` with no
                                                argument asks the browser, so a
                                                Greek panel on an English
                                                Windows printed 9/10/2026. */}
                                            {formatDate(entry.created_at) ?? <Empty />}
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3 text-right sm:pr-6">
                                            <div className="flex items-center justify-end gap-1">
                                                {/* The whole order goes in one
                                                    request, so a move is one
                                                    round trip rather than two
                                                    writes that could half-fail. */}
                                                {onReorder && (
                                                    <>
                                                        <IconButton
                                                            icon={ChevronUp}
                                                            label={t('Move up')}
                                                            onClick={() => onReorder(reorderedIds(orderIds, entry.id, -1))}
                                                            disabled={at <= 0}
                                                            className="h-8 w-8 disabled:cursor-not-allowed disabled:opacity-30"
                                                        />
                                                        <IconButton
                                                            icon={ChevronDown}
                                                            label={t('Move down')}
                                                            onClick={() => onReorder(reorderedIds(orderIds, entry.id, 1))}
                                                            disabled={at < 0 || at === orderIds.length - 1}
                                                            className="h-8 w-8 disabled:cursor-not-allowed disabled:opacity-30"
                                                        />
                                                    </>
                                                )}
                                                {/* Always visible. It was
                                                    `opacity-0 group-hover:…`,
                                                    and a touch screen has no
                                                    hover - so on a phone or a
                                                    tablet the only way to open
                                                    an entry was invisible. */}
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(entry)}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {t('Edit')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {hasPages && (
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
                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage - 1)}
                            disabled={pagination.currentPage <= 1}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                        >
                            {t('Previous')}
                        </button>

                        <span className="px-1 text-sm text-fg-muted">
                            {t('Page :page of :pages', {
                                page: pagination.currentPage,
                                pages: pagination.lastPage,
                            })}
                        </span>

                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage + 1)}
                            disabled={pagination.currentPage >= pagination.lastPage}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                        >
                            {t('Next')}
                        </button>
                    </div>
                </nav>
            )}
        </div>
    );
}
