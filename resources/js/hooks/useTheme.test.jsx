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
            {/* Dark, not light. jsdom has no `matchMedia`, so the theme on
                mount is always light - a probe that "chose" light would be
                asserting a value the mount effect had already written, and
                would pass even if `update` never touched the state. */}
            <button type="button" onClick={() => update({ theme: 'dark' })}>choose dark</button>
            <button type="button" onClick={() => update({ accent: 'rose' })}>choose rose</button>
            <button type="button" onClick={() => update({ theme: 'nonsense' })}>choose nonsense</button>
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

        // The document starts light here, so choosing dark is a real change in
        // all three places rather than a restatement of the mount effect.
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        await user.click(screen.getByRole('button', { name: 'choose dark' }));

        expect(localStorage.getItem('miniCms.theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(screen.getByTestId('state').textContent).toBe('dark/emerald');
    });

    // State, storage and the document all take the *resolved* value, so they
    // cannot disagree. They used to resolve separately while the raw patch went
    // into state: an unrecognised value left React holding it, and a menu
    // comparing `theme === value` then showed nothing selected at all while the
    // panel was themed perfectly well.
    it('resolves a bad value once, for all three destinations', async () => {
        const user = userEvent.setup();
        renderProbe();

        await user.click(screen.getByRole('button', { name: 'choose nonsense' }));

        expect(screen.getByTestId('state').textContent).toBe('light/emerald');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(localStorage.getItem('miniCms.theme')).toBe('light');
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

    // jsdom implements no `matchMedia` at all, so every other test in this file
    // runs the light branch and the system-preference path - the mechanism the
    // storage defect was about - was never executed end to end. Stubbing it is
    // the only way to see it work.
    describe('on a machine that asks for dark', () => {
        beforeEach(() => {
            window.matchMedia = (query) => ({
                matches: query.includes('dark'),
                media: query,
                addEventListener: () => {},
                removeEventListener: () => {},
            });
        });

        afterEach(() => {
            delete window.matchMedia;
        });

        it('follows the system when nothing has been chosen', () => {
            renderProbe();

            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
            expect(screen.getByTestId('state').textContent).toBe('dark/emerald');
        });

        it('still records nothing, so the machine can change its mind later', () => {
            renderProbe();

            expect(localStorage.getItem('miniCms.theme')).toBeNull();
        });

        // The exact sequence that made the original defect permanent: a dark
        // machine, a person who only ever picks a colour, and then a machine
        // that switches to light. The theme has to follow it.
        it('keeps following the system after an accent is chosen', async () => {
            const user = userEvent.setup();
            renderProbe();

            await user.click(screen.getByRole('button', { name: 'choose rose' }));

            expect(localStorage.getItem('miniCms.accent')).toBe('rose');
            expect(localStorage.getItem('miniCms.theme')).toBeNull();
        });

        it('lets an explicit light choice override the machine', async () => {
            const user = userEvent.setup();
            renderProbe();

            await user.click(screen.getByRole('button', { name: 'choose nonsense' }));

            // 'nonsense' resolves through the system preference, which is dark.
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });
    });

    it('refuses to run outside a provider rather than making a private copy', () => {
        // React logs the thrown error as well; the assertion is what matters.
        expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    });
});
