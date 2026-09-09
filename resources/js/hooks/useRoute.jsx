import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ROUTES, PATTERNS, FALLBACK } from '../routes';
import { matchRoute, buildPath, BASE } from '../lib/router';

const RouteContext = createContext(null);

/**
 * Where the panel is, as a route rather than a string (#117).
 *
 * **A provider, for the reason `ThemeProvider` is one.** The sidebar navigates
 * and the content area renders the result: held per component, each would own
 * its own address and a click in the rail would move nothing but the rail.
 *
 * The panel used to keep this in `useState` inside `App` with no URL at all, so
 * every reload landed on the module list. `routes/web.php` has always served
 * `/admin/{any?}`, so nothing on the server has to change for this.
 */
export function RouterProvider({ children }) {
    const [address, setAddress] = useState(() => window.location.pathname);

    // The browser's own Back and Forward. Without this they move the address
    // bar and leave the panel showing the previous screen - and Back from the
    // panel's first screen leaves the application altogether, which is what
    // happens today.
    useEffect(() => {
        const onPopState = () => setAddress(window.location.pathname);

        window.addEventListener('popstate', onPopState);

        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // Matched once and both answers taken from it - the route to render, and
    // whether there was one at all.
    const resolved = useMemo(() => matchRoute(ROUTES, address), [address]);
    const route = resolved ?? FALLBACK;

    // An address nothing matches is rewritten rather than merely ignored.
    // Rendering the dashboard under `/admin/nonsense` leaves the URL lying
    // about what is on screen, and bookmarking or reloading it repeats the
    // miss for ever. `replaceState`, not `push`, so Back still leaves the
    // panel instead of returning to an address that does not work.
    useEffect(() => {
        if (resolved !== null) return;

        window.history.replaceState({}, '', BASE);
        setAddress(BASE);
    }, [resolved]);

    const navigate = useCallback((name, params = {}, { replace = false } = {}) => {
        const pattern = PATTERNS[name];

        // Named rather than free-form, so no call site retypes a pattern and a
        // renamed route is a loud failure here instead of a dead link
        // somewhere in the panel.
        if (!pattern) {
            throw new Error(`navigate: there is no route named "${name}".`);
        }

        const to = buildPath(pattern, params);

        window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
        setAddress(to);
    }, []);

    const value = useMemo(() => [route, navigate], [route, navigate]);

    return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export default function useRoute() {
    const value = useContext(RouteContext);

    if (value === null) {
        throw new Error('useRoute must be used inside a <RouterProvider>.');
    }

    return value;
}

/**
 * An address for a named route, for an `href` that is a real link.
 *
 * Sidebar items should be anchors rather than buttons: middle-click, ctrl-click
 * and "copy link address" all work on one and none of them work on the other.
 */
export const hrefFor = (name, params = {}) => {
    const pattern = PATTERNS[name];

    if (!pattern) {
        throw new Error(`hrefFor: there is no route named "${name}".`);
    }

    return buildPath(pattern, params);
};
