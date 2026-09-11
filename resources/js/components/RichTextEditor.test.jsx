// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RichTextEditor from './RichTextEditor';

/**
 * jsdom lays nothing out, so it implements no geometry - and ProseMirror asks
 * for some on every transaction, through `scrollToSelection`. Unstubbed it
 * throws out of an event handler, which Vitest reports as an unhandled error
 * and warns may be producing false positives. Zeroes are the right answer: the
 * editor only uses them to decide how far to scroll, and nothing scrolls here.
 */
const EMPTY_RECT = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };

beforeAll(() => {
    Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
    Range.prototype.getBoundingClientRect = () => EMPTY_RECT;
    Text.prototype.getClientRects = () => Object.assign([], { item: () => null });
});

/** A Tiptap document holding one paragraph of text. */
const doc = (text) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

const draw = (props = {}) => {
    const onChange = vi.fn();
    const result = render(<RichTextEditor value={doc('Θέα στη θάλασσα')} onChange={onChange} {...props} />);

    return { ...result, onChange };
};

describe('RichTextEditor', () => {
    it('renders the document it was given', async () => {
        draw();

        await waitFor(() => expect(screen.getByText('Θέα στη θάλασσα')).toBeInTheDocument());
    });

    /**
     * Every control is an icon alone since #117 item 15, and an icon has no
     * accessible name of its own. The names are also what a sighted pointer
     * user reads in the tooltip - dropping the `title` while adding the
     * `aria-label` has already been a regression here once.
     */
    it.each([
        'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph',
        'Bold', 'Italic', 'Strikethrough', 'Highlight',
        'Left', 'Center', 'Right', 'Justify',
    ])('names its %s control, and gives it a tooltip', (name) => {
        draw();

        const button = screen.getByRole('button', { name });

        expect(button).toHaveAttribute('title', name);
    });

    /**
     * The active state was a background colour and nothing else, so whether the
     * selection is bold was information only a sighted reader had - the same
     * defect the language tabs carried before #117's review round.
     */
    it('says which controls are on, not only paints them', async () => {
        draw();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed'));
        expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
        // An ordinary paragraph is what the document opens on.
        expect(screen.getByRole('button', { name: 'Paragraph' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('reports the edited document as a tree, never as markup', async () => {
        const user = userEvent.setup();
        const { onChange } = draw();

        await waitFor(() => expect(screen.getByText('Θέα στη θάλασσα')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Heading 2' }));

        await waitFor(() => expect(onChange).toHaveBeenCalled());

        const document_ = onChange.mock.calls.at(-1)[0];
        expect(document_.type).toBe('doc');
        expect(document_.content[0].type).toBe('heading');
    });

    // The toolbar is a set of controls over one editor, not twelve unrelated
    // buttons scattered above a box.
    it('groups its controls and names the group', () => {
        draw();

        expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    });
});
