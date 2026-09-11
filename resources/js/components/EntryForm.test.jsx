// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntryForm from './EntryForm';

const post = vi.fn();
const put = vi.fn();

vi.mock('../lib/api', () => ({
    default: { post: (...args) => post(...args), put: (...args) => put(...args) },
    uploadImage: vi.fn(),
}));

vi.mock('./RichTextEditor', () => ({ default: () => <div data-testid="rich-text" /> }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true },
    { id: 2, code: 'en' },
];

const SCHEMA = [
    { name: 'sleeps', type: 'integer' },
    { name: 'title', type: 'string', translatable: true },
];

const draw = (props = {}) => render(
    <EntryForm moduleSlug="rooms" schema={SCHEMA} languages={LANGUAGES} {...props} />
);

const save = async (user) => user.click(screen.getByRole('button', { name: 'Save entry' }));

/** A 422 the way axios delivers one. */
const rejection = (errors) => {
    const err = new Error('Request failed with status code 422');
    err.response = { status: 422, data: { message: 'The given data was invalid.', errors } };
    return err;
};

beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: { id: 7, status: 'draft' } });
    put.mockReset().mockResolvedValue({ data: { id: 7, status: 'draft' } });
    // The form logs the rejection before showing it; the expected ones would
    // otherwise fill the run with stack traces.
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('EntryForm, creating', () => {
    it('sends a static field coerced to its type, and a translatable one as a map', async () => {
        const user = userEvent.setup();
        draw();

        await user.type(screen.getByLabelText('sleeps'), '4');
        await user.type(screen.getByLabelText(/title/), 'Suite');
        await save(user);

        expect(post).toHaveBeenCalledWith('/modules/rooms/entries', expect.objectContaining({
            // A number, not '4' - the integer rule rejects the string.
            data: { sleeps: 4, title: { el: '', en: 'Suite' } },
        }));
    });

    // Nothing to revert and the author has just chosen both, so both go.
    it('always sends the structural fields', async () => {
        const user = userEvent.setup();
        draw();

        await user.type(screen.getByLabelText('el'), 'souita');
        await save(user);

        const [, payload] = post.mock.calls[0];
        expect(payload.status).toBe('draft');
        expect(payload.slugs).toEqual({ el: 'souita' });
    });

    it('hands the saved entry back, because a create has to know where it landed', async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        draw({ onSaved });

        await save(user);

        await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 7, status: 'draft' }));
    });

    // The panel is in English here (`test/setup.js`), and the site has it, so
    // the form opens where the listing behind it already was (#116).
    it('opens on the panel’s own language when the site has it', () => {
        draw();

        expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    });
});

describe('EntryForm, editing', () => {
    const ENTRY = {
        id: 7,
        status: 'published',
        published_at: '2026-09-01T00:00:00Z',
        slugs: [{ language_code: 'el', slug: 'souita' }],
        data: { sleeps: 2, title: { el: 'Σουίτα', en: 'Suite' } },
    };

    it('fills the form from the entry it was given', () => {
        draw({ initialData: ENTRY });

        expect(screen.getByLabelText('sleeps')).toHaveValue(2);
        expect(screen.getByLabelText(/title/)).toHaveValue('Suite');
        expect(screen.getByLabelText('el')).toHaveValue('souita');
        expect(screen.getByRole('button', { name: 'Published' })).toHaveAttribute('aria-pressed', 'true');
    });

    /**
     * TASKS.md #86, and the same defect one field along.
     *
     * Both keys replace what is on the server, and the form holds what it
     * loaded when it opened - so resending an untouched one reverts whatever
     * happened meanwhile: an entry published from elsewhere goes back to draft,
     * and a language somebody else added loses its address.
     */
    it('omits status and slugs when the author touched neither', async () => {
        const user = userEvent.setup();
        draw({ initialData: ENTRY });

        await user.type(screen.getByLabelText(/title/), '!');
        await save(user);

        const [, payload] = put.mock.calls[0];
        expect(payload).not.toHaveProperty('status');
        expect(payload).not.toHaveProperty('slugs');
        expect(payload.data.title.en).toBe('Suite!');
    });

    it('sends status once it has been changed here', async () => {
        const user = userEvent.setup();
        draw({ initialData: ENTRY });

        await user.click(screen.getByRole('button', { name: 'Draft' }));
        await save(user);

        expect(put.mock.calls[0][1].status).toBe('draft');
    });

    it('sends the whole address set once one box has been edited', async () => {
        const user = userEvent.setup();
        draw({ initialData: ENTRY });

        await user.type(screen.getByLabelText('en'), 'suite');
        await save(user);

        expect(put.mock.calls[0][1].slugs).toEqual({ el: 'souita', en: 'suite' });
    });

    it('puts to the entry’s own address', async () => {
        const user = userEvent.setup();
        draw({ initialData: ENTRY });

        await user.click(screen.getByRole('button', { name: 'Draft' }));
        await save(user);

        expect(put).toHaveBeenCalledWith('/modules/rooms/entries/7', expect.anything());
        expect(post).not.toHaveBeenCalled();
    });
});

describe('EntryForm, when saving fails', () => {
    /**
     * The defect #96 fixed, pinned at the level that produced it.
     *
     * A required translation fails on a tab the author may not have open. The
     * message was rendered under whichever language *was* open - so the English
     * box was marked wrong because the Greek one was empty.
     */
    it('opens the language that actually failed', async () => {
        const user = userEvent.setup();
        post.mockRejectedValue(rejection({ 'data.title.el': ['The title field is required.'] }));
        draw();

        expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');

        await save(user);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^EL/ })).toHaveAttribute('aria-pressed', 'true');
        });
        expect(screen.getByText('The title field is required.')).toBeInTheDocument();
    });

    it('stays where it is when the open language is one of the failures', async () => {
        const user = userEvent.setup();
        post.mockRejectedValue(rejection({
            'data.title.el': ['Required.'],
            'data.title.en': ['Too long.'],
        }));
        draw();

        await save(user);

        await waitFor(() => expect(screen.getByText('Too long.')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /^EN/ })).toHaveAttribute('aria-pressed', 'true');
    });

    // Per-field messages are already beside their inputs; repeating them in the
    // banner says the same thing twice and buries what has no field at all.
    it('banners only what belongs to no field', async () => {
        const user = userEvent.setup();
        post.mockRejectedValue(rejection({
            'data.title.en': ['Too long.'],
            status: ['The selected status is invalid.'],
        }));
        draw();

        await save(user);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('The selected status is invalid.');
        expect(alert).not.toHaveTextContent('Too long.');
    });

    // A reason, not "failed". `errorSummary` knows why each of these could not
    // be saved, and the author can act on the difference between the two.
    it.each([
        ['the server was not reached', new Error('Network Error'),
            'Could not reach the server.'],
        ['the server broke', Object.assign(new Error('500'), { response: { status: 500, data: {} } }),
            'The server could not complete the request.'],
    ])('says what happened when %s', async (_label, err, expected) => {
        const user = userEvent.setup();
        post.mockRejectedValue(err);
        draw();

        await save(user);

        expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    });

    // It is re-enabled in `finally`, so a failed save can be retried. Leaving
    // it disabled would strand the author on a form they cannot submit.
    it('lets the author try again', async () => {
        const user = userEvent.setup();
        post.mockRejectedValue(new Error('Network Error'));
        draw();

        await save(user);

        await waitFor(() => expect(screen.getByRole('button', { name: 'Save entry' })).toBeEnabled());
    });
});
