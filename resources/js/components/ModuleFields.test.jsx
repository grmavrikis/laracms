// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleFields from './ModuleFields';
import { emptyField, fieldsFromSchema } from '../lib/moduleFields';

const draw = (fields, props = {}) => {
    const handlers = { onChange: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() };
    const result = render(<ModuleFields fields={fields} {...handlers} {...props} />);

    return { ...result, ...handlers };
};

/** One new row, as `ModuleBuilder` starts. */
const blank = (over = {}) => ({ ...emptyField(0), ...over });

/** The group for a row, which is how a reader tells four identical boxes apart. */
const row = (position) => screen.getByRole('group', { name: `Field ${position}` });

describe('ModuleFields, labelling', () => {
    /**
     * Every label in this component was `sm:hidden`, so above 640px there was
     * no label at all - four unnamed boxes in a row, with no column headings
     * either. On a telephone the labels rendered but carried no `htmlFor` and
     * the inputs no `id`, so they named nothing there either.
     */
    it.each(['Field name', 'Type', 'Validation'])('labels the %s box', (label) => {
        draw([blank()]);

        expect(within(row(1)).getByLabelText(label)).toBeInTheDocument();
    });

    // Four rows of identical controls; the position is the only thing that
    // tells a reader which field they are editing.
    it('groups each row and names it by position', () => {
        draw([blank(), { ...emptyField(1), name: 'sleeps' }]);

        expect(row(1)).toBeInTheDocument();
        expect(row(2)).toBeInTheDocument();
    });

    // `Lang` and `Req` say nothing to anybody who has not been told. The
    // shortened word can stay on screen; the accessible name cannot be it.
    it('names the two flags in words', () => {
        draw([blank()]);

        expect(within(row(1)).getByRole('checkbox', { name: /Translatable/ })).toBeInTheDocument();
        expect(within(row(1)).getByRole('checkbox', { name: /Required/ })).toBeInTheDocument();
    });

    it('labels a select’s options box, which had none at all', () => {
        draw([blank({ type: 'select' })]);

        expect(within(row(1)).getByLabelText('Options')).toBeInTheDocument();
    });

    it('names the remove control by the row it removes', () => {
        draw([blank(), blank({ _id: 1 })]);

        expect(screen.getByRole('button', { name: 'Remove field 2' })).toBeInTheDocument();
    });
});

describe('ModuleFields, a field that is already in the database', () => {
    const STORED = fieldsFromSchema([{ name: 'title', type: 'string', translatable: true }]);

    /**
     * #115: renaming, retyping, flipping `translatable` and removing all
     * reshape values already in `entries.data`, and nothing migrates them.
     */
    it.each(['Field name', 'Type'])('will not let %s be changed', (label) => {
        draw(STORED);

        expect(within(row(1)).getByLabelText(label)).toBeDisabled();
    });

    it('will not let it be made translatable or removed', () => {
        draw(STORED);

        expect(within(row(1)).getByRole('checkbox', { name: /Translatable/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Remove field 1' })).toBeDisabled();
    });

    /**
     * The reason lived in a `title` attribute on the disabled control - and a
     * disabled control takes no focus and fires no pointer events, so the
     * tooltip could be reached by neither keyboard nor hover. The person saw
     * four grayed-out boxes and nothing saying why.
     */
    it('says why, on the page rather than in a tooltip nobody can reach', () => {
        draw(STORED);

        expect(within(row(1)).getByText(/Entries have already been written/)).toBeInTheDocument();
    });

    // Everything else stays editable after the fact - that is what "additive"
    // means (#115).
    it('still allows validation and required to change', async () => {
        const user = userEvent.setup();
        const { onChange } = draw(STORED);

        await user.click(within(row(1)).getByRole('checkbox', { name: /Required/ }));

        expect(onChange).toHaveBeenCalledWith(0, 'required', true);
        expect(within(row(1)).getByLabelText('Validation')).toBeEnabled();
    });
});

describe('ModuleFields, a gallery', () => {
    // The photographs are one set for every language and only the alt text is
    // translated; `SchemaRuleBuilder` refuses the combination outright.
    it('cannot be translatable, and says so', () => {
        draw([blank({ type: 'gallery' })]);

        const box = within(row(1)).getByRole('checkbox', { name: /Translatable/ });

        expect(box).toBeDisabled();
        expect(within(row(1)).getByText(/only the alt text is translated/)).toBeInTheDocument();
    });
});

describe('ModuleFields, editing', () => {
    it('adds a row', async () => {
        const user = userEvent.setup();
        const { onAdd } = draw([blank()]);

        await user.click(screen.getByRole('button', { name: /Add field/ }));

        expect(onAdd).toHaveBeenCalled();
    });

    it('removes a row', async () => {
        const user = userEvent.setup();
        const { onRemove } = draw([blank(), blank({ _id: 1 })]);

        await user.click(screen.getByRole('button', { name: 'Remove field 2' }));

        expect(onRemove).toHaveBeenCalledWith(1);
    });

    // A module with no fields at all cannot hold anything.
    it('will not remove the only row', () => {
        draw([blank()]);

        expect(screen.getByRole('button', { name: 'Remove field 1' })).toBeDisabled();
    });

    it('reports a typed name against its own row', async () => {
        const user = userEvent.setup();
        const { onChange } = draw([blank(), blank({ _id: 7 })]);

        await user.type(within(row(2)).getByLabelText('Field name'), 'x');

        expect(onChange).toHaveBeenCalledWith(7, 'name', 'x');
    });

    // Which types exist is the backend's decision; the list is generated into
    // `fieldTypes.json` so the panel never restates a PHP constant.
    it('offers the generated type list', () => {
        draw([blank()]);

        const select = within(row(1)).getByLabelText('Type');

        expect(within(select).getByRole('option', { name: 'String' })).toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'Gallery' })).toBeInTheDocument();
    });

    it('shows the options box only for a select', () => {
        const { rerender } = render(
            <ModuleFields fields={[blank()]} onChange={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} />
        );

        expect(screen.queryByLabelText('Options')).not.toBeInTheDocument();

        rerender(
            <ModuleFields fields={[blank({ type: 'select' })]} onChange={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} />
        );

        expect(screen.getByLabelText('Options')).toBeInTheDocument();
    });
});
