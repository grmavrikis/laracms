import { Component } from 'react';
import { t } from '../lib/i18n';

/**
 * The last thing between a thrown error and a blank page.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * so until this existed **any** such error took the whole panel to white - not
 * the broken screen, all of them, with no message and nothing in the interface
 * to say what had happened. A client reports that as "the admin is down".
 *
 * The panel has several deliberate throws, and they are deliberate *because*
 * of this: a hook used outside its provider, a link asked for a route that does
 * not exist, an address built without a parameter it needs. Each is a
 * programming mistake that should be loud rather than papered over - but loud
 * has to mean a message, not an empty document.
 *
 * A class rather than a hook because React offers no hook for this; there is no
 * `useErrorBoundary`.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);

        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // The stack is the useful half and React does not put it in `error`.
        console.error('The panel stopped:', error, info?.componentStack);
    }

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        return (
            <div className="flex min-h-screen items-center justify-center bg-bg p-6">
                <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
                    <h1 className="text-lg font-semibold text-fg">{t('Something went wrong.')}</h1>
                    <p className="mt-2 text-sm text-fg-muted">
                        {t('The panel could not finish loading this screen. Reloading usually clears it.')}
                    </p>

                    {/* Reload rather than a "try again" that re-renders the same
                        broken tree: the state that caused the throw is still
                        there, so retrying in place fails again immediately. */}
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                    >
                        {t('Reload the page')}
                    </button>

                    {/* The message itself, for the person who has to report it.
                        Not the stack - that is in the console, where somebody
                        looking for it will find it. */}
                    <p className="mt-4 break-words font-mono text-xs text-fg-subtle">
                        {String(this.state.error?.message ?? this.state.error)}
                    </p>
                </div>
            </div>
        );
    }
}
