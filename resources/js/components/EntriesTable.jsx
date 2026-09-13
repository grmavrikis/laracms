import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Pencil, Inbox, Trash2, Eye, EyeOff, ArrowUpDown, ExternalLink, Copy } from 'lucide-react';
import { isRichTextField, docToText } from '../lib/richText';
import { isGalleryField, galleryPreview } from '../lib/gallery';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { isPublished, reorderedIds, positionInOrder, sortByOrder, valueForLanguage } from '../lib/entries';
import { toggle, toggleAll, allSelected, someSelected } from '../lib/selection';
import useMediaQuery from '../hooks/useMediaQuery';
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

/**
 * Whether a click landed on a control with its own job - the checkbox, an
 * icon button, a link - rather than on the row or card around it.
 *
 * Shared by the row-click and card-click handlers below: both toggle
 * selection when the reader clicks anywhere that is *not* one of these, so
 * the whole row (desktop) or the whole block (mobile) is a second way to
 * reach the same one action the checkbox already performs, rather than a
 * competing one. The checkbox itself still works exactly as it did - this
 * only stops a click from *also* firing the row handler once the checkbox's
 * own `onChange` has already done so.
 */
const clickedControl = (event) => !!event.target.closest('input, button, a, select, textarea');

/**
 * One schema field's value, in the language on show - computed once and
 * shared between the table's own cell and the narrow layout's label/value
 * pair (#133), so the rich text excerpt, the gallery preview and the boolean
 * badge cannot drift apart between the two the way two independent branches
 * eventually would.
 *
 * `wide` marks a value the table's own cell gives `max-w-xs` and room to wrap
 * rather than `whitespace-nowrap` - a two-line excerpt or a photo list needs
 * room, not a shelf. The narrow layout stacks every field regardless, so it
 * has no use for the flag and reads only `node`.
 */
function fieldValue(field, entry, currentLangCode) {
    const rawValue = (entry.data && entry.data[field.name] !== undefined)
        ? entry.data[field.name]
        : entry[field.name];

    // Only this language. An empty value is the honest answer for a
    // translation nobody has written, and it is what makes the table (or the
    // card) show at a glance which ones are still missing.
    const value = field.translatable
        ? valueForLanguage(rawValue, currentLangCode)
        : rawValue;

    // Rich text is a document object, not markup: render a plain text excerpt,
    // which React escapes on its own. Nothing here injects HTML into the page.
    if (isRichTextField(field)) {
        const excerpt = docToText(value);

        return { wide: true, node: <div className="line-clamp-2">{excerpt || <Empty />}</div> };
    }

    // A gallery is a list of objects. Without its own branch it fell through to
    // String() below and the column read "[object Object],[object Object]".
    if (isGalleryField(field)) {
        return { wide: true, node: galleryPreview(value) || <Empty /> };
    }

    if (typeof value === 'boolean') {
        return {
            wide: false,
            node: (
                // `Yes` and `No` were written in English, outside `t()` - so
                // `CatalogueCoversTheCodeTest` never demanded them and a Greek
                // reader saw them untranslated in every boolean column.
                <Badge tone={value ? 'success' : 'neutral'}>
                    {value ? t('Yes') : t('No')}
                </Badge>
            ),
        };
    }

    const text = value === null || value === undefined ? '' : String(value);

    return { wide: false, node: text ? (text.length > 50 ? `${text.slice(0, 50)}…` : text) : <Empty /> };
}

/**
 * One label and its value, on a single line, for the narrow layout - a
 * schema field, or one of the two dates every entry carries regardless of
 * its schema. Shared so the three read as one list rather than a field list
 * with two unrelated lines bolted on the end.
 */
function FieldRow({ label, children }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-1.5">
            <dt className="shrink-0 text-xs font-medium text-fg-subtle">{label}:</dt>
            <dd className="text-sm text-fg-muted">{children}</dd>
        </div>
    );
}

