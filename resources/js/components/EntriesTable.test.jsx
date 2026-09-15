// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntriesTable from './EntriesTable';

/**
 * Below 640px the table gives way to a stack of cards (#133) - a table with
 * one column per schema field cannot work on a phone. jsdom implements no
 * `matchMedia` at all, so `useMediaQuery` answers `false` and the table
 * renders unless a test stubs it, exactly as `Sidebar.test.jsx` already does
 * for its own breakpoint.
 */
const stubNarrow = (isNarrow) => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: isNarrow,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
};

// File-scoped rather than nested in the one `describe` that first needed it:
// an `afterEach` inside a `describe` only cleans up after *that* block's own
// tests, so a stub left behind by its last test was free to leak into
// whichever describe came next in the file - silently switching that one
// from the table to the card, or the other way round, depending on file
// order rather than on what the test itself asked for.
afterEach(() => { delete window.matchMedia; });

const SCHEMA = [{ name: 'title', type: 'string', translatable: true }];

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const ENTRIES = [
    {
        id: 11,
        status: 'published',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-05T10:00:00Z',
        data: { title: { el: 'Σουίτα', en: 'Suite' } },
    },
    {
        id: 12,
        status: 'draft',
        created_at: '2026-09-02T10:00:00Z',
        updated_at: '2026-09-02T10:00:00Z',
        data: { title: { el: 'Στούντιο', en: 'Studio' } },
    },
];

const draw = (props = {}) => {
    const handlers = {
        onEdit: vi.fn(),
        onReorder: vi.fn(),
        onLanguageChange: vi.fn(),
        onPageChange: vi.fn(),
        onSelectionChange: vi.fn(),
    };
    const result = render(
        <EntriesTable
            schema={SCHEMA}
            entries={ENTRIES}
            orderIds={[11, 12]}
            languages={LANGUAGES}
            currentLangCode="el"
            selected={[]}
            {...handlers}
            {...props}
        />
    );

    return { ...result, ...handlers };
};

const rowFor = (id) => screen.getByRole('row', { name: new RegExp(`#${id}`) });
const cardFor = (id) => screen.getByText(`#${id}`).closest('li');

