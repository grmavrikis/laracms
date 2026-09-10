// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Palette } from 'lucide-react';
import IconButton from './IconButton';

describe('IconButton', () => {
    // Both halves, because they serve different people and one of them was
    // dropped once already: `aria-label` names the control in the
    // accessibility tree, `title` is the only thing a sighted pointer user has
    // to tell them what a bare glyph does.
    it('names itself for the screen reader and for the pointer', () => {
        render(<IconButton icon={Palette} label="Appearance" />);

        const button = screen.getByRole('button', { name: 'Appearance' });

        expect(button).toHaveAttribute('title', 'Appearance');
    });

    it('hides the glyph from the accessibility tree', () => {
        const { container } = render(<IconButton icon={Palette} label="Appearance" />);

        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('calls its handler', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<IconButton icon={Palette} label="Appearance" onClick={onClick} />);

        await user.click(screen.getByRole('button', { name: 'Appearance' }));

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    // The rail keeps its own colours in both themes, so it needs its own
    // hover and text tokens rather than the surface ones.
    it('takes the rail’s colours when asked', () => {
        render(<IconButton icon={Palette} label="Menu" tone="sidebar" />);

        expect(screen.getByRole('button', { name: 'Menu' }).className)
            .toContain('text-sidebar-fg-muted');
    });

    it('falls back to the surface tone for a tone it does not know', () => {
        render(<IconButton icon={Palette} label="Menu" tone="nonsense" />);

        expect(screen.getByRole('button', { name: 'Menu' }).className)
            .toContain('text-fg-muted');
    });

    // `aria-expanded`, `aria-controls` and the rest belong to the caller: this
    // is a button, not a policy about what buttons may say.
    it('passes through the attributes a caller adds', () => {
        render(
            <IconButton icon={Palette} label="Appearance" aria-expanded={true} aria-controls="panel" />
        );

        const button = screen.getByRole('button', { name: 'Appearance' });

        expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(button).toHaveAttribute('aria-controls', 'panel');
    });
});
