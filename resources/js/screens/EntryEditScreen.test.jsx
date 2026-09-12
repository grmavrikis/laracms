// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../lib/api';
import { forgetLanguages } from '../lib/languageStore';
import { RouterProvider } from '../hooks/useRoute';
import EntryEditScreen from './EntryEditScreen';

vi.mock('../lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
    uploadImage: vi.fn(),
}));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const module_ = {
    slug: 'rooms',
    name: 'Rooms',
    is_singleton: false,
    schema: [{ name: 'title', type: 'string', translatable: true, required: true }],
};

const ENTRY = {
    id: 7,
    data: { title: { el: 'Σουίτα', en: 'Suite' } },
    status: 'draft',
    slugs: [],
};

/** `deferred` lets a test hold a request open and assert what is on screen. */
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });

    return { promise, resolve };
};

const at = (path) => window.history.replaceState({}, '', path);

const mount = (props, path = '/admin/content/rooms/7') => {
    at(path);

    return render(<RouterProvider><EntryEditScreen module={module_} {...props} /></RouterProvider>);
};

describe('EntryEditScreen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        forgetLanguages();
        at('/admin');
    });

    afterEach(() => {
        at('/admin');
    });

    /**
     * The guard this screen exists for.
     *
     * `EntryForm` seeds its state in `useState` initialisers from `initialData`,
     * so mounting it before the entry lands does not merely show a blank form -
     * it *captures* blank as the entry's content, and the first save writes
     * that over whatever was there. A deep link is precisely the case that
     * would do it.
     */
    it('renders no form until the entry has arrived', async () => {
        const entry = deferred();
        api.get.mockImplementation((url) =>
            url === '/languages' ? Promise.resolve({ data: LANGUAGES }) : entry.promise);

        mount({ entryId: 7 });

        // Languages have landed; the entry has not.
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/modules/rooms/entries/7'));
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('Loading…')).toBeInTheDocument();

        entry.resolve({ data: ENTRY });

        expect(await screen.findByDisplayValue('Suite')).toBeInTheDocument();
    });

    it('renders no form until the languages have arrived', async () => {
        const languages = deferred();
        api.get.mockImplementation((url) =>
            url === '/languages' ? languages.promise : Promise.resolve({ data: ENTRY }));

        mount({ entryId: 7 });

        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/modules/rooms/entries/7'));
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        languages.resolve({ data: LANGUAGES });

        expect(await screen.findByDisplayValue('Suite')).toBeInTheDocument();
    });

    it('opens a blank form for a create, without asking for an entry', async () => {
        api.get.mockResolvedValue({ data: LANGUAGES });

        mount({ entryId: null }, '/admin/content/rooms/new');

        expect(await screen.findByText('New entry')).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/entries/'));
    });

    // The module's own name is what says which section is open - the collapsed
    // rail drops it to an icon, so this heading is the only place left saying
    // so. "New entry" / "Edit entry" is the mode, not the location, and had
    // been sitting in the big bold heading with the module's name shrunk under
    // it as the description - backwards from every other screen in the panel.
    it('gives the module its own name the main heading, not the mode', async () => {
        api.get.mockResolvedValue({ data: LANGUAGES });

        mount({ entryId: null }, '/admin/content/rooms/new');

        expect(await screen.findByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'New entry' })).not.toBeInTheDocument();
    });

    // The other half of the page-carrying fix: the listing puts the page on
    // this screen's address, and returning has to put it back.
    it('returns to the page the reader came from', async () => {
        const user = userEvent.setup();
        api.get.mockImplementation((url) =>
            url === '/languages' ? Promise.resolve({ data: LANGUAGES }) : Promise.resolve({ data: ENTRY }));

        mount({ entryId: 7 }, '/admin/content/rooms/7?page=2');

        await user.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(window.location.pathname + window.location.search)
            .toBe('/admin/content/rooms?page=2');
    });

    it('returns to the plain listing when it came from page one', async () => {
        const user = userEvent.setup();
        api.get.mockImplementation((url) =>
            url === '/languages' ? Promise.resolve({ data: LANGUAGES }) : Promise.resolve({ data: ENTRY }));

        mount({ entryId: 7 });

        await user.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(window.location.pathname + window.location.search).toBe('/admin/content/rooms');
    });

    it('reports an entry it cannot open, with a way out', async () => {
        api.get.mockImplementation((url) =>
            url === '/languages' ? Promise.resolve({ data: LANGUAGES }) : Promise.reject(new Error('gone')));

        mount({ entryId: 7 });

        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not open that entry/i);
        expect(screen.getByRole('button', { name: 'Back to modules' })).toBeInTheDocument();
    });

    // The two failures used to share one variable, and the entry effect cleared
    // it on every run - so re-reading an entry discarded a languages error that
    // was still true and left the loading guard for ever.
    it('keeps a languages failure when the entry is re-read', async () => {
        api.get.mockImplementation((url) =>
            url === '/languages' ? Promise.reject(new Error('offline')) : Promise.resolve({ data: ENTRY }));

        const { rerender } = mount({ entryId: 7 });

        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the languages/i);

        rerender(<RouterProvider><EntryEditScreen module={module_} entryId={8} /></RouterProvider>);

        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the languages/i);
    });
});
