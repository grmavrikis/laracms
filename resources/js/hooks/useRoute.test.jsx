// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from './useRoute';
import useRoute from './useRoute';

function Probe() {
    const [route, navigate] = useRoute();

    return (
        <div>
            <span data-testid="route">{route.name}</span>
            <span data-testid="params">{JSON.stringify(route.params)}</span>
            <button type="button" onClick={() => navigate('entries', { module: 'rooms' })}>go to rooms</button>
            <button type="button" onClick={() => navigate('entryEdit', { module: 'rooms', entry: '12' })}>edit 12</button>
            <button type="button" onClick={() => navigate('settings')}>go to settings</button>
            <button type="button" onClick={() => navigate('settings', {}, { replace: true })}>replace with settings</button>
            {/* Caught here rather than left to propagate: React does not
                handle a throw from an event handler, so it escapes as an
                uncaught exception that the click promise never sees. */}
            <button
                type="button"
                onClick={(event) => {
                    try {
                        navigate('nowhere');
                    } catch (err) {
                        event.currentTarget.dataset.error = err.message;
                    }
                }}
            >
                go nowhere
            </button>
        </div>
    );
}

const at = (path) => window.history.replaceState({}, '', path);
const renderAt = (path) => {
    at(path);

    return render(<RouterProvider><Probe /></RouterProvider>);
};

describe('useRoute', () => {
    beforeEach(() => {
        at('/admin');
    });

    it('reads the screen out of the address it started on', () => {
        renderAt('/admin/content/rooms/12');

        expect(screen.getByTestId('route').textContent).toBe('entryEdit');
        expect(screen.getByTestId('params').textContent).toBe('{"module":"rooms","entry":"12"}');
    });

    // The whole point of the item: a reload lands where you were. Today every
    // refresh returns to the module list, whatever you had open.
    it('survives a reload of a deep address', () => {
        renderAt('/admin/content/rooms/12');

        expect(screen.getByTestId('route').textContent).toBe('entryEdit');
        expect(window.location.pathname).toBe('/admin/content/rooms/12');
    });

    it('moves the address bar when it navigates', async () => {
        const user = userEvent.setup();
        renderAt('/admin');

        await user.click(screen.getByRole('button', { name: 'edit 12' }));

        expect(window.location.pathname).toBe('/admin/content/rooms/12');
        expect(screen.getByTestId('route').textContent).toBe('entryEdit');
    });

    it('follows the browser’s Back button', async () => {
        const user = userEvent.setup();
        renderAt('/admin');

        await user.click(screen.getByRole('button', { name: 'go to rooms' }));
        await user.click(screen.getByRole('button', { name: 'go to settings' }));

        expect(screen.getByTestId('route').textContent).toBe('settings');

        // A real `history.back()`. jsdom fires popstate on a later task, so the
        // test waits for **that event** rather than for a fixed number of
        // milliseconds - a sleep long enough today is a flake on a loaded
        // machine, and this suite has already seen setup swing from 14s to
        // over 300s.
        await act(async () => {
            const popped = new Promise((resolve) => {
                window.addEventListener('popstate', resolve, { once: true });
            });

            window.history.back();

            await popped;
        });

        expect(screen.getByTestId('route').textContent).toBe('entries');
        expect(window.location.pathname).toBe('/admin/content/rooms');
    });

    // `replace` decides whether a navigation is somewhere Back returns to, and
    // getting it wrong raises no error at all - just a Back button that needs
    // pressing twice. Item 8 needs it for a singleton opening straight into its
    // entry, which pushed would trap the reader bouncing against itself.
    it('can navigate without leaving a history entry behind', async () => {
        const user = userEvent.setup();
        renderAt('/admin');

        await user.click(screen.getByRole('button', { name: 'go to rooms' }));
        await user.click(screen.getByRole('button', { name: 'replace with settings' }));

        expect(window.location.pathname).toBe('/admin/settings');

        await act(async () => {
            const popped = new Promise((resolve) => {
                window.addEventListener('popstate', resolve, { once: true });
            });

            window.history.back();

            await popped;
        });

        // Back skips the replaced address entirely and lands before it.
        expect(window.location.pathname).toBe('/admin');
    });

    // Two consumers, one address. Held per component, a click in the sidebar
    // would move the sidebar and leave the content area where it was.
    it('keeps one address across two consumers', async () => {
        const user = userEvent.setup();
        at('/admin');
        render(
            <RouterProvider>
                <Probe />
                <Probe />
            </RouterProvider>
        );

        await user.click(screen.getAllByRole('button', { name: 'go to settings' })[0]);

        const [first, second] = screen.getAllByTestId('route');
        expect(first.textContent).toBe('settings');
        expect(second.textContent).toBe('settings');
    });

    // A stale bookmark should not leave the URL describing a screen that is not
    // on show. It is rewritten in place, so Back still leaves the panel.
    it('rewrites an address it cannot match instead of lying about it', () => {
        renderAt('/admin/nonsense/here');

        expect(screen.getByTestId('route').textContent).toBe('dashboard');
        expect(window.location.pathname).toBe('/admin');
    });

    // A renamed route should fail loudly at the call site rather than quietly
    // produce a dead link somewhere in the panel.
    it('refuses to navigate to a route that does not exist', async () => {
        const user = userEvent.setup();
        renderAt('/admin');

        const button = screen.getByRole('button', { name: 'go nowhere' });
        await user.click(button);

        expect(button.dataset.error).toMatch(/no route named "nowhere"/);
        expect(window.location.pathname).toBe('/admin');
    });

    it('refuses to run outside a provider', () => {
        expect(() => render(<Probe />)).toThrow(/RouterProvider/);
    });
});

