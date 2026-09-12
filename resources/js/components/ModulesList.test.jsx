// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModulesList from './ModulesList';
import { forgetModules } from '../lib/moduleStore';
import { forgetLanguages } from '../lib/languageStore';

const get = vi.fn();

vi.mock('../lib/api', () => ({ default: { get: (...args) => get(...args) } }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
    { id: 3, code: 'de', is_active: true },
];

const MODULES = [
    {
        id: 1,
        slug: 'rooms',
        name: 'Rooms',
        is_singleton: false,
        schema: [
            { name: 'title', type: 'string', translatable: true },
            { name: 'photos', type: 'gallery', translatable: false },
        ],
        slugs: [
            { language_code: 'el', name: 'Δωμάτια', slug: 'domatia' },
            { language_code: 'en', name: 'Rooms', slug: 'rooms' },
            { language_code: 'de', name: 'Zimmer', slug: 'zimmer' },
        ],
    },
    {
        id: 2,
        slug: 'about',
        name: 'About',
        is_singleton: true,
        schema: [{ name: 'body', type: 'text', translatable: true }],
        // German untranslated on purpose - what the "missing" badge pins.
        slugs: [
            { language_code: 'el', name: 'Σχετικά', slug: 'sxetika' },
            { language_code: 'en', name: 'About', slug: 'about' },
        ],
    },
];

const draw = (props = {}) => {
    const onSelectModule = vi.fn();
    const onCreateModule = vi.fn();
    const onTranslateModule = vi.fn();
    const result = render(
        <ModulesList
            onSelectModule={onSelectModule}
            onCreateModule={onCreateModule}
            onTranslateModule={onTranslateModule}
            {...props}
        />
    );

    return { ...result, onSelectModule, onCreateModule, onTranslateModule };
};

/** The list has loaded once its heading is on screen. */
const ready = () => screen.findByRole('heading', { name: 'Modules' });

beforeEach(() => {
    forgetModules();
    forgetLanguages();
    get.mockReset().mockImplementation((url) => {
        if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

        return Promise.resolve({ data: MODULES });
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ModulesList', () => {
    it('shows a loading line before the modules arrive', () => {
        draw();

        expect(screen.getByText('Loading modules…')).toBeInTheDocument();
    });

    it('names every module, its slug and its type once loaded', async () => {
        draw();
        await ready();

        const rooms = await screen.findByText('Rooms');
        const roomsRow = rooms.closest('[data-module]');
        // The slug is rendered twice - once under the name for a narrow
        // screen, once in its own column for a wide one - both present in
        // the DOM at once, since only CSS width decides which one shows.
        expect(within(roomsRow).getAllByText('rooms').length).toBeGreaterThan(0);
        expect(within(roomsRow).getByText('List')).toBeInTheDocument();

        const about = screen.getByText('About');
        expect(within(about.closest('[data-module]')).getByText('Single page')).toBeInTheDocument();
    });

    it('lays the modules out as a table, with a header naming every column', async () => {
        draw();
        await ready();

        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Module name' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Slug' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Languages' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    });

    it('reports a module complete in every active language', async () => {
        draw();
        const rooms = await screen.findByText('Rooms');

        // Scoped to Rooms' own row - "About" is missing German, and a query
        // for the badge text alone cannot tell whose badge it found.
        const row = rooms.closest('[data-module]');

        expect(within(row).getByText('All languages')).toBeInTheDocument();
    });

    it('names the language a module has no page in, rather than only counting it', async () => {
        draw();
        const about = await screen.findByText('About');
        const row = about.closest('[data-module]');

        // Named, not counted (see the comment on `missingTranslations`): a
        // reader should not have to open the module to find out which.
        expect(within(row).getByText('No DE page')).toBeInTheDocument();
        expect(within(row).queryByText('All languages')).not.toBeInTheDocument();
    });

    it('opens the translator for the module whose edit control was used', async () => {
        const user = userEvent.setup();
        const { onTranslateModule } = draw();
        const rooms = await screen.findByText('Rooms');
        const row = rooms.closest('[data-module]');

        await user.click(within(row).getByRole('button', { name: 'Edit this module' }));

        expect(onTranslateModule).toHaveBeenCalledWith(expect.objectContaining({ slug: 'rooms' }));
    });

    it('opens entries for a list module and the entry itself for a singleton', async () => {
        const user = userEvent.setup();
        const { onSelectModule } = draw();

        const rooms = await screen.findByText('Rooms');
        await user.click(within(rooms.closest('[data-module]')).getByRole('button', { name: 'Entries' }));
        expect(onSelectModule).toHaveBeenCalledWith(expect.objectContaining({ slug: 'rooms' }));

        const about = screen.getByText('About');
        // A singleton opens straight into its one entry - calling that
        // "Entries" would promise a list that is never shown.
        await user.click(within(about.closest('[data-module]')).getByRole('button', { name: 'Open' }));
        expect(onSelectModule).toHaveBeenCalledWith(expect.objectContaining({ slug: 'about' }));
    });

    it('calls the create callback from its header action', async () => {
        const user = userEvent.setup();
        const { onCreateModule } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: 'Add module' }));

        expect(onCreateModule).toHaveBeenCalled();
    });

    it('shows what a module is for when there are none yet', async () => {
        get.mockReset().mockImplementation((url) => {
            if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

            return Promise.resolve({ data: [] });
        });

        draw();

        expect(await screen.findByText('No modules yet.')).toBeInTheDocument();
    });

    it('reports a failed load as a failure, with a way to try again', async () => {
        const user = userEvent.setup();
        get.mockReset().mockImplementation((url) => {
            if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

            return Promise.reject(new Error('network down'));
        });

        draw();

        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText('Could not load the modules.')).toBeInTheDocument();

        get.mockImplementation((url) => {
            if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

            return Promise.resolve({ data: MODULES });
        });

        await user.click(within(alert).getByRole('button', { name: 'Try again' }));

        await waitFor(() => {
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Rooms')).toBeInTheDocument();
    });
});
