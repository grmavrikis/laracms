// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { uploadImage } from '../../lib/api';
import { emptyDoc } from '../../lib/richText';
import FieldInput from './FieldInput';

vi.mock('../../lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
    uploadImage: vi.fn(),
}));

// Tiptap wants a real editing surface and this file is about the *branch* that
// picks a control, not about the editor - which `RichTextEditor` and the
// document helpers already cover.
vi.mock('../RichTextEditor', () => ({
    default: ({ value }) => <div data-testid="rich-text">{JSON.stringify(value)}</div>,
}));

const LANGUAGES = [{ id: 1, code: 'el' }, { id: 2, code: 'en' }];

const draw = (field, { value = '', onChange = vi.fn(), onError = vi.fn() } = {}) => {
    const { container } = render(
        <FieldInput field={field} value={value} onChange={onChange} languages={LANGUAGES} onError={onError} />
    );

    // A file input carries no accessible name of its own, so it is reached
    // through the container rather than by role.
    const file = () => container.querySelector('input[type="file"]');

    return { onChange, onError, container, file };
};

describe('FieldInput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // The criterion for #117 item 13 is that every field type still works, so
    // every arm of the branch has a test rather than the two or three that are
    // easy to reach.
    it('draws a text box for a string', async () => {
        const user = userEvent.setup();
        const { onChange } = draw({ name: 'title', type: 'string' });

        const box = screen.getByRole('textbox');
        expect(box).toHaveAttribute('type', 'text');

        await user.type(box, 'Suite');

        expect(onChange).toHaveBeenCalled();
    });

    it('draws a number box for an integer', () => {
        draw({ name: 'sleeps', type: 'integer' });

        expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number');
    });

    it('draws a date box for a date', () => {
        const { container } = render(
            <FieldInput field={{ name: 'from', type: 'date' }} value="2026-09-11" onChange={vi.fn()} />
        );

        expect(container.querySelector('input[type="date"]')).toHaveValue('2026-09-11');
    });

    it('draws a checkbox for a boolean, with a label that focuses it', async () => {
        const user = userEvent.setup();
        const { onChange } = draw({ name: 'featured', type: 'boolean' }, { value: false });

        await user.click(screen.getByLabelText('Enable this field'));

        expect(onChange).toHaveBeenCalledWith(true);
    });

    describe('a select', () => {
        it('offers the schema’s options', () => {
            draw({ name: 'size', type: 'select', options: ['single', 'double'] });

            expect(screen.getByRole('option', { name: 'single' })).toBeInTheDocument();
            expect(screen.getByRole('option', { name: 'double' })).toBeInTheDocument();
        });

        // A stored option may be `{value, label}` rather than a bare string -
        // `moduleFields.js` keeps both shapes alive through a round trip.
        it('accepts an option that is an object', () => {
            draw({ name: 'size', type: 'select', options: [{ value: 's', label: 'Small' }] });

            expect(screen.getByRole('option', { name: 'Small' })).toHaveValue('s');
        });

        // Was the literal `-- Select Option --`, outside `t()`, so no test
        // demanded it and a Greek panel read English in every select.
        it('names its empty choice through the catalogue', () => {
            draw({ name: 'size', type: 'select', options: [] });

            expect(screen.getByRole('option', { name: 'Choose an option' })).toHaveValue('');
        });

        it('survives a schema whose options are missing', () => {
            expect(() => draw({ name: 'size', type: 'select' })).not.toThrow();
        });
    });

    describe('an image', () => {
        it('uploads the chosen file and reports the URL back', async () => {
            const user = userEvent.setup();
            uploadImage.mockResolvedValue('/storage/room.jpg');
            const { onChange, file } = draw({ name: 'photo', type: 'image' });

            await user.upload(file(), new File(['x'], 'room.jpg', { type: 'image/jpeg' }));

            expect(uploadImage).toHaveBeenCalled();
            expect(onChange).toHaveBeenCalledWith('/storage/room.jpg');
        });

        // The endpoint refuses by type and by size, and those reasons are worth
        // showing rather than being replaced with "failed".
        it('reports why an upload was refused', async () => {
            const user = userEvent.setup();
            uploadImage.mockRejectedValue({
                response: { status: 422, data: { errors: { image: ['The image must be a JPEG.'] } } },
            });
            const { onError, onChange, file } = draw({ name: 'photo', type: 'image' });

            await user.upload(file(), new File(['x'], 'room.gif', { type: 'image/gif' }));

            expect(onError).toHaveBeenCalledWith(['The image must be a JPEG.']);
            expect(onChange).not.toHaveBeenCalled();
        });

        it('shows a preview with a way to clear it', async () => {
            const user = userEvent.setup();
            const { onChange } = draw({ name: 'photo', type: 'image' }, { value: '/storage/room.jpg' });

            expect(screen.getByRole('img')).toHaveAttribute('src', '/storage/room.jpg');

            await user.click(screen.getByRole('button', { name: 'Remove image' }));

            expect(onChange).toHaveBeenCalledWith('');
        });
    });

    it('draws the rich-text editor for a text field', () => {
        draw({ name: 'description', type: 'text' }, { value: emptyDoc() });

        expect(screen.getByTestId('rich-text')).toBeInTheDocument();
    });

    it('draws the gallery editor for a gallery, and hands it the languages', () => {
        const { file } = draw({ name: 'photos', type: 'gallery' }, { value: [] });

        // The gallery gives every image an alt box per language (#114's
        // sibling decision), and it accepts several files at once.
        expect(file()).toBeInTheDocument();
        expect(file()).toHaveAttribute('multiple');
    });

    // `value` arrives as null for a field nobody has filled, and React turns a
    // null `value` on an input into an uncontrolled one - which then warns and
    // stops tracking what is typed.
    it('treats a missing value as empty rather than uncontrolled', () => {
        const { container } = render(
            <FieldInput field={{ name: 'title', type: 'string' }} value={null} onChange={vi.fn()} />
        );

        expect(container.querySelector('input')).toHaveValue('');
    });
});
