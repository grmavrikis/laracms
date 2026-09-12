import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Pencil, Inbox, Trash2, Eye, EyeOff, ArrowUpDown } from 'lucide-react';
import { isRichTextField, docToText } from '../lib/richText';
import { isGalleryField, galleryPreview } from '../lib/gallery';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { isPublished, reorderedIds, positionInOrder, sortByOrder, valueForLanguage } from '../lib/entries';
import { toggle, toggleAll, allSelected, someSelected } from '../lib/selection';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';
import Preview from '../ui/Preview';
import { Select, Checkbox, INPUT_LABEL_CLASSES } from '../ui/Input';

/** One action the bar offers, an icon and a word. */
const BulkButton = ({ icon: Icon, label, tone, onClick, disabled, note }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        // The reason is part of the name, not only a tooltip: a disabled
        // control takes no focus and fires no pointer events, so a `title` on
        // one is reachable by neither keyboard nor hover (CHANGELOG 39).
        aria-label={note ? `${label} — ${note}` : undefined}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
            disabled ? '' : 'cursor-pointer '
        }${
            tone === 'danger'
                ? 'border-danger/40 bg-surface text-danger-text hover:bg-danger-soft'
                : 'border-line bg-surface text-fg hover:bg-surface-muted'
        }`}
    >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
        {note && <span className="text-xs font-normal text-fg-muted">({note})</span>}
    </button>
);

/**
 * A checkbox whose third state is a real one.
 *
 * `indeterminate` is a **property, not an attribute** - there is no way to set
 * it in JSX - so a part-ticked page would otherwise render as an empty box and
 * tell the reader nothing on it is selected.
 */
function PageCheckbox({ indeterminate, ...rest }) {
    const box = useRef(null);

    useEffect(() => {
        if (box.current) box.current.indeterminate = !!indeterminate;
    }, [indeterminate]);

    return <Checkbox ref={box} {...rest} />;
}

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
    selected = [],
    onSelectionChange,
    onBulkAction,
}) {
    // Fall back to the row count only when the response was not paginated;
    // otherwise this counted one page and labelled it the total.
    const total = pagination?.total ?? entries?.length ?? 0;
    const hasPages = (pagination?.lastPage ?? 1) > 1;

    // A reorder is applied to the id list before the server confirms it, so the
    // rows follow that rather than waiting for the refetch - otherwise pressing
    // the arrow three times looks like nothing happening.
    const rows = sortByOrder(entries, orderIds);
    const pageIds = rows.map((entry) => entry.id);
    const chosen = selected.length;

    /**
     * **Deleting asks first, and the other two do not.**
     *
     * Publishing is reversible by pressing the button beside it. A delete is
     * the one irreversible thing in the panel, it acts on rows chosen one at a
     * time, and a mis-click on a full page takes fifteen entries - the enquiry
     * inbox already asks before removing a single one.
     *
     * The question is dropped whenever the selection moves - **which rows, not
     * how many**. Keyed on the count alone, a selection of the same size but
     * different rows kept it open, so the question could stand over a pair the
     * reader never chose once a background refetch swapped one out.
     */
    const [confirming, setConfirming] = useState(false);
    const selectionKey = selected.map(String).sort().join(',');

    useEffect(() => { setConfirming(false); }, [selectionKey]);

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

            {/*
                Sort and filter are **drawn and not wired**, per the rule at the
                top of #117: `EntryController::index` takes a page and nothing
                else, so a control that sorted the fifteen rows on screen would
                claim to have ordered the four hundred behind them. Disabled
                rather than merely inert - a control that looks usable and
                silently does nothing is what the marker exists to prevent.

                TODO(#117 item 19): these want `GET /modules/{module}/entries`
                to take `?sort=<column>&direction=asc|desc` and
                `?status=draft|published`, applied inside `Entry::inListOrder()`
                so the paginator and `order()` keep agreeing - they must, or a
                reorder computed against one order is applied to another (#75).
            */}
            {rows.length > 0 && (
            <Preview note={t('These do not filter or sort anything yet.')}>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="entries-sort" className={INPUT_LABEL_CLASSES}>{t('Sort by')}</label>
                        <Select id="entries-sort" disabled defaultValue="position" className="py-1.5 text-sm">
                            <option value="position">{t('Position')}</option>
                            <option value="created">{t('Created')}</option>
                            <option value="status">{t('Status')}</option>
                        </Select>
                    </div>
                    <div>
                        <label htmlFor="entries-status" className={INPUT_LABEL_CLASSES}>{t('Status')}</label>
                        <Select id="entries-status" disabled defaultValue="" className="py-1.5 text-sm">
                            <option value="">{t('All')}</option>
                            <option value="published">{t('Published')}</option>
                            <option value="draft">{t('Draft')}</option>
                        </Select>
                    </div>
                    <ArrowUpDown className="mb-2 h-4 w-4 text-fg-subtle" aria-hidden="true" />
                </div>
            </Preview>
            )}

            {/* Appears where the reader already is, and says what the next
                press will touch. */}
            {chosen > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3">
                    {/* **The count is the live region, not the bar.** With the
                        role on the wrapper, every tick re-announced all four
                        control labels after the number - measured live, fifteen
                        rows read that whole string fifteen times and buried the
                        only thing that had changed. */}
                    <span role="status" className="text-sm font-semibold text-accent-soft-fg">
                        {t(':count selected', { count: chosen })}
                    </span>

                    {confirming ? (
                        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            <span className="text-sm font-semibold text-danger-text">
                                {t('Delete :count entries permanently?', { count: chosen })}
                            </span>
                            <BulkButton
                                icon={Trash2}
                                label={t('Delete')}
                                tone="danger"
                                onClick={() => { setConfirming(false); onBulkAction?.('delete', selected); }}
                            />
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-accent-soft-fg transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                            >
                                {t('Cancel')}
                            </button>
                        </span>
                    ) : (
                        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            {/*
                                **Disabled, and this is the whole finding.**
                                `SchemaRuleBuilder::build()` hard-codes
                                `data => required` and both entry requests share
                                it, so `PUT { status }` alone answers 422 with
                                *The data field is required*. Sending the whole
                                document back instead would re-post everything
                                the listing happened to be holding, which is
                                #86's defect pointing the other way.

                                Found by pressing the button against the real
                                API, with 701 tests green.

                                TODO(#117 item 19): bulk publishing wants
                                `data` to be `sometimes` on the **update** path
                                only - create must keep it required - so a
                                status-only `PUT` is accepted. That is one line
                                in `SchemaRuleBuilder::build()` plus a flag from
                                `UpdateEntryRequest`, and it is PHP.
                            */}
                            <BulkButton icon={Eye} label={t('Publish selected')} disabled note={t('not wired yet')} />
                            <BulkButton icon={EyeOff} label={t('Unpublish selected')} disabled note={t('not wired yet')} />
                            <BulkButton icon={Trash2} label={t('Delete selected')} tone="danger" onClick={() => setConfirming(true)} />
                            <button
                                type="button"
                                onClick={() => onSelectionChange?.([])}
                                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-accent-soft-fg underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                            >
                                {t('Clear selection')}
                            </button>
                        </span>
                    )}
                </div>
            )}

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
                                <th scope="col" className="w-px px-4 py-3 sm:pl-6">
                                    <PageCheckbox
                                        aria-label={t('Select every entry on this page')}
                                        checked={allSelected(selected, pageIds)}
                                        indeterminate={someSelected(selected, pageIds)}
                                        onChange={() => onSelectionChange?.(toggleAll(selected, pageIds))}
                                    />
                                </th>
                                <th scope="col" className="px-4 py-3 font-semibold text-fg">
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
                                        <td className="w-px px-4 py-3 sm:pl-6">
                                            {/* Named by the entry it ticks: one
                                                of several identical controls in
                                                a column says nothing alone. */}
                                            <Checkbox
                                                aria-label={t('Select entry :id', { id: entry.id })}
                                                checked={selected.some((one) => String(one) === String(entry.id))}
                                                onChange={() => onSelectionChange?.(toggle(selected, entry.id))}
                                            />
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-fg">
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
