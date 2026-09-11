// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from './Link';

const draw = (props = {}) => {
    const onNavigate = vi.fn();
    const result = render(
        <Link href="/admin/modules" onNavigate={onNavigate} {...props}>Modules</Link>
    );

    return { ...result, onNavigate };
};

/**
 * **An anchor, not a button.** Middle-click, ctrl-click and "copy link address"
 * all work on one and none of them work on the other, and a panel whose links
 * cannot be opened in a new tab is a panel that feels like a toy.
 *
 * The guard was written out by hand three times - `SidebarLink` and twice in
 * `Dashboard` - and the two later copies had already dropped the
 * `defaultPrevented` check, so a parent that had handled the click was honoured
 * in the rail and ignored on the dashboard.
 */
describe('Link', () => {
    it('carries a real address', () => {
        draw();

        expect(screen.getByRole('link', { name: 'Modules' })).toHaveAttribute('href', '/admin/modules');
    });

    it('navigates in the panel on a plain click', async () => {
        const user = userEvent.setup();
        const { onNavigate } = draw();

        await user.click(screen.getByRole('link', { name: 'Modules' }));

        expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    // Every one of these means "the browser should do its own thing".
    it.each([
        ['ctrl', '{Control>}[MouseLeft]{/Control}'],
        ['shift', '{Shift>}[MouseLeft]{/Shift}'],
        ['alt', '{Alt>}[MouseLeft]{/Alt}'],
        ['meta', '{Meta>}[MouseLeft]{/Meta}'],
    ])('stands aside for a %s click', async (_name, keys) => {
        const user = userEvent.setup();
        const { onNavigate } = draw();

        screen.getByRole('link', { name: 'Modules' }).focus();
        await user.keyboard(keys);

        expect(onNavigate).not.toHaveBeenCalled();
    });

    // The check the two hand-written copies had lost: something upstream has
    // already decided what this click means.
    it('stands aside when the click was already handled', async () => {
        const user = userEvent.setup();
        const onNavigate = vi.fn();

        render(
            <div onClickCapture={(e) => e.preventDefault()}>
                <Link href="/admin/modules" onNavigate={onNavigate}>Modules</Link>
            </div>
        );

        await user.click(screen.getByRole('link', { name: 'Modules' }));

        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('passes a caller’s attributes through', () => {
        draw({ 'aria-label': 'Two modules', className: 'rounded-xl' });

        const link = screen.getByRole('link', { name: 'Two modules' });

        expect(link.className).toContain('rounded-xl');
    });
});
