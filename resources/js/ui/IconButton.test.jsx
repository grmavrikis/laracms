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

/**
 * The tone has to be a tone, not an override a caller appends.
 *
 * `hover:bg-danger-soft hover:text-danger-text` in a caller's `className`
 * reads as if it wins, and it does not: the surface tone already emits
 * `hover:bg-surface-muted hover:text-fg` at identical specificity, and Tailwind
 * orders utilities in the compiled stylesheet alphabetically rather than by the
 * order they appear in the class attribute. Measured in the built CSS:
 * `.hover\:text-danger-text:hover` is rule 658 and `.hover\:text-fg:hover` is
 * 659, so the base colour won and the remove buttons in `ModuleFields` and
 * `GalleryEditor` had no destructive hover at all.
 */
describe('IconButton, the danger tone', () => {
    it('paints its own hover colours', () => {
        render(<IconButton icon={Palette} label="Remove" tone="danger" />);

        const className = screen.getByRole('button', { name: 'Remove' }).className;

        expect(className).toContain('hover:bg-danger-soft');
        expect(className).toContain('hover:text-danger-text');
    });

    // The whole point: two utilities for one property, on one element, is the
    // defect. A tone replaces, it does not stack.
    it.each([
        ['hover:text-fg'],
        ['hover:bg-surface-muted'],
    ])('does not also carry the surface tone’s %s', (utility) => {
        render(<IconButton icon={Palette} label="Remove" tone="danger" />);

        const className = screen.getByRole('button', { name: 'Remove' }).className;

        // `hover:text-fg` must not appear as a whole class - `hover:text-fg-muted`
        // is a different utility and may.
        expect(className.split(/\s+/)).not.toContain(utility);
    });

    it('is still a resting icon button until it is hovered', () => {
        render(<IconButton icon={Palette} label="Remove" tone="danger" />);

        expect(screen.getByRole('button', { name: 'Remove' }).className.split(/\s+/))
            .toContain('text-fg-muted');
    });
});
