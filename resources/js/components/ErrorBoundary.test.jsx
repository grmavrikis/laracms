// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

const Boom = () => {
    throw new Error('a deliberate failure');
};

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // React writes the caught error to the console itself, on top of the
        // boundary's own log. Silenced so a passing run is not full of red.
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders its children when nothing is wrong', () => {
        render(<ErrorBoundary><p>the panel</p></ErrorBoundary>);

        expect(screen.getByText('the panel')).toBeInTheDocument();
    });

    // The whole point. Without a boundary React unmounts the entire tree, so
    // one throw anywhere left a white document with no message - which a client
    // reports as "the admin is down".
    it('shows a message instead of a blank page when a child throws', () => {
        render(<ErrorBoundary><Boom /></ErrorBoundary>);

        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    });

    // The message is what the person on the telephone can read out. The stack
    // stays in the console, where somebody looking for it will find it.
    it('shows the error’s own message, for whoever has to report it', () => {
        render(<ErrorBoundary><Boom /></ErrorBoundary>);

        expect(screen.getByText('a deliberate failure')).toBeInTheDocument();
    });

    it('logs the failure with its component stack', () => {
        render(<ErrorBoundary><Boom /></ErrorBoundary>);

        expect(console.error).toHaveBeenCalledWith(
            'The panel stopped:',
            expect.objectContaining({ message: 'a deliberate failure' }),
            expect.any(String)
        );
    });

    // The deliberate throws the panel now has - a hook outside its provider, a
    // link to a route that does not exist - are all of this shape, and every
    // one of them used to blank the application.
    it('catches a hook used outside its provider', () => {
        const Consumer = () => {
            throw new Error('useTheme must be used inside a <ThemeProvider>.');
        };

        render(<ErrorBoundary><Consumer /></ErrorBoundary>);

        expect(screen.getByText(/ThemeProvider/)).toBeInTheDocument();
    });
});
