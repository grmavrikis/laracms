// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntriesTable from './EntriesTable';

const SCHEMA = [{ name: 'title', type: 'string', translatable: true }];

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const ENTRIES = [
    { id: 11, status: 'published', created_at: '2026-09-01T10:00:00Z', data: { title: { el: 'Σουίτα', en: 'Suite' } } },
    { id: 12, status: 'draft', created_at: '2026-09-02T10:00:00Z', data: { title: { el: 'Στούντιο', en: 'Studio' } } },
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
    it('stays out of the way until something is ticked', () => {
        draw();

        expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
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
});