describe('EntriesTable, choosing rows', () => {
    // Each box is one of several identical controls in a column, so the row it
    // belongs to has to be part of its name.
    it('gives every row a box named by the entry it ticks', () => {
        draw();

        expect(screen.getByRole('checkbox', { name: 'Select entry 11' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Select entry 12' })).toBeInTheDocument();
    });

    it('reports a tick with the whole selection, not just the row', async () => {
        const user = userEvent.setup();
        const { onSelectionChange } = draw({ selected: [11] });

        await user.click(screen.getByRole('checkbox', { name: 'Select entry 12' }));

        expect(onSelectionChange).toHaveBeenCalledWith([11, 12]);
    });

    it('shows which rows are already ticked', () => {
        draw({ selected: [12] });

        expect(screen.getByRole('checkbox', { name: 'Select entry 11' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Select entry 12' })).toBeChecked();
    });

    /**
     * The header box speaks for **this page**. A module may hold four hundred
     * entries and the table fifteen, so "select all" that reached beyond what
     * the reader can see would make a bulk delete unanswerable.
     */
    it('ticks and clears the page from the header', async () => {
        const user = userEvent.setup();
        const { onSelectionChange, rerender } = draw();

        await user.click(screen.getByRole('checkbox', { name: 'Select every entry on this page' }));
        expect(onSelectionChange).toHaveBeenCalledWith([11, 12]);

        rerender(
            <EntriesTable
                schema={SCHEMA} entries={ENTRIES} orderIds={[11, 12]} languages={LANGUAGES}
                currentLangCode="el" selected={[11, 12]}
                onEdit={vi.fn()} onReorder={vi.fn()} onLanguageChange={vi.fn()}
                onPageChange={vi.fn()} onSelectionChange={onSelectionChange}
            />
        );

        await user.click(screen.getByRole('checkbox', { name: 'Select every entry on this page' }));
        expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    });

    // Part-ticked is a third state, and a box that merely looks empty tells the
    // reader the page is untouched when it is not.
    it('reports a part-ticked page as indeterminate', () => {
        const { container } = draw({ selected: [11] });

        expect(container.querySelector('input[type="checkbox"]').indeterminate).toBe(true);
    });

    it('is not indeterminate when the page is whole', () => {
        const { container, rerender } = render(
            <EntriesTable schema={SCHEMA} entries={ENTRIES} orderIds={[11, 12]} languages={LANGUAGES}
                currentLangCode="el" selected={[11, 12]} onEdit={vi.fn()} onReorder={vi.fn()}
                onLanguageChange={vi.fn()} onPageChange={vi.fn()} onSelectionChange={vi.fn()} />
        );

        expect(container.querySelector('input[type="checkbox"]').indeterminate).toBe(false);
        expect(container.querySelector('input[type="checkbox"]').checked).toBe(true);
    });
});

describe('EntriesTable, the bulk bar', () => {
    // It used to appear only once something was ticked and vanish on the
    // last box cleared - a pop-in/pop-out the owner saw live and rejected.
    // Always on screen now, at rest: the count reads zero and the two
    // controls that act on a selection have nothing to act on yet.
    it('stays on screen at rest, rather than appearing only once something is ticked', () => {
        draw();

        expect(screen.getByText('0 selected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Copy selected' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    });

    it('enables Copy, Delete and Clear the moment a row is ticked', () => {
        draw({ selected: [11] });

        expect(screen.getByRole('button', { name: 'Delete selected' })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: 'Copy selected' })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: 'Clear selection' })).not.toBeDisabled();
    });

    it('says how many rows the next action will touch', () => {
        draw({ selected: [11, 12] });

        expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('offers delete, publish and unpublish', () => {
        draw({ selected: [11] });

        expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Publish selected/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Unpublish selected/ })).toBeInTheDocument();
    });

    /**
     * **Publishing in bulk needs PHP, and this phase does not write any.**
     *
     * `SchemaRuleBuilder::build()` hard-codes `data` as `required`, and both
     * entry requests share it - so `PUT { status }` alone answers 422 with *The
     * data field is required*. Sending the whole document back instead would
     * re-post everything the listing happened to be holding, which is #86's
     * defect pointing the other way.
     *
     * Found by pressing the button against the real API. Twelve mutation checks
     * and 701 green tests all agreed it worked.
     */
    it.each(['Publish selected', 'Unpublish selected'])('leaves %s unusable rather than lying', (label) => {
        draw({ selected: [11, 12] });

        expect(screen.getByRole('button', { name: new RegExp(label) })).toBeDisabled();
    });

    // On both, and in each one's accessible name - a disabled control takes no
    // focus and fires no pointer events, so a tooltip on one is unreachable.
    it('says why the two publish controls do nothing', () => {
        draw({ selected: [11] });

        expect(screen.getAllByText(/not wired yet/i)).toHaveLength(2);
        expect(screen.getByRole('button', { name: /Publish selected/ }))
            .toHaveAccessibleName(expect.stringContaining('not wired yet'));
    });

    it('never asks for an action the API would refuse', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ selected: [11, 12], onBulkAction });

        await user.click(screen.getByRole('button', { name: /Publish selected/ }));
        await user.click(screen.getByRole('button', { name: /Unpublish selected/ }));

        expect(onBulkAction).not.toHaveBeenCalled();
    });

    /**
     * **Deleting is the exception, and it asks first.** It is the one
     * irreversible thing in the panel, it acts on rows the reader chose one at
     * a time, and a mis-click on a full page takes fifteen entries with it -
     * `EnquiriesManager` already asks before removing a single one.
     */
    it('does not delete on the first press', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ selected: [11, 12], onBulkAction });

        await user.click(screen.getByRole('button', { name: 'Delete selected' }));

        expect(onBulkAction).not.toHaveBeenCalled();
        expect(screen.getByText('Delete 2 entries permanently?')).toBeInTheDocument();
    });

    it('deletes once it has been confirmed', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ selected: [11, 12], onBulkAction });

        await user.click(screen.getByRole('button', { name: 'Delete selected' }));
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        expect(onBulkAction).toHaveBeenCalledWith('delete', [11, 12]);
    });

    it('lets the wrong press be taken back', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ selected: [11, 12], onBulkAction });

        await user.click(screen.getByRole('button', { name: 'Delete selected' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onBulkAction).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
    });

    /**
     * **Which rows, not how many.** Keyed on the count alone, a selection of
     * the same size but different rows kept the question open - so *Delete 2
     * entries permanently?* could be standing over a pair the reader never
     * chose, which a background refetch swapping a row produces.
     */
    it('drops the question when the rows change but the count does not', async () => {
        const user = userEvent.setup();
        const { rerender } = draw({ selected: [11, 12] });

        await user.click(screen.getByRole('button', { name: 'Delete selected' }));
        expect(screen.getByText('Delete 2 entries permanently?')).toBeInTheDocument();

        // Same size, different rows.
        rerender(
            <EntriesTable schema={SCHEMA} entries={ENTRIES} orderIds={[11, 12]} languages={LANGUAGES}
                currentLangCode="el" selected={[11, 99]} onEdit={vi.fn()} onReorder={vi.fn()}
                onLanguageChange={vi.fn()} onPageChange={vi.fn()} onSelectionChange={vi.fn()} onBulkAction={vi.fn()} />
        );

        expect(screen.queryByText(/permanently/)).not.toBeInTheDocument();
    });

    // Otherwise the question on screen names a number that no longer matches
    // what pressing Delete would take.
    it('drops the question when the selection changes underneath it', async () => {
        const user = userEvent.setup();
        const { rerender } = draw({ selected: [11, 12] });

        await user.click(screen.getByRole('button', { name: 'Delete selected' }));
        expect(screen.getByText('Delete 2 entries permanently?')).toBeInTheDocument();

        rerender(
            <EntriesTable schema={SCHEMA} entries={ENTRIES} orderIds={[11, 12]} languages={LANGUAGES}
                currentLangCode="el" selected={[11]} onEdit={vi.fn()} onReorder={vi.fn()}
                onLanguageChange={vi.fn()} onPageChange={vi.fn()} onSelectionChange={vi.fn()} onBulkAction={vi.fn()} />
        );

        expect(screen.queryByText(/permanently/)).not.toBeInTheDocument();
    });

    it('lets the selection be dropped', async () => {
        const user = userEvent.setup();
        const { onSelectionChange } = draw({ selected: [11] });

        await user.click(screen.getByRole('button', { name: 'Clear selection' }));

        expect(onSelectionChange).toHaveBeenCalledWith([]);
    });

    /**
     * **The count is the live region, not the bar.**
     *
     * With `role="status"` on the whole bar, every tick re-announced all four
     * control labels after the number - measured live, the region read
     * "2 selected / Publish selected / Unpublish selected / Delete selected /
     * Clear selection". Ticking a page of fifteen reads that fifteen times and
     * buries the only thing that changed.
     */
    it('announces the count, and only the count', () => {
        draw({ selected: [11] });

        const live = screen.getByRole('status');

        expect(live).toHaveTextContent('1 selected');
        expect(live.textContent).toBe('1 selected');
        expect(within(live).queryByRole('button')).not.toBeInTheDocument();
    });
});

