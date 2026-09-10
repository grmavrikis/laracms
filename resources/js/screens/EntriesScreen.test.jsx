// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../lib/api';
import { forgetLanguages } from '../lib/languageStore';
import { RouterProvider } from '../hooks/useRoute';
import EntriesScreen from './EntriesScreen';

vi.mock('../lib/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const listModule = { slug: 'rooms', name: 'Rooms', is_singleton: false, schema: [{ name: 'title', type: 'string', translatable: true }] };
const singleModule = { ...listModule, slug: 'about', name: 'About', is_singleton: true };

const entry = (id) => ({ id, data: { title: { el: `E${id}`, en: `E${id}` } }, status: 'draft', created_at: '2026-09-01T00:00:00Z' });

/** The endpoints this screen reads, answered per URL rather than in order. */
const respond = ({ entries = [], total = null, lastPage = 1, currentPage = 1, orderIds = null, fail = null } = {}) => {
    api.get.mockImplementation((url) => {
        if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

        if (url.endsWith('/order')) {
            return Promise.resolve({ data: { ids: orderIds ?? entries.map((e) => e.id), reorderable: true } });
        }

        if (fail === 'entries') return Promise.reject(new Error('offline'));

        return Promise.resolve({
            data: {
                data: entries,
                current_page: currentPage,
                last_page: lastPage,
                per_page: 15,
                total: total ?? entries.length,
                from: 1,
                to: entries.length,
            },
        });
    });
};

const at = (path) => window.history.replaceState({}, '', path);

const mount = (module, path = `/admin/content/${module.slug}`) => {
    at(path);

    return render(<RouterProvider><EntriesScreen module={module} /></RouterProvider>);
};

describe('EntriesScreen', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        forgetLanguages();
        at('/admin');
    });

    afterEach(() => {
        at('/admin');
    });

    it('lists the module’s entries', async () => {
        respond({ entries: [entry(1), entry(2)] });
        mount(listModule);

        expect(await screen.findByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
    });

    it('reads the page out of the address', async () => {
        respond({ entries: [entry(20)], currentPage: 2, lastPage: 2, total: 16 });
        mount(listModule, '/admin/content/rooms?page=2');

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/modules/rooms/entries', { params: { page: 2 } });
        });
    });

    /**
     * The regression a review caught after this screen shipped.
     *
     * The page was in the listing's address and nowhere else, so opening an
     * entry lost it and saving returned the reader to page one. On a module of
     * forty rooms, correcting the last one threw the owner back to the top
     * after every save.
     */
    it('carries the page into the entry it opens', async () => {
        const user = userEvent.setup();
        respond({ entries: [entry(7)], currentPage: 2, lastPage: 2, total: 16 });
        mount(listModule, '/admin/content/rooms?page=2');

        await user.click(await screen.findByRole('button', { name: /Edit/ }));

        expect(window.location.pathname + window.location.search)
            .toBe('/admin/content/rooms/7?page=2');
    });

    it('leaves page one out of the address, so the rows have one URL', async () => {
        const user = userEvent.setup();
        respond({ entries: [entry(7)] });
        mount(listModule);

        await user.click(await screen.findByRole('button', { name: /Edit/ }));

        expect(window.location.pathname + window.location.search)
            .toBe('/admin/content/rooms/7');
    });

    describe('a singleton', () => {
        it('goes straight to its entry, replacing rather than pushing', async () => {
            respond({ entries: [entry(3)] });
            const before = window.history.length;
            mount(singleModule);

            await waitFor(() => {
                expect(window.location.pathname).toBe('/admin/content/about/3');
            });

            // Pushed, Back would return here and be sent forward again - a
            // trap with no way out but holding the button.
            expect(window.history.length).toBe(before);
        });

        it('goes to a blank form when it has no entry yet', async () => {
            respond({ entries: [] });
            mount(singleModule);

            await waitFor(() => {
                expect(window.location.pathname).toBe('/admin/content/about/new');
            });
        });

        /**
         * The second regression the review caught. The redirect effect bails on
         * an error, and the singleton branch returned the loading line
         * unconditionally - so a failed listing said "Loading…" for ever with
         * its own message rendered below an early return and unreachable.
         */
        it('shows the failure instead of loading for ever', async () => {
            respond({ entries: [], fail: 'entries' });
            mount(singleModule);

            expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the entries/i);
            expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
            expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
        });

        // A singleton holds one entry and shows no arrows, so its order is a
        // request whose answer can never be used.
        it('does not ask for an order it cannot use', async () => {
            respond({ entries: [entry(3)] });
            mount(singleModule);

            await waitFor(() => expect(api.get).toHaveBeenCalledWith('/languages'));

            expect(api.get).not.toHaveBeenCalledWith('/modules/about/entries/order');
        });
    });

    it('reports a failed listing without pretending the entries are empty', async () => {
        respond({ entries: [], fail: 'entries' });
        mount(listModule);

        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load the entries/i);
    });
});