/** One schema field's value, as a table cell. */
function Cell({ field, entry, currentLangCode }) {
    const { wide, node } = fieldValue(field, entry, currentLangCode);

    return (
        <td className={`px-4 py-3 text-fg-muted ${wide ? 'max-w-xs' : 'whitespace-nowrap'}`}>
            {node}
        </td>
    );
}

/**
 * The reorder arrows and Edit, shared between the table's own hover overlay
 * (#140) and the narrow layout's card header (#133).
 *
 * **Icon-only**, unlike the button this replaced. A word beside the pencil on
 * every row was the widest thing forcing this column to be pinned in the
 * first place, and it said nothing the icon does not already say once it is
 * the only pencil in the row.
 *
 * Carries no opinion of its own about when it is visible - the table wraps it
 * in the overlay that reveals it on hover/focus (#140), the narrow card
 * renders it plainly, and neither has to know the other exists.
 */
function RowActions({ entry, at, orderIds, onReorder, onEdit }) {
    return (
        <div className="flex items-center gap-1">
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
            {/* Drawn and disabled, not left out (#136): opening the public
                page needs that page's own address, and the entries list has
                no way to know it - `EntryController::index` never loads
                `slugs`, unlike `show()`. One line of PHP
                (`->with('slugs')` on the index query) plus reading
                `entry.slugs`/`module.slugs` here for the current language is
                what turns this on; nothing about the button itself changes. */}
            <IconButton
                icon={ExternalLink}
                label={`${t('Preview')} — ${t('not wired yet')}`}
                disabled
                className="h-8 w-8 disabled:cursor-not-allowed disabled:opacity-30"
            />
            {/* Named per entry, not just "Edit" - several identical buttons
                with the same accessible name is the checkbox column's own
                defect (see its comment below), and this control has the
                same shape. */}
            <IconButton
                icon={Pencil}
                label={t('Edit entry :id', { id: entry.id })}
                onClick={() => onEdit(entry)}
                className="h-8 w-8"
            />
        </div>
    );
}

/**
 * One entry, as a card rather than a table row (#133).
 *
 * A table with one column per schema field cannot work on a phone: horizontal
 * scroll on a wide table is an acceptable desktop fallback for a schema with
 * many fields and an unacceptable phone *default* - reaching Edit meant
 * scrolling sideways past every field first, on the one device where sideways
 * scrolling is easiest to trigger by accident and hardest to notice. Stacked
 * vertically instead, so nothing here is ever reached by scrolling sideways.
 */