/**
 * Sort and filter are drawn and **not wired**: `EntryController::index` takes a
 * page and nothing else, so a control that sorted only the fifteen rows on
 * screen would claim to order four hundred. Marked, per the rule at the top of
 * #117 and the same treatment as the dashboard's counts.
 */
describe('EntriesTable, what is not wired yet', () => {
    // Two greyed-out controls and a sample-data warning above "nothing has been
    // written here" is the first thing a client sees in a new section. The
    // empty state should be the only thing on the screen.
    it('offers nothing to sort when there is nothing to sort', () => {
        render(
            <EntriesTable schema={SCHEMA} entries={[]} orderIds={[]} languages={LANGUAGES}
                currentLangCode="el" selected={[]} onEdit={vi.fn()} onReorder={vi.fn()}
                onLanguageChange={vi.fn()} onPageChange={vi.fn()} onSelectionChange={vi.fn()} />
        );

        expect(screen.getByText('No entries yet')).toBeInTheDocument();
        expect(screen.queryByLabelText('Sort by')).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: /Sample data/ })).not.toBeInTheDocument();
    });

    it('keeps the sort and filter controls inside the marker', () => {
        draw();

        const marked = screen.getByRole('region', { name: /Sample data|not wired/i });

        expect(within(marked).getByLabelText('Sort by')).toBeInTheDocument();
        expect(within(marked).getByLabelText('Status')).toBeInTheDocument();
    });

    it('says plainly that they do nothing yet', () => {
        draw();

        expect(screen.getByText(/do not filter or sort anything yet/i)).toBeInTheDocument();
    });

    // Disabled, not merely decorative: a control that looks usable and silently
    // does nothing is the thing the marker exists to prevent.
    it('leaves them unusable rather than inert-looking', () => {
        draw();

        expect(screen.getByLabelText('Sort by')).toBeDisabled();
        expect(screen.getByLabelText('Status')).toBeDisabled();
    });
});

