// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

/** What `lib/pagination.js` reduces Laravel's envelope to. */
const meta = (over = {}) => ({
    currentPage: 2, lastPage: 4, total: 57, from: 16, to: 30, ...over,
});

const draw = (over = {}) => {
    const onPageChange = vi.fn();
    const result = render(<Pagination pagination={meta(over)} onPageChange={onPageChange} />);

    return { ...result, onPageChange };
};

describe('Pagination', () => {
    // One page is not a choice, and a control that cannot do anything is
    // clutter on every short listing.
    it.each([
        ['a single page', { lastPage: 1 }],
        ['nothing at all', null],
    ])('draws nothing for %s', (_label, over) => {
        const { container } = render(
            <Pagination pagination={over && meta(over)} onPageChange={vi.fn()} />
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('says where the reader is, in rows and in pages', () => {
        draw();

        expect(screen.getByText('Showing 16–30 of 57')).toBeInTheDocument();
        expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();
    });

    it.each([
        ['Previous', 1],
        ['Next', 3],
    ])('%s asks for page :page', async (name, expected) => {
        const user = userEvent.setup();
        const { onPageChange } = draw();

        await user.click(screen.getByRole('button', { name }));

        expect(onPageChange).toHaveBeenCalledWith(expected);
    });

    it('will not step past either end', () => {
        const { rerender } = render(<Pagination pagination={meta({ currentPage: 1 })} onPageChange={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

        rerender(<Pagination pagination={meta({ currentPage: 4 })} onPageChange={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    // A landmark, so a reader can jump to it rather than tabbing the whole
    // listing to find out whether there is a second page.
    it('is a named navigation landmark', () => {
        draw();

        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    });

    // The buttons are `type="button"`: the settings screen is a `<form>`, and a
    // bare button inside one submits it.
    it('never submits the form it may sit in', () => {
        draw();

        expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('type', 'button');
        expect(screen.getByRole('button', { name: 'Previous' })).toHaveAttribute('type', 'button');
    });
});