function MobileEntryCard({ entry, schema, currentLangCode, at, orderIds, onReorder, onEdit, checked, onToggle }) {
    return (
        // A click anywhere that is not one of the card's own controls
        // toggles selection, the same as clicking the checkbox does - the
        // checkbox is a small target and the card around it is the "block"
        // the whole thing is meant to be tappable as. `clickedControl` is
        // what keeps Edit, the reorder arrows and the checkbox's own click
        // doing only their own job rather than also flipping the tick.
        <li
            onClick={(event) => { if (!clickedControl(event)) onToggle(); }}
            className="cursor-pointer rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong active:bg-surface-muted"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Checkbox
                        aria-label={t('Select entry :id', { id: entry.id })}
                        checked={checked}
                        onChange={onToggle}
                    />
                    <span className="font-medium text-fg">#{entry.id}</span>
                    <Badge tone={isPublished(entry) ? 'success' : 'warning'}>
                        {isPublished(entry) ? t('Published') : t('Draft')}
                    </Badge>
                </div>

                <RowActions entry={entry} at={at} orderIds={orderIds} onReorder={onReorder} onEdit={onEdit} />
            </div>

            {/* One line per field, label beside its value - not a two-column
                grid (a `col-span-2` rule for the wide fields earns its keep
                on a fixed-width table column but only left a gap here, next
                to whichever narrow field happened to land beside a wide one)
                and not the label stacked above the value either, which spent
                two lines on a fact most schemas answer in three or four
                words. `flex-wrap` lets a genuinely long value (a rich text
                excerpt, several photos) drop to its own line under the label
                rather than being squeezed. Created/Updated close the list
                unconditionally - every entry has both regardless of what its
                schema holds, unlike the fields above them. */}
            <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                {schema.map((field) => {
                    const { node } = fieldValue(field, entry, currentLangCode);

                    return <FieldRow key={field.name} label={field.name}>{node}</FieldRow>;
                })}
                <FieldRow label={t('Created')}>{formatDate(entry.created_at) ?? <Empty />}</FieldRow>
                <FieldRow label={t('Updated')}>{formatDate(entry.updated_at) ?? <Empty />}</FieldRow>
            </dl>
        </li>
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

    // Below this, the table gives way to a stack of cards (#133). The
    // fallback with no `matchMedia` (jsdom, an old embedded browser) is
    // `false` - the table - because it is the layout that keeps working
    // however wide the schema turns out to be, without JavaScript deciding
    // anything.
    const isNarrow = useMediaQuery('(max-width: 639px)');

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

            {/*
                Always on screen, not only once something is ticked. It
                previously appeared out of nowhere on the first tick and
                vanished on the last, a pop-in/pop-out the owner judged live
                and rejected outright - "δεν είναι ωραίο". Sitting here at
                rest with everything disabled and "0 selected" is what removes
                the jump: the row of buttons never appears or disappears,
                only its own enabled state changes, and `:count selected`
                already reads correctly at zero without a second string.
            */}
            <div
                className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 transition-colors ${
                    chosen > 0 ? 'border-accent/30 bg-accent-soft' : 'border-line bg-surface'
                }`}
            >
                {/* **The count is the live region, not the bar.** With the
                    role on the wrapper, every tick re-announced all four
                    control labels after the number - measured live, fifteen
                    rows read that whole string fifteen times and buried the
                    only thing that had changed. */}
                <span
                    role="status"
                    className={`text-sm font-semibold ${chosen > 0 ? 'text-accent-soft-fg' : 'text-fg-muted'}`}
                >
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
                        {/* A duplicate is a fresh `POST` carrying the
                            original's own `data` - see `bulk.js` for why
                            that needs the loaded entries rather than the
                            id alone. No confirmation: unlike delete,
                            nothing existing is touched. Disabled at zero
                            selected for the same reason Delete is - there is
                            nothing for either to act on. */}
                        <BulkButton
                            icon={Copy}
                            label={t('Copy selected')}
                            disabled={chosen === 0}
                            onClick={() => onBulkAction?.('copy', selected)}
                        />
                        <BulkButton
                            icon={Trash2}
                            label={t('Delete selected')}
                            tone="danger"
                            disabled={chosen === 0}
                            onClick={() => setConfirming(true)}
                        />
                        <button
                            type="button"
                            onClick={() => onSelectionChange?.([])}
                            disabled={chosen === 0}
                            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-accent-soft-fg underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline disabled:hover:no-underline"
                        >
                            {t('Clear selection')}
                        </button>
                    </span>
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
            ) : isNarrow ? (
                <div className="flex flex-col gap-3">
                    {/* The table's own header checkbox has no row of column
                        headings to sit inside of down here, so it gets one
                        line of its own instead of vanishing along with the
                        rest of the header. */}
                    <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-4 py-2.5">
                        {/* `aria-label` rather than leaning on the wrapping
                            `<label>` alone - measured live, a checkbox with a
                            sibling `<span>` inside its label read back with an
                            accessible name of "on" (the input's own default
                            `value`) rather than the label's text, in the exact
                            browser this panel ships to. */}
                        <PageCheckbox
                            aria-label={t('Select every entry on this page')}
                            checked={allSelected(selected, pageIds)}
                            indeterminate={someSelected(selected, pageIds)}
                            onChange={() => onSelectionChange?.(toggleAll(selected, pageIds))}
                        />
                        <span className="text-sm font-medium text-fg-muted" aria-hidden="true">
                            {t('Select every entry on this page')}
                        </span>
                    </label>

                    {/* `role="list"` because Tailwind's preflight resets
                        `list-style` to `none`, and Safari drops the implicit
                        list semantics the moment it does - Chrome and Firefox
                        do not, which is exactly how this kind of gap survives
                        unnoticed. */}
                    <ul role="list" className="flex flex-col gap-3">
                        {rows.map((entry) => (
                            <MobileEntryCard
                                key={entry.id}
                                entry={entry}
                                schema={schema}
                                currentLangCode={currentLangCode}
                                at={positionInOrder(orderIds, entry.id)}
                                orderIds={orderIds}
                                onReorder={onReorder}
                                onEdit={onEdit}
                                checked={selected.some((one) => String(one) === String(entry.id))}
                                onToggle={() => onSelectionChange?.(toggle(selected, entry.id))}
                            />
                        ))}
                    </ul>
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
                                <th scope="col" className="hidden px-4 py-3 font-semibold text-fg lg:table-cell">
                                    {t('Updated')}
                                </th>
                                {/* No column a sighted reader ever needed to
                                    read (#140) - the header the pinned
                                    version of this cell used to carry sat
                                    there for every row regardless of whether
                                    the reader was touching that one. Kept
                                    only so the table's own column count still
                                    matches the body, and only for a screen
                                    reader: `sr-only` rather than deleted. */}
                                <th scope="col" className="w-0 p-0">
                                    <span className="sr-only">{t('Actions')}</span>
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
                                    // A click anywhere in the row that is not
                                    // one of its own controls toggles
                                    // selection, the same as the checkbox
                                    // does - see `clickedControl`'s own
                                    // comment for why that does not also
                                    // double-toggle a click that landed on
                                    // the checkbox itself.
                                    <tr
                                        key={entry.id}
                                        onClick={(event) => {
                                            if (clickedControl(event)) return;
                                            onSelectionChange?.(toggle(selected, entry.id));
                                        }}
                                        // `relative` gives the floating actions
                                        // card below something to centre itself
                                        // against; `has-[:focus-visible]` tints
                                        // the row the same way `:hover` already
                                        // does, so tabbing to Edit reads the
                                        // same as pointing at it (#141).
                                        className="group relative cursor-pointer transition-colors hover:bg-surface-muted has-[:focus-visible]:bg-surface-muted"
                                    >
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

                                        <td className="hidden whitespace-nowrap px-4 py-3 text-fg-muted lg:table-cell">
                                            {formatDate(entry.updated_at) ?? <Empty />}
                                        </td>

                                        {/* No column of its own (#140) - a
                                            reader not touching this row saw a
                                            border's width of dead air at the
                                            end of every one. `w-0 p-0` claims
                                            none; what shows is a card,
                                            absolutely centred on the *row*
                                            (`position: relative` lives on the
                                            `<tr>` above, so this is free to sit
                                            in any cell and still centre
                                            against the row's own full width,
                                            not this one cell's sliver).
                                            Centred rather than pinned to the
                                            right edge (#141) - at ~1200px a
                                            handful of schema fields already
                                            push that edge into the scrollbar's
                                            own territory, clipping it. */}
                                        <td className="w-0 p-0">
                                            {/* `pointer-events-none` at rest so
                                                the invisible card cannot steal
                                                a click meant for whatever it
                                                floats over; `group-has-` uses
                                                `:focus-visible`, not plain
                                                `:focus`, because a *mouse*
                                                click on a button focuses it
                                                without matching
                                                `:focus-visible` in this
                                                browser family - a real bug
                                                otherwise (#141): clicking
                                                "Move up" left this card open
                                                on the row that had just moved
                                                away, while a second one opened
                                                on whatever row the reorder put
                                                under the cursor instead, and
                                                neither closed until an
                                                unrelated click stole focus.
                                                Keyboard `Tab` still matches
                                                `:focus-visible`, so reaching
                                                Edit that way reveals the card
                                                exactly as before. */}
                                            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 scale-90 items-center gap-1 rounded-xl border border-line bg-surface p-1 opacity-0 shadow-lg transition-[opacity,transform] duration-200 ease-out group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none">
                                                <RowActions entry={entry} at={at} orderIds={orderIds} onReorder={onReorder} onEdit={onEdit} />
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