describe('EntriesTable, what was already there', () => {
    it('still lists the entries in the language on show', () => {
        draw();

        expect(within(rowFor(11)).getByText('Σουίτα')).toBeInTheDocument();
        expect(within(rowFor(12)).getByText('Στούντιο')).toBeInTheDocument();
    });

    it('still marks a draft apart from a published entry', () => {
        draw();

        expect(within(rowFor(11)).getByText('Published')).toBeInTheDocument();
        expect(within(rowFor(12)).getByText('Draft')).toBeInTheDocument();
    });

    it('still opens an entry for editing', async () => {
        const user = userEvent.setup();
        const { onEdit } = draw();

        await user.click(within(rowFor(11)).getByRole('button', { name: /Edit/ }));

        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
    });

    it('still reorders against the module, not the page', async () => {
        const user = userEvent.setup();
        const { onReorder } = draw();

        await user.click(within(rowFor(12)).getByRole('button', { name: /Move up/ }));

        expect(onReorder).toHaveBeenCalledWith([12, 11]);
    });

    // #133: the word beside the pencil was the widest thing forcing the
    // actions column to be pinned, and it said nothing the icon does not
    // already say once it is the only pencil in the row. Named per entry in
    // its accessible name instead, the same way the row's own checkbox is.
    it('names Edit by the entry rather than printing the word on every row', () => {
        draw();

        expect(within(rowFor(11)).getByRole('button', { name: 'Edit entry 11' })).toBeInTheDocument();
        expect(within(rowFor(11)).queryByText('Edit')).not.toBeInTheDocument();
    });
});

// Below 640px a table with one column per schema field cannot work - reaching
// Edit meant scrolling sideways past every field first, on the one device
// where that is easiest to trigger by accident (#133). Below that width the
// table gives way entirely to a stack of cards, so nothing is ever reached by
// scrolling sideways.
describe('EntriesTable, on a narrow screen', () => {
    it('lays entries out as cards instead of a table', () => {
        stubNarrow(true);
        draw();

        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('keeps every field readable without a row to hold it', () => {
        stubNarrow(true);
        draw();

        const card = within(cardFor(11));

        expect(card.getByText('title:')).toBeInTheDocument();
        expect(card.getByText('Σουίτα')).toBeInTheDocument();
        expect(card.getByText('Published')).toBeInTheDocument();
    });

    // A label stacked above its value spent two lines on a fact most schemas
    // answer in three or four words. JSDOM does not lay out a page, so this
    // asserts the flex/baseline classes that put them on one line rather than
    // an observed position.
    it('puts a field\'s label beside its value instead of stacking them', () => {
        stubNarrow(true);
        draw();

        const card = within(cardFor(11));
        const row = card.getByText('title:').closest('div');

        expect(row.className).toMatch(/\bflex\b/);
        expect(row.className).toMatch(/\bitems-baseline\b/);
        expect(within(row).getByText('Σουίτα')).toBeInTheDocument();
    });

    it('still edits and reorders from the card, with nothing to scroll past', async () => {
        stubNarrow(true);
        const user = userEvent.setup();
        const { onEdit, onReorder } = draw();

        await user.click(within(cardFor(12)).getByRole('button', { name: /Edit/ }));
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));

        await user.click(within(cardFor(12)).getByRole('button', { name: /Move up/ }));
        expect(onReorder).toHaveBeenCalledWith([12, 11]);
    });

    it('still selects a whole page from one control, without the table header row to hold it', async () => {
        stubNarrow(true);
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        await user.click(screen.getByRole('checkbox', { name: 'Select every entry on this page' }));

        expect(onSelectionChange).toHaveBeenCalledWith([11, 12]);
    });
});

