// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
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
 * A singleton's row is `active` while its one entry is open at `entryEdit`,
 * but always points at the module's own *listing* route - which does not
 * exist for a singleton, and redirects straight back the moment it mounts
 * (`EntriesScreen`). Before this, clicking the already-open row sent the
 * reader on that whole round trip: a real navigation away, a "Loading…" flash,
 * a fresh request for the entry list, and a redirect back to exactly where
 * they started - which read as the page refreshing itself for no reason.
 */
describe('clicking the row already open', () => {
    it('does nothing, for a route the active check matches other than by an exact address', async () => {
        // The address a singleton is actually open at - not the listing
        // route the sidebar link itself carries, which is the mismatch this
        // guards against.
        window.history.replaceState({}, '', '/admin/content/rooms/7');
        draw();

        const room = await rooms();

        expect(room).toHaveAttribute('aria-current', 'page');

        fireEvent.click(room);

        expect(window.location.pathname).toBe('/admin/content/rooms/7');
    });

    it('does nothing for the ordinary case either - the ready-active route itself', async () => {
        // `/admin` is Dashboard's own address, the simplest case. Navigating
        // there again would not move the URL either way - it is already
        // there - so what a missing guard actually costs here is a redundant
        // history entry: `pushState` fires even for the address already on
        // screen, and that is the signal a spy can see that the address
        // itself cannot.
        draw();

        const pushState = vi.spyOn(window.history, 'pushState');
        const dashboard = await screen.findByRole('link', { name: 'Dashboard' });

        fireEvent.click(dashboard);

        expect(pushState).not.toHaveBeenCalled();
        pushState.mockRestore();
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

    it('fades out rather than cutting, and is gone once the fade has had time to finish', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);

        // Let the entrance genuinely finish first - checking straight after
        // `mouseLeave` with no entrance to interrupt proves nothing, since a
        // box that has not yet faded *in* already reads `opacity-0` for a
        // reason that has nothing to do with leaving.
        await waitFor(() => {
            expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
        });

        fireEvent.mouseLeave(row);

        // Still fully visible right after - a leave gets a short grace period
        // before it is believed (`FLYOUT_LEAVE_GRACE_MS`), which is what
        // survives the browser's own hover recalculation the instant the
        // flyout itself appears on top of the row it describes.
        expect(document.getElementById('rail-flyout').className).toContain('opacity-100');

        // Once that grace period has passed, the fade genuinely starts...
        await waitFor(() => {
            expect(document.getElementById('rail-flyout').className).toContain('opacity-0');
        });

        // ...and the box is gone once it has had time to finish.
        await waitForElementToBeRemoved(() => document.getElementById('rail-flyout'));
    });

    it('cancels a pending close when the same row is hovered again first', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);
        fireEvent.mouseLeave(row);
        fireEvent.mouseEnter(row);

        // The row was re-entered before the scheduled unmount fired - it must
        // not go on to remove a flyout that a later hover put back up.
        await new Promise((resolve) => { setTimeout(resolve, 200); });

        expect(document.getElementById('rail-flyout')).not.toBeNull();
    });

    // Measured live before this was written: clicking a hovered row closed the
    // flyout by way of the route changing, at the exact moment the clicked
    // row's own background began its own, differently-timed transition into
    // `bg-accent` - a fade and a colour change racing each other on the same
    // few pixels, which is what read as broken rather than smooth. The pointer
    // never left the row, so there was nothing to close *for*.
    it('stays open across the very navigation the click just started', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);
        expect(document.getElementById('rail-flyout')).not.toBeNull();

        fireEvent.click(row);

        // Prove the click actually navigated, or the rest of this test proves
        // nothing.
        expect(window.location.pathname).toBe('/admin/content/rooms');

        // Past the close delay a route-triggered close would have used, not
        // just the instant after the click - closing is scheduled behind a
        // timer, so checking immediately would pass whether or not the route
        // change closes it. The route is now `entries`/`rooms` - Rooms is the
        // active screen - but the mouse is still exactly where it was, so the
        // flyout it raised has no reason to go anywhere.
        await new Promise((resolve) => { setTimeout(resolve, 200); });
        expect(document.getElementById('rail-flyout')).not.toBeNull();

        // It still answers to the pointer actually leaving, same as ever.
        fireEvent.mouseLeave(row);
        await waitForElementToBeRemoved(() => document.getElementById('rail-flyout'));
    });

    // Clicking a link focuses it in most browsers - the mousedown a click
    // starts moves focus there before the click itself fires - and this rail
    // wires both a hover and a focus to the same open, for the keyboard's
    // sake. Sat right next to each other on an already-hovered row, that is a
    // second open arriving a few milliseconds after the first, for the exact
    // same element.
    it('does not restart its entrance when a click focuses a row it is already open for', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);

        // Let the entrance actually settle before the second open arrives -
        // this is what the raw `false` written by an unguarded second open
        // would be interrupting. Polled rather than a fixed sleep: the
        // entrance is driven by two nested `requestAnimationFrame`s, and how
        // long those actually take to fire is not this test's business to
        // guess at.
        await waitFor(() => {
            expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
        });

        fireEvent.focus(row);

        // Checked with no wait at all: a second open treated as brand new
        // writes `show(false)` synchronously, before the two
        // `requestAnimationFrame`s that would eventually raise it again ever
        // run - which is a real, paintable frame of the label vanishing. This
        // is the instant that frame would show up in.
        expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
    });

    // Root cause of the "stale colour" the owner described: `flyout.active`
    // was whatever the row's `active` prop was at the moment the hover that
    // opened the box began - `false`, since the row was not yet the current
    // screen - and nothing ever revisited it once the click that changed that
    // had fired.
    it('recolours as active the instant the row is clicked, not on the next hover', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);
        expect(document.getElementById('rail-flyout').className).toContain('bg-sidebar-hover');

        fireEvent.click(row);

        expect(document.getElementById('rail-flyout').className).toContain('bg-accent');
    });

    // The row underneath is 44px wide even once the flyout has grown to show
    // a name like "Facilities" - so a mouse resting on the *visible* label,
    // past that 44px, is not resting on the row at all. Moving there must not
    // read as leaving.
    it('stays open when the pointer moves onto the flyout itself, not just the narrow row', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);
        await waitFor(() => {
            expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
        });

        // The row genuinely left, as it does the instant a mouse crosses from
        // the icon onto the wider, visible part of the label.
        fireEvent.mouseLeave(row);
        fireEvent.mouseEnter(document.getElementById('rail-flyout'));

        // Past both the leave's own grace period and the close delay it would
        // otherwise have scheduled - still here, because the flyout's own
        // hover cancelled it.
        await new Promise((resolve) => { setTimeout(resolve, 250); });
        expect(document.getElementById('rail-flyout')).not.toBeNull();
        expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
    });

    // The whole point of extending the hover zone: a visible label a mouse
    // cannot act on is worse than a narrow one, since it looks clickable and
    // is not. The flyout is a real `Link`, reusing the row's own address and
    // navigate callback rather than inventing a second way to get there.
    it('is itself clickable, reaching the same place the row does', async () => {
        draw({ collapsed: true });
        const row = await rooms();

        fireEvent.mouseEnter(row);

        const flyout = document.getElementById('rail-flyout');

        expect(flyout.tagName).toBe('A');
        fireEvent.click(flyout);

        expect(window.location.pathname).toBe('/admin/content/rooms');
    });

    // The flyout mirrors the row's own click-does-nothing-when-active rule
    // (see "clicking the row already open" below), since it is now the thing
    // that actually receives a mouse click most of the time.
    it('does nothing when the active row\'s own flyout is clicked', async () => {
        window.history.replaceState({}, '', '/admin/content/rooms/7');
        draw({ collapsed: true });
        const room = await rooms();

        expect(room).toHaveAttribute('aria-current', 'page');

        fireEvent.mouseEnter(room);
        fireEvent.click(document.getElementById('rail-flyout'));

        expect(window.location.pathname).toBe('/admin/content/rooms/7');
    });

    // Moving straight from one row's flyout to a neighbour's must not drop to
    // invisible and back - the box never actually leaves the screen, so doing
    // that only opened a window for the outgoing colour and the incoming one
    // to transition at once, which is what read as one bleeding into the
    // other.
    it('swaps directly to a different row without dropping to invisible and back', async () => {
        draw({ collapsed: true });

        // Dashboard is the active route by default in these tests (`/admin`).
        const dashboard = await screen.findByRole('link', { name: 'Dashboard' });

        fireEvent.mouseEnter(dashboard);
        await waitFor(() => {
            expect(document.getElementById('rail-flyout').className).toContain('opacity-100');
        });
        expect(document.getElementById('rail-flyout').className).toContain('bg-accent');

        const room = await rooms();

        fireEvent.mouseLeave(dashboard);
        fireEvent.mouseEnter(room);

        // Checked with no wait at all: dropping to invisible for the swap
        // would have written `opacity-0` synchronously, right where the
        // colour also changed - the two moving together is exactly what let
        // one bleed into the other.
        const flyout = document.getElementById('rail-flyout');

        expect(flyout.className).toContain('opacity-100');
        expect(flyout.className).toContain('bg-sidebar-hover');
        expect(flyout.textContent).toBe('Rooms');
    });
});
