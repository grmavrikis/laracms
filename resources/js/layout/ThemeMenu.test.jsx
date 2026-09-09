import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeMenu from './ThemeMenu';

// English is asserted raw. The setup file leaves the catalogue empty so `t()`
// answers its own key, and `CatalogueCoversTheCodeTest` does not skip
// `.test.jsx` - a `t('…')` here would be demanded of `lang/en.json`.
describe('ThemeMenu', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
    });

    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
    });

    const open = async (user) => {
        await user.click(screen.getByRole('button', { name: 'Appearance' }));
    };

    it('keeps the menu shut until it is asked for', () => {
        render(<ThemeMenu />);

        expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('writes the chosen theme onto the root element', async () => {
        const user = userEvent.setup();
        render(<ThemeMenu />);
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Dark' }));

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(localStorage.getItem('miniCms.theme')).toBe('dark');
    });

    // The two axes are independent, and this is the assertion that says so:
    // picking a colour must not drag the panel back into light mode.
    it('changes the accent without disturbing the theme', async () => {
        const user = userEvent.setup();
        render(<ThemeMenu />);
        await open(user);

        await user.click(screen.getByRole('button', { name: 'Dark' }));
        await user.click(screen.getByRole('button', { name: 'Rose' }));

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-accent')).toBe('rose');
    });

    // A row of coloured circles is unusable to a screen reader, and to anyone
    // who cannot tell two of these hues apart, unless each carries its name and
    // its selected state in the accessibility tree rather than only in paint.
    it('names every accent and reports which is selected', async () => {
        const user = userEvent.setup();
        render(<ThemeMenu />);
        await open(user);

        for (const name of ['Emerald', 'Teal', 'Blue', 'Violet', 'Rose', 'Amber']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }

        expect(screen.getByRole('button', { name: 'Emerald' })).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'Teal' }));

        expect(screen.getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Emerald' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('closes on Escape, so the keyboard is not trapped in it', async () => {
        const user = userEvent.setup();
        render(<ThemeMenu />);
        await open(user);

        expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument();
    });

    it('closes when the pointer goes somewhere else', async () => {
        const user = userEvent.setup();
        render(<ThemeMenu />);
        await open(user);

        await user.click(document.body);

        expect(screen.queryByRole('button', { name: 'Light' })).not.toBeInTheDocument();
    });
});
