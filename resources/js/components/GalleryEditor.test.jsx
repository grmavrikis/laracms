// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GalleryEditor from './GalleryEditor';

const uploadImage = vi.fn();

vi.mock('../lib/api', () => ({ default: {}, uploadImage: (...args) => uploadImage(...args) }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true },
    { id: 2, code: 'en' },
];

const IMAGES = [
    { url: '/storage/sea.jpg', alt: { el: 'Θάλασσα', en: 'Sea' } },
    { url: '/storage/room.jpg', alt: {} },
];

const draw = (props = {}) => {
    const onChange = vi.fn();
    const result = render(
        <GalleryEditor value={IMAGES} onChange={onChange} languages={LANGUAGES} {...props} />
    );

    return { ...result, onChange };
};

/** The gallery's file input, which takes several at once. */
const fileBox = (container) => container.querySelector('input[type="file"]');

beforeEach(() => {
    uploadImage.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GalleryEditor, empty', () => {
    it('says so rather than showing an empty list', () => {
        render(<GalleryEditor value={[]} onChange={vi.fn()} languages={LANGUAGES} />);

        expect(screen.getByText('No images yet.')).toBeInTheDocument();
    });

    // A bare file input is announced as "button" and nothing else; the field
    // name above belongs to the group, not to this control.
    it('names its file control', () => {
        render(<GalleryEditor value={[]} onChange={vi.fn()} languages={LANGUAGES} />);

        expect(screen.getByLabelText('Add images')).toHaveAttribute('type', 'file');
    });
});

describe('GalleryEditor, alt text', () => {
    /**
     * The owner asked for this by name: *"here I do not see the photos have a
     * little text, we want it for the alt text"*.
     *
     * Alt text is edited per language **here** rather than under the form's
     * language tabs, because a gallery is not translatable: the photographs are
     * one set and only their description differs.
     */
    it('offers one box per language, per image', () => {
        draw();

        expect(screen.getAllByRole('textbox')).toHaveLength(4);
    });

    // Two images, two languages, four boxes that all look alike: a reader
    // tabbing into one has to be told which photograph it belongs to, and the
    // position is the only thing that identifies it.
    it('says which image a box belongs to, and in which language', () => {
        draw();

        const second = screen.getByRole('group', { name: 'Image 2' });

        expect(within(second).getByLabelText('el')).toHaveValue('');
        expect(within(second).getByLabelText('en')).toHaveValue('');
    });

    it('shows the alt text already stored', () => {
        draw();

        const first = screen.getByRole('group', { name: 'Image 1' });

        expect(within(first).getByLabelText('el')).toHaveValue('Θάλασσα');
        expect(within(first).getByLabelText('en')).toHaveValue('Sea');
    });

    it('reports an edit against its own image and language', async () => {
        const user = userEvent.setup();
        const { onChange } = draw();

        const second = screen.getByRole('group', { name: 'Image 2' });
        await user.type(within(second).getByLabelText('en'), 'B');

        expect(onChange).toHaveBeenCalledWith([
            IMAGES[0],
            { url: '/storage/room.jpg', alt: { en: 'B' } },
        ]);
    });

    // The box beside it holds the description; announcing the filename twice
    // would be noise.
    it('leaves the thumbnail decorative', () => {
        const { container } = draw();

        container.querySelectorAll('img').forEach((img) => {
            expect(img).toHaveAttribute('alt', '');
        });
    });
});

describe('GalleryEditor, order', () => {
    it('names its controls, since each is an icon alone', () => {
        draw();

        expect(screen.getAllByRole('button', { name: /Move image 1 down/ })).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeInTheDocument();
    });

    it('will not move the first image up or the last down', () => {
        draw();

        expect(screen.getByRole('button', { name: 'Move image 1 up' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move image 2 down' })).toBeDisabled();
    });

    it('moves an image and hands back the whole list', async () => {
        const user = userEvent.setup();
        const { onChange } = draw();

        await user.click(screen.getByRole('button', { name: 'Move image 2 up' }));

        expect(onChange).toHaveBeenCalledWith([IMAGES[1], IMAGES[0]]);
    });

    it('removes an image', async () => {
        const user = userEvent.setup();
        const { onChange } = draw();

        await user.click(screen.getByRole('button', { name: 'Remove image 1' }));

        expect(onChange).toHaveBeenCalledWith([IMAGES[1]]);
    });
});

describe('GalleryEditor, uploading', () => {
    const choose = async (user, container, ...names) => {
        const files = names.map((name) => new File(['x'], name, { type: 'image/jpeg' }));

        await user.upload(fileBox(container), files);
    };

    it('appends what uploaded, computed from the list as it stands', async () => {
        const user = userEvent.setup();
        uploadImage.mockResolvedValue('/storage/new.jpg');
        const { container, onChange } = draw();

        await choose(user, container, 'new.jpg');

        // A function, not a value: uploading fifteen photographs leaves a wide
        // window in which the author removes one or types alt text, and
        // computing from the captured list would quietly undo all of it.
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.any(Function)));
        expect(onChange.mock.calls[0][0](IMAGES)).toEqual([
            ...IMAGES,
            { url: '/storage/new.jpg', alt: {} },
        ]);
    });

    /**
     * `allSettled`, not `all`. One rejected upload would otherwise discard
     * every file that succeeded beside it - and uploading a folder of holiday
     * photographs is the intended use, so one being too large is ordinary.
     */
    it('keeps what succeeded when one file is refused', async () => {
        const user = userEvent.setup();
        const refused = new Error('Request failed with status code 422');
        refused.response = { status: 422, data: { errors: { image: ['The image may not be larger than 4 MB.'] } } };
        uploadImage
            .mockResolvedValueOnce('/storage/good.jpg')
            .mockRejectedValueOnce(refused);
        const onError = vi.fn();
        const { container, onChange } = draw({ onError });

        await choose(user, container, 'good.jpg', 'huge.jpg');

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.calls[0][0]([])).toEqual([{ url: '/storage/good.jpg', alt: {} }]);

        // The endpoint refuses by type and by size, and those reasons are worth
        // showing rather than replacing with "failed".
        expect(onError).toHaveBeenCalledWith(['The image may not be larger than 4 MB.']);
    });

    it('says it is working, and stops saying so', async () => {
        const user = userEvent.setup();
        let settle;
        uploadImage.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
        const { container } = draw();

        await choose(user, container, 'slow.jpg');

        expect(screen.getByText('Uploading…')).toBeInTheDocument();
        expect(fileBox(container)).toBeDisabled();

        settle('/storage/slow.jpg');

        await waitFor(() => expect(screen.queryByText('Uploading…')).not.toBeInTheDocument());
        expect(fileBox(container)).toBeEnabled();
    });
});