// A module with several schema fields makes the table wide enough that a
// dedicated Actions column would ride off the right edge of the scroll box -
// reaching Edit meant scrolling across every field first (#132/#133). There
// is no such column any more (#140): reported live as a header and a cell
// that sat there for every row regardless of whether the reader was touching
// it. What a reader sees instead is a small card that floats *over* the row,
// centred rather than pinned to the right edge (#141 - at ~1200px the right
// edge sat too close to the scrollbar's own territory and clipped), hidden
// and un-clickable until the row is hovered or a control inside it takes
// keyboard focus. JSDOM does not lay out, scroll, or evaluate `:hover` or
// `:has()`, so these assert the classes that carry the behaviour rather than
// an observed position - the live check is in CHANGELOG.
describe('EntriesTable, the actions overlay', () => {
    // The floating card itself - one level above RowActions' own
    // `flex items-center gap-1` div, which carries no opinion of its own
    // about visibility.
    const overlayFor = (id) =>
        within(rowFor(id)).getByRole('button', { name: /Edit/ }).closest('div').parentElement;

    it('claims no width for the header cell, keeping the name for a screen reader only', () => {
        draw();

        const header = screen.getByRole('columnheader', { name: 'Actions' });

        expect(header.className).toMatch(/\bw-0\b/);
    });

    it('claims no width for the row\'s own cell either', () => {
        draw();

        const cell = within(rowFor(11)).getByRole('button', { name: /Edit/ }).closest('td');

        expect(cell.className).toMatch(/\bw-0\b/);
    });

    // #142 corrects #141: centring against the *row's* own width put the card
    // in the middle of content that might be scrolled half off-screen on a
    // wide schema - correct against the row, wrong against what the reader
    // is actually looking at.
    it('reads its horizontal position from a CSS variable, falling back to the row\'s own centre', () => {
        draw();

        const card = overlayFor(11);

        expect(card.className).toMatch(/\babsolute\b/);
        expect(card.className).toMatch(/left-\[var\(--action-center,50%\)\]/);
        expect(card.className).toMatch(/-translate-x-1\/2/);
        expect(card.className).toMatch(/\btop-1\/2\b/);
        expect(card.className).toMatch(/-translate-y-1\/2/);
    });

    /**
     * `syncActionCenter` writes that variable the moment a row is about to
     * be looked at - hovered, or a control inside it focused - rather than a
     * scroll listener kept running for every row all the time. `scrollLeft`
     * plus half of `clientWidth` is the scroll box's own visible centre, in
     * the row's coordinate space, which is exactly where the row's own
     * `left: var(--action-center)` needs it. JSDOM lays nothing out, so
     * `clientWidth` is stubbed the way a real, scrolled table would report
     * it.
     */
    it('centres on the scroll box\'s own visible width once the row is hovered', () => {
        const { container } = draw();

        const scrollBox = container.querySelector('.overflow-x-auto');

        Object.defineProperty(scrollBox, 'clientWidth', { value: 400, configurable: true });
        scrollBox.scrollLeft = 250;

        fireEvent.mouseEnter(rowFor(11));

        expect(rowFor(11).style.getPropertyValue('--action-center')).toBe('450px');
    });

    it('centres on the scroll box again once a control inside the row takes focus', () => {
        const { container } = draw();

        const scrollBox = container.querySelector('.overflow-x-auto');

        Object.defineProperty(scrollBox, 'clientWidth', { value: 600, configurable: true });
        scrollBox.scrollLeft = 100;

        fireEvent.focus(within(rowFor(11)).getByRole('button', { name: /Edit/ }));

        expect(rowFor(11).style.getPropertyValue('--action-center')).toBe('400px');
    });

    // #143: the caret drawn under the card to tie it back to its row sat
    // wrong whenever a row's own height didn't match the two-line guess it
    // was built against, and was dropped rather than chased further.
    it('draws no caret under the card', () => {
        draw();

        expect(overlayFor(11).querySelector('.rotate-45')).not.toBeInTheDocument();
    });

    // #143: colour, not a shape glued to one edge, is what now ties the card
    // to the row underneath it - it survives a row of any height, which a
    // caret measured from the card's own corner never did.
    it('tints the floating card\'s border with the accent colour', () => {
        draw();

        expect(overlayFor(11).className).toMatch(/border-accent\//);
    });

    /**
     * #144: a flat single-colour fill read as a sticker laid on top of the
     * row rather than a small raised object above it. A top-to-bottom
     * gradient plus a layered contact/ambient shadow (rather than one
     * uniform blur) is what a genuinely raised surface looks like - a single
     * `shadow-lg` is a soft halo, not a lift.
     */
    it('gives the card a gradient fill and a layered shadow for a raised, three-dimensional look', () => {
        draw();

        const card = overlayFor(11);

        expect(card.className).toMatch(/bg-gradient-to-b/);
        expect(card.className).toMatch(/from-surface\b/);
        expect(card.className).toMatch(/to-surface-muted\b/);
        // Three layers, not one - two neutral contact shadows close to the
        // surface plus an ambient one tinted with the accent colour is the
        // actual difference between "flat with a blur" and "lifted". The
        // tint is a literal `color-mix()`, not a `shadow-<color>` utility -
        // Tailwind rewrites every colour inside an arbitrary `shadow-[...]`
        // to read `--tw-shadow-color` once one of those is present, which
        // would have erased the two contact layers' own literal alphas too.
        expect(card.className).toMatch(/0_1px_1px_rgba\(0,0,0,0\.06\)/);
        expect(card.className).toMatch(/0_4px_8px_rgba\(0,0,0,0\.1\d?\)/);
        expect(card.className).toMatch(/color-mix\(in_oklab,var\(--color-accent\)/);
        expect(card.className).not.toMatch(/\bshadow-accent\//);
    });

    // The row's one primary action among several neutral ones (#143) - a
    // little colour, asked for by name, rather than every icon reading the
    // same shade of grey.
    it('gives Edit a touch of accent colour as the row\'s primary action', () => {
        draw();

        const edit = within(rowFor(11)).getByRole('button', { name: /Edit/ });

        expect(edit.className).toMatch(/text-accent-text/);
    });

    // Four icons in an undifferentiated row read as clutter; grouping
    // reordering apart from Preview/Edit was asked for by name (#142).
    it('separates the reorder arrows from Preview and Edit with a visual divider', () => {
        draw();

        const actions = within(rowFor(11)).getByRole('button', { name: /Move up/ }).parentElement;
        const divider = actions.querySelector('span[aria-hidden="true"].bg-line');

        expect(divider).toBeInTheDocument();
    });

    it('keeps the floating card hidden and un-clickable until the row is hovered or focused', () => {
        draw();

        const card = overlayFor(11);

        expect(card.className).toMatch(/\bopacity-0\b/);
        expect(card.className).toMatch(/\bpointer-events-none\b/);
        expect(card.className).toMatch(/group-hover:opacity-100/);
        expect(card.className).toMatch(/group-hover:pointer-events-auto/);
        expect(card.className).toMatch(/group-has-\[:focus-visible\]:opacity-100/);
        expect(card.className).toMatch(/group-has-\[:focus-visible\]:pointer-events-auto/);
    });

    /**
     * **The bug a reorder click used to cause (#141).** Clicking "Move up"/
     * "Move down" focuses the button *and* moves its row - the DOM node
     * React reuses for that entry (keyed on `entry.id`) relocates, but focus
     * does not follow it visually, so the card stayed revealed on the row
     * that had just moved away while a second one opened, from a genuine
     * `:hover`, on whichever row the reorder put under the cursor instead.
     * Only clearing focus - by clicking anywhere else - closed the stuck one.
     *
     * `:focus-within` cannot tell a keyboard tab from a mouse click; the fix
     * is the trigger that can, so this pins it down rather than only pinning
     * the symptom.
     */
    it('reveals on a keyboard-focus-visible descendant, not on any focus at all', () => {
        draw();

        const card = overlayFor(11);

        expect(card.className).not.toMatch(/focus-within/);
    });

    // State-clarity: a keyboard user tabbing into Edit should see the same
    // row highlight a mouse hovering it produces, not just the floating card
    // with no context for where it belongs.
    it('tints the whole row the same way for a hover and for a keyboard-focused control inside it', () => {
        draw();

        const row = rowFor(11);

        expect(row.className).toMatch(/hover:bg-surface-muted\b/);
        expect(row.className).toMatch(/has-\[:focus-visible\]:bg-surface-muted\b/);
    });

    // A touch screen has no hover state to reveal it with, so hiding the
    // narrow card's actions the same way would put Edit and the reorder
    // arrows behind a gesture a phone cannot make. It keeps them shown
    // plainly, exactly as it always has.
    it('leaves the narrow card\'s actions shown plainly, since touch has no hover', () => {
        stubNarrow(true);
        draw();

        const actions = within(cardFor(11)).getByRole('button', { name: /Edit/ }).closest('div');

        expect(actions.className).not.toMatch(/opacity-0/);
    });
});

// Reported live: the table showed one date with no way to tell whether it was
// when the entry was written or when it was last touched, and only one of the
// two was shown at all.
describe('EntriesTable, Created and Updated', () => {
    it('names both dates in the table, each under its own column', () => {
        draw();

        expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument();
        expect(within(rowFor(11)).getByText('Sep 1, 2026')).toBeInTheDocument();
        expect(within(rowFor(11)).getByText('Sep 5, 2026')).toBeInTheDocument();
    });

    // The narrow card has no column headers to carry the label - #135's own
    // fix for a schema field applies here too, since a bare date is exactly
    // as unlabelled as a bare value was.
    it('labels both dates on the narrow card', () => {
        stubNarrow(true);
        draw();

        const card = within(cardFor(11));

        expect(card.getByText('Created:')).toBeInTheDocument();
        expect(card.getByText('Updated:')).toBeInTheDocument();
        expect(card.getByText('Sep 1, 2026')).toBeInTheDocument();
        expect(card.getByText('Sep 5, 2026')).toBeInTheDocument();
    });
});

// #136: opening the public page needs that page's own address, and the
// entries list has no way to know it yet - `EntryController::index` never
// loads `slugs`. Drawn so the shape of the row is right, disabled and
// explained so pressing it promises nothing the panel cannot do.
describe('EntriesTable, the Preview control', () => {
    /**
     * **No longer `disabled` (#143).** A disabled control does not reliably
     * fire the hover that reveals its own `title` - the same reasoning
     * `BulkButton`'s own comment already gives for putting the reason in the
     * accessible name rather than trusting a tooltip - so the explanation
     * this button carries was, in practice, hard to ever see. It reads and
     * behaves like every other action now; the label is still the one place
     * that says it does not go anywhere yet.
     */
    it('is drawn next to Edit, not disabled, and still says it goes nowhere yet', () => {
        draw();

        const preview = within(rowFor(11)).getByRole('button', { name: /Preview/ });

        expect(preview).not.toBeDisabled();
        expect(preview).toHaveAccessibleName(expect.stringContaining('not wired yet'));
    });

    it('is drawn on the narrow card too, and not disabled there either', () => {
        stubNarrow(true);
        draw();

        expect(within(cardFor(11)).getByRole('button', { name: /Preview/ })).not.toBeDisabled();
    });

    // Enabled now, it is a real button in the row's click-guard's path -
    // clicking it must still do only nothing, not also toggle the row the
    // way clicking empty space beside it would.
    it('does nothing when clicked, since it has nowhere to go yet', async () => {
        const user = userEvent.setup();
        const { onEdit, onSelectionChange } = draw();

        await user.click(within(rowFor(11)).getByRole('button', { name: /Preview/ }));

        expect(onEdit).not.toHaveBeenCalled();
        expect(onSelectionChange).not.toHaveBeenCalled();
    });
});

describe('EntriesTable, copying entries', () => {
    it('offers Copy selected alongside Delete, and it is not disabled', () => {
        draw({ selected: [11] });

        const copy = screen.getByRole('button', { name: 'Copy selected' });

        expect(copy).toBeInTheDocument();
        expect(copy).not.toBeDisabled();
    });

    // Unlike delete, nothing existing is touched by a copy - so it fires at
    // once rather than asking first.
    it('fires immediately, with no confirmation step', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ selected: [11, 12], onBulkAction });

        await user.click(screen.getByRole('button', { name: 'Copy selected' }));

        expect(onBulkAction).toHaveBeenCalledWith('copy', [11, 12]);
    });
});

