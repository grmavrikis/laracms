// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './useTheme';
import useTheme from './useTheme';

// A consumer small enough to assert against directly, so these tests are about
// the hook rather than about ThemeMenu's markup.
function Probe() {
    const [{ theme, accent }, update] = useTheme();

    return (
        <div>
            <span data-testid="state">{theme}/{accent}</span>
            <button type="button" onClick={() => update({ theme: 'light' })}>choose light</button>
            <button type="button" onClick={() => update({ accent: 'rose' })}>choose rose</button>
        </div>
    );
}

const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>);

describe('useTheme', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
    });

    // The regression this file exists for. Mounting used to store the resolved
    // preference, which turned `prefers-color-scheme` - a fallback for having
    // no choice yet - into a recorded choice on the first ever page load. Since
    // a stored value outranks the media query, the panel then stopped following
    // the system permanently, and nothing short of clearing site data undid it.
    it('stores nothing until a choice is actually made', () => {
        renderProbe();

        expect(localStorage.getItem('miniCms.theme')).toBeNull();
        expect(localStorage.getItem('miniCms.accent')).toBeNull();
    });

    it('still applies the resolved preference to the document on mount', () => {
        renderProbe();

        expect(document.documentElement.getAttribute('data-theme')).toBeTruthy();
        expect(document.documentElement.getAttribute('data-accent')).toBe('emerald');
    });

    it('stores a choice once it is made', async () => {
        const user = userEvent.setup();
        renderProbe();

        await user.click(screen.getByRole('button', { name: 'choose light' }));

        expect(localStorage.getItem('miniCms.theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    // The other half of the same defect: storing the *merged* preference means
    // picking a colour also writes whatever theme the machine happened to be
    // in, freezing an axis the person never touched.
    it('stores only the axis that was chosen, leaving the other unrecorded', async () => {
        const user = userEvent.setup();
        renderProbe();

        await user.click(screen.getByRole('button', { name: 'choose rose' }));

        expect(localStorage.getItem('miniCms.accent')).toBe('rose');
        expect(localStorage.getItem('miniCms.theme')).toBeNull();
    });

    it('keeps one source of truth across two consumers', async () => {
        const user = userEvent.setup();
        render(
            <ThemeProvider>
                <Probe />
                <div data-testid="second"><Probe /></div>
            </ThemeProvider>
        );

        await user.click(screen.getAllByRole('button', { name: 'choose rose' })[0]);

        // Both read the same state, so the second copy moved with the first.
        const [first, second] = screen.getAllByTestId('state');
        expect(second.textContent).toBe(first.textContent);
        expect(first.textContent).toContain('rose');
    });

    it('refuses to run outside a provider rather than making a private copy', () => {
        // React logs the thrown error as well; the assertion is what matters.
        expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    });
});
