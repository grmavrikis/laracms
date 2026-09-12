// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../lib/api';
import { forgetLanguages } from '../lib/languageStore';
import { RouterProvider } from '../hooks/useRoute';
import EntriesScreen from './EntriesScreen';

vi.mock('../lib/api', () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

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
    /**
     * The listing's bulk actions (#117 item 19).
     *
     * **Real, not drawn.** There is no bulk endpoint, but `DELETE` and `PUT` on one
     * entry both exist, so this is n requests rather than new PHP - the same rule
     * that kept the dashboard's section count real. What is drawn and marked is
     * sort and filter, because `EntryController::index` takes a page and nothing
     * else.
     */
    describe('acting on several entries', () => {
        const tick = async (user, id) =>
            user.click(await screen.findByRole('checkbox', { name: `Select entry ${id}` }));

        // Only what this block adds; `clearAllMocks`, `forgetLanguages` and the
        // address reset are the outer describe's, which it now sits inside. It
        // used to be a sibling and carry its own copy - and before that copy
        // existed, `api.delete` arrived holding the previous test's calls.
        beforeEach(() => {
            api.put.mockResolvedValue({ data: {} });
            api.delete.mockResolvedValue({ data: {} });
        });

        it('deletes each ticked entry, once it has been confirmed', async () => {
            const user = userEvent.setup();
            respond({ entries: [entry(1), entry(2), entry(3)] });
            mount(listModule);

            await tick(user, 1);
            await tick(user, 3);
            await user.click(screen.getByRole('button', { name: 'Delete selected' }));
            await user.click(screen.getByRole('button', { name: 'Delete' }));

            await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
            expect(api.delete).toHaveBeenCalledWith('/modules/rooms/entries/1');
            expect(api.delete).toHaveBeenCalledWith('/modules/rooms/entries/3');
        });

        /**
         * **No `PUT` goes out at all.** Bulk publishing would need
         * `SchemaRuleBuilder`'s hard-coded `data => required` relaxed, which is PHP
         * this phase does not write - so the two controls are drawn, disabled and
         * explained rather than wired to a call the API answers 422 to.
         */
        it('sends no update request, because the API would refuse it', async () => {
            const user = userEvent.setup();
            respond({ entries: [entry(1), entry(2)] });
            mount(listModule);

            await tick(user, 2);
            await user.click(screen.getByRole('button', { name: /Publish selected/ }));

            expect(api.put).not.toHaveBeenCalled();
        });

        it('clears the selection and refetches once it is done', async () => {
            const user = userEvent.setup();
            respond({ entries: [entry(1), entry(2)] });
            mount(listModule);

            await tick(user, 1);
            await user.click(screen.getByRole('button', { name: 'Delete selected' }));
            await user.click(screen.getByRole('button', { name: 'Delete' }));

            await waitFor(() => expect(api.delete).toHaveBeenCalled());
            await waitFor(() => {
                expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();
            });
        });

        /**
         * A delete that half-succeeded cannot be undone by retrying the set, so the
         * screen has to say **how many** went - `allSettled`, not `all`.
         */
        it('says how many could not be done, and keeps the rest', async () => {
            const user = userEvent.setup();
            respond({ entries: [entry(1), entry(2)] });
            api.delete.mockImplementation((url) => (
                url.endsWith('/2') ? Promise.reject(new Error('offline')) : Promise.resolve({ data: {} })
            ));
            mount(listModule);

            await tick(user, 1);
            await tick(user, 2);
            await user.click(screen.getByRole('button', { name: 'Delete selected' }));
            await user.click(screen.getByRole('button', { name: 'Delete' }));

            expect(await screen.findByRole('alert')).toHaveTextContent('1 of 2');
            expect(api.delete).toHaveBeenCalledTimes(2);
        });

        /**
         * A selection is per page. Carrying fifteen ticks to page two would let a
         * delete act on rows the reader is no longer looking at, while the bar
         * still named the old count.
         */
        it('drops the selection when the page turns', async () => {
            const user = userEvent.setup();

            // A real second page holds different rows, which is the whole point:
            // `respond` answers the same ones for every page, so the tick would
            // survive for the wrong reason.
            api.get.mockImplementation((url) => {
                if (url === '/languages') return Promise.resolve({ data: LANGUAGES });
                if (url.endsWith('/order')) return Promise.resolve({ data: { ids: [1, 2, 3, 4], reorderable: true } });

                const second = url.includes('page=2') || api.get.mock.calls.filter((c) => !String(c[0]).endsWith('/order')).length > 2;
                const rows = second ? [entry(3), entry(4)] : [entry(1), entry(2)];

                return Promise.resolve({
                    data: { data: rows, current_page: second ? 2 : 1, last_page: 2, per_page: 2, total: 4, from: 1, to: 2 },
                });
            });

            mount(listModule);

            await tick(user, 1);
            expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Next' }));

            await waitFor(() => {
                expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();
            });
        });

        /**
         * A message about rows that are no longer on screen is worse than none.
         * The listing's own error is cleared by the fetch; this one was added to
         * the same strip without being added to the same reset.
         */
        it('drops a failed bulk message when the page turns', async () => {
            const user = userEvent.setup();
            api.delete.mockRejectedValue(new Error('offline'));
            respond({ entries: [entry(1), entry(2)], total: 30, lastPage: 2 });
            mount(listModule);

            await tick(user, 1);
            await user.click(screen.getByRole('button', { name: 'Delete selected' }));
            await user.click(screen.getByRole('button', { name: 'Delete' }));
            await screen.findByRole('alert');

            await user.click(screen.getByRole('button', { name: 'Next' }));

            await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        });

        it('does nothing at all when nothing is ticked', async () => {
            respond({ entries: [entry(1)] });
            mount(listModule);

            await screen.findByRole('checkbox', { name: 'Select entry 1' });

            expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();
            expect(api.delete).not.toHaveBeenCalled();
        });
    });
});
