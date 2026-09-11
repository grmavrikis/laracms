// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Alert from './Alert';

describe('Alert', () => {
    /**
     * The reason this is a component rather than six copies of a class string.
     *
     * A banner that appears after a failed save is the one thing on the screen
     * that has to interrupt: it arrives after the press, often below the fold,
     * and without a live role a reader is simply left on a form that did
     * nothing. `EntryForm` had it; the five screens that copied its markup did
     * not.
     */
    it('announces itself', () => {
        render(<Alert messages={['That address is taken.']} />);

        expect(screen.getByRole('alert')).toHaveTextContent('That address is taken.');
    });

    it('lists every message it was given', () => {
        render(<Alert messages={['One.', 'Two.']} />);

        expect(screen.getByRole('alert')).toHaveTextContent('One.');
        expect(screen.getByRole('alert')).toHaveTextContent('Two.');
    });

    // Call sites hold `[]` between attempts and would otherwise draw an empty
    // red box over the form.
    it.each([[[]], [null], [undefined]])('draws nothing for %s', (messages) => {
        const { container } = render(<Alert messages={messages} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('takes a single string as readily as a list', () => {
        render(<Alert messages="Could not reach the server." />);

        expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    });

    /**
     * `status` rather than `alert` for anything that is not a failure: `alert`
     * is assertive and interrupts whatever is being read, which is right for a
     * refused save and wrong for "saved".
     */
    it('is polite when it carries good news', () => {
        render(<Alert tone="success" messages={['Saved.']} />);

        expect(screen.getByRole('status')).toHaveTextContent('Saved.');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
