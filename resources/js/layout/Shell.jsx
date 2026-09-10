import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * The frame every signed-in screen sits in: a rail on the left, a bar across
 * the top, and the screen itself scrolling underneath.
 *
 * `h-screen` with the main region owning the scroll, rather than the document
 * scrolling: the rail and the bar stay put without `position: fixed`, so
 * nothing has to reserve padding for them and they cannot end up over the
 * content at a width nobody tested.
 */
export default function Shell({ user, onLoggedOut, children }) {
    return (
        <div className="flex h-screen overflow-hidden bg-bg">
            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar user={user} onLoggedOut={onLoggedOut} />

                {/* `min-w-0` above and here: without it a wide table inside a
                    flex child refuses to shrink, and the whole page scrolls
                    sideways instead of the table doing it. */}
                <main className="min-w-0 flex-1 overflow-y-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
