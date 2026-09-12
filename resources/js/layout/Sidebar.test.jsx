// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';
import { RouterProvider } from '../hooks/useRoute';
import { forgetModules } from '../lib/moduleStore';
import { forgetLanguages } from '../lib/languageStore';

const get = vi.fn();

vi.mock('../lib/api', () => ({ default: { get: (...args) => get(...args) } }));

const LANGUAGES = [
    { id: 1, code: 'en', is_default: true, is_active: true },
];

const MODULES = [
    { id: 1, slug: 'rooms', name: 'Rooms', slugs: [{ language_code: 'en', name: 'Rooms', slug: 'rooms' }] },
    { id: 2, slug: 'facilities', name: 'Facilities', slugs: [{ language_code: 'en', name: 'Facilities', slug: 'facilities' }] },
];

/**
 * The rail collapses **only on a desktop** - `rail = collapsed && isDesktop` -
 * and jsdom implements no `matchMedia` at all, so `useMediaQuery` answers false
 * and the rail can never be reached without this. Left out, every test below
 * would quietly measure the wide rail and the collapsed half would be untested
 * while reporting green.
 */
const stubWidth = (isDesktop) => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: isDesktop,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
};

const draw = ({ collapsed = false } = {}) => {
    localStorage.setItem('miniCms.sidebar', collapsed ? 'collapsed' : 'expanded');
    stubWidth(true);

    return render(<RouterProvider><Sidebar /></RouterProvider>);
};

/** The rail renders before its modules arrive, so every test waits for one. */
const rooms = () => screen.findByRole('link', { name: 'Rooms' });

beforeEach(() => {
    forgetModules();
    forgetLanguages();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
    get.mockReset().mockImplementation((url) => {
        if (url === '/languages') return Promise.resolve({ data: LANGUAGES });

        return Promise.resolve({ data: MODULES });
    });
});

afterEach(() => {
    delete window.matchMedia;
});

/**
 * The modules are the client's own sections, and they read as a **submenu of
 * Content**: a parent row with an icon, and the names hanging under it on a
 * guide line.
 *
 * They used to be a flat list in which each row carried an 18x18 tile holding
 * the initial of its name, because a module has no icon of its own. Seen at
 * 1024px with six modules that is a column of lettered chips wedged between two
 * groups of line icons, and the owner's judgement was that the idea was sound
 * and the appearance was not.
 */
describe('the rail, wide', () => {
    it('shows a module by its name alone, with no initial beside it', async () => {
        draw();

        // `textContent`, not a substring match: the defect this replaces was
        // that the row read "RRooms", which every `name` query matches happily.
        expect((await rooms()).textContent).toBe('Rooms');
    });

    it('keeps the modules in a list that Content names', async () => {
        draw();
        await rooms();

        // A guard rather than a new claim. The grouping is `h2` + `aria-
        // labelledby`, and the comment on it records why: without it the rail
        // read as one flat list of links with three stray words in it, so a
        // reader could not tell Rooms - the client's content - from Modules,
        // which is ours. Turning the heading into a row must not lose it.
        const group = screen.getByRole('list', { name: 'Content' });

        expect(within(group).getByRole('link', { name: 'Facilities' })).toBeInTheDocument();
    });
});

/**
 * At 68px there is no room for a hierarchy and the label is not rendered, so
 * the initial **is** the icon - which is the reason it was written, and it
 * stays. Hovering or focusing a row no longer summons a chip beside it: the
 * row's own background grows in place to carry the label, replacing the
 * initial rather than sitting next to it - so a module never reads its first
 * letter twice.
 */
describe('the rail, collapsed to 68px', () => {
    it('still shows each module by its initial', async () => {
        draw({ collapsed: true });

        expect((await rooms()).textContent).toContain('R');
    });

    it('names the row with text rather than with a title attribute', async () => {
        draw({ collapsed: true });

        // `title` is a last resort in the accessible-name computation, so the
        // row did have a name - and it was the *only* thing carrying one, which
        // is why dropping it needed the label rendered `sr-only` first. A row
        // named only by `title` is one CSS change away from having no name.
        expect(await rooms()).not.toHaveAttribute('title');
    });

    it('grows into the full name on hover, showing it once and not beside the initial', async () => {
        draw({ collapsed: true });
        fireEvent.mouseEnter(await rooms());

        const flyout = document.getElementById('rail-flyout');

        expect(flyout).not.toBeNull();

        // Exact equality, not a substring: the defect this replaces read
        // "RRooms", because the initial and the flyout's label both matched a
        // substring query happily. A module carries no icon of its own, so
        // nothing precedes the name here.
        expect(flyout.textContent).toBe('Rooms');

        // Measured live before this was written: `nav` computes
        // `overflow-x: auto`, forced by its `overflow-y-auto`, and a probe
        // positioned past the 68px edge is clipped - `elementFromPoint` over it
        // answers the dashboard behind. The flyout is therefore portalled, and
        // this is what says so.
        expect(document.querySelector('aside')?.contains(flyout)).toBe(false);
    });

    it('carries the row icon into the flyout for a screen we ship', async () => {
        draw({ collapsed: true });
        fireEvent.mouseEnter(await screen.findByRole('link', { name: 'Dashboard' }));

        const flyout = document.getElementById('rail-flyout');

        // Unlike a module, Dashboard has an icon of its own, and the owner
        // asked for it specifically: the icon stays in place while the row
        // widens beside it, rather than the icon being swapped for text.
        expect(flyout.querySelector('svg')).not.toBeNull();
        expect(flyout).toHaveTextContent('Dashboard');
    });

    it('reveals it on keyboard focus too', async () => {
        draw({ collapsed: true });
        fireEvent.focus(await rooms());

        expect(document.getElementById('rail-flyout')).toHaveTextContent('Rooms');
    });

    it('takes it away again', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);
        fireEvent.mouseLeave(row);

        expect(document.getElementById('rail-flyout')).toBeNull();
    });
});