/**
 * Discussed live: duplicating one entry from its own row, without first
 * ticking its checkbox and reaching the bulk bar above the table. Delete
 * stays bulk-only - it is the one irreversible action in the panel and
 * would need its own confirmation step, deliberately not built here.
 *
 * Reuses `onBulkAction` rather than a new callback: `bulkRequest('copy', ...)`
 * already looks the entry up by id in the screen's own loaded list
 * (`resources/js/screens/bulk.js`), and a row's own `entry` is, by
 * definition, already in that list.
 */
describe('EntriesTable, copying a single entry from its own row', () => {
    it('offers Copy next to Edit, named by the entry', () => {
        draw();

        expect(within(rowFor(11)).getByRole('button', { name: 'Copy entry 11' })).toBeInTheDocument();
    });

    // #146: ordered by name, after the reorder arrows - Copy, Preview, Edit,
    // Edit last so it is the one the reader's eye lands on.
    it('places Copy, then Preview, then Edit, in that order', () => {
        draw();

        const names = within(rowFor(11)).getAllByRole('button')
            .map((button) => button.getAttribute('aria-label'))
            .filter((label) => /^(Copy|Preview|Edit)\b/.test(label));

        expect(names).toEqual([
            'Copy entry 11',
            'Preview — not wired yet',
            'Edit entry 11',
        ]);
    });

    it('fires immediately, scoped to just that one entry', async () => {
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ onBulkAction });

        await user.click(within(rowFor(11)).getByRole('button', { name: 'Copy entry 11' }));

        expect(onBulkAction).toHaveBeenCalledWith('copy', [11]);
    });

    // A click on any of the row's own controls must keep doing only its own
    // job - the same guard every other button in the row already relies on.
    it('does not also toggle the row\'s own selection', async () => {
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        await user.click(within(rowFor(11)).getByRole('button', { name: 'Copy entry 11' }));

        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('is offered on the narrow card too, and fires the same way', async () => {
        stubNarrow(true);
        const user = userEvent.setup();
        const onBulkAction = vi.fn();
        draw({ onBulkAction });

        await user.click(within(cardFor(12)).getByRole('button', { name: 'Copy entry 12' }));

        expect(onBulkAction).toHaveBeenCalledWith('copy', [12]);
    });
});

