import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ROUTES, FALLBACK, hrefFor } from '../routes';
import { matchRoute, BASE } from '../lib/router';

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

    // `replace` for a navigation that should not be somewhere Back returns to:
    // a singleton module opening straight into its one entry, or a save that
    // returns to the listing. Pushed instead, those trap the reader bouncing
    // between the form and itself.
    const navigate = useCallback((name, params = {}, { replace = false } = {}) => {
        const to = hrefFor(name, params);

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
