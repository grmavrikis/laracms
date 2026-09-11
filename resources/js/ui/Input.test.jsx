// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input, Select, Checkbox, CHECKBOX_CLASSES, INPUT_CLASSES } from './Input';

describe('Input', () => {
    it('keeps the class string one string', () => {
        render(<Input aria-label="Name" className="font-mono" />);

        const box = screen.getByLabelText('Name');

        expect(box.className).toContain(INPUT_CLASSES.split(' ')[0]);
        expect(box.className).toContain('font-mono');
    });

    it('passes a caller’s attributes through', () => {
        render(<Input aria-label="Name" type="date" required />);

        expect(screen.getByLabelText('Name')).toBeRequired();
        expect(screen.getByLabelText('Name')).toHaveAttribute('type', 'date');
    });
});

describe('Select', () => {
    it('renders the options it is given', () => {
        render(<Select aria-label="Type"><option value="a">A</option></Select>);

        expect(screen.getByRole('option', { name: 'A' })).toHaveValue('a');
    });
});

/**
 * **`text-*` is inert on a native checkbox.** It sets `color`, which the
 * control does not use; `accent-color` is the property that tints the box and
 * its tick, and Tailwind's utility for it is `accent-*`.
 *
 * Every checkbox in the panel carried `text-accent` or `text-accent-text` and
 * therefore painted the **browser default blue**, measured live on the
 * new-module screen with emerald active: `accent-color: auto` while
 * `--ui-accent` was `#34d399`. Six controls across five files, in all six
 * palettes and both themes - the one place the token layer did not reach.
 */
describe('Checkbox', () => {
    it('tints itself from the accent, which `text-*` cannot do', () => {
        const classes = CHECKBOX_CLASSES.split(/\s+/);

        expect(classes).toContain('accent-accent');
        expect(classes).not.toContain('text-accent');
        expect(classes).not.toContain('text-accent-text');
    });

    it('renders a checkbox carrying them', () => {
        render(<Checkbox aria-label="Featured" />);

        const box = screen.getByRole('checkbox', { name: 'Featured' });

        expect(box).toHaveAttribute('type', 'checkbox');
        expect(box.className.split(/\s+/)).toContain('accent-accent');
    });

    it('reports its state and takes a caller’s attributes', () => {
        render(<Checkbox aria-label="Featured" checked readOnly disabled />);

        expect(screen.getByRole('checkbox', { name: 'Featured' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Featured' })).toBeDisabled();
    });
});
