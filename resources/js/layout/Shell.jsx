import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import useRoute from '../hooks/useRoute';

/**
 * The frame every signed-in screen sits in: a rail on the left, a bar across
 * the top, and the screen itself scrolling underneath.
 *
 * `h-screen` with the main region owning the scroll, rather than the document
 * scrolling: the rail and the bar stay put without `position: fixed`, so
 * nothing has to reserve padding for them and they cannot end up over the
 * content at a width nobody tested.
 *
 * **Below `lg` the rail is a drawer.** It was a flex child at a fixed 256px at
 * every width, which on a 375px phone left 119px for the screen - so every
 * page in the panel was unusable on a telephone, which is where an
 * accommodation owner checks an enquiry.
 */
export default function Shell({ user, onLoggedOut, children }) {
    const [route] = useRoute();
    const [menuOpen, setMenuOpen] = useState(false);

    // Following a link should close the drawer it was tapped in. Keyed on the
    // whole route rather than a callback on each item, so an address reached
    // any other way - Back, a redirect after saving - closes it too.
    useEffect(() => {
        setMenuOpen(false);
    }, [route]);

    // A drawer has to be dismissable from the keyboard, and Escape is where
    // everyone reaches first.
    useEffect(() => {
        if (!menuOpen) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [menuOpen]);

    return (
        <div className="flex h-screen overflow-hidden bg-bg">
            {/* Dimming the page behind the drawer, and catching the tap that
                should close it. Hidden from the accessibility tree because the
                Escape handler and the rail's own close button already say
                everything this does. */}
            {menuOpen && (
                <div
                    aria-hidden="true"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                />
            )}

            <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar
                    user={user}
                    onLoggedOut={onLoggedOut}
                    onOpenMenu={() => setMenuOpen(true)}
                />

                {/* `min-w-0` above and here: without it a wide table inside a
                    flex child refuses to shrink, and the whole page scrolls
                    sideways instead of the table doing it. */}
                <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