// The checkbox is a small target; the row (desktop) or the card (mobile)
// around it is the "block" it was reported that a click should work from
// anywhere in.
describe('EntriesTable, clicking the row or card to select it', () => {
    it('toggles selection from a click anywhere in the row that is not a control', async () => {
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        // The cell holding the entry's own title - not the checkbox, not a
        // button.
        await user.click(within(rowFor(11)).getByText('Σουίτα'));

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith([11]);
    });

    // A click that lands on the checkbox must not *also* fire the row's own
    // handler - that would toggle it twice and cancel itself out.
    it('does not double-toggle when the click lands on the checkbox itself', async () => {
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        await user.click(screen.getByRole('checkbox', { name: 'Select entry 11' }));

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith([11]);
    });

    // Nor when it lands on Edit or a reorder arrow - each keeps doing only
    // its own job.
    it('does not toggle selection when the click opens the entry for editing', async () => {
        const user = userEvent.setup();
        const { onEdit, onSelectionChange } = draw();

        await user.click(within(rowFor(11)).getByRole('button', { name: /Edit/ }));

        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('toggles selection from a click anywhere on the narrow card that is not a control', async () => {
        stubNarrow(true);
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        await user.click(within(cardFor(12)).getByText('Στούντιο'));

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith([12]);
    });

    it('does not double-toggle a narrow card from a click on its own checkbox', async () => {
        stubNarrow(true);
        const user = userEvent.setup();
        const { onSelectionChange } = draw();

        await user.click(within(cardFor(12)).getByRole('checkbox', { name: 'Select entry 12' }));

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange).toHaveBeenCalledWith([12]);
    });
});
