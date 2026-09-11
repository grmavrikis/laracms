// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Preview from './Preview';

describe('Preview', () => {
    /**
     * The rule this component exists to enforce (#117, the note at the top of
     * the item): anything drawn from invented data must **say so on the
     * screen**, not only in a commit message.
     *
     * A dashboard that shows 47 room views last week, convincingly, is worse
     * than one that shows nothing: the owner makes a decision on it. CHANGELOG
     * §27 is the same lesson one layer down, where a green test described a
     * world that did not exist.
     */
    it('says the figures are not real, in words', () => {
        render(<Preview>{<p>47 views</p>}</Preview>);

        expect(screen.getByText('Sample data')).toBeInTheDocument();
        expect(screen.getByText(/not from your site/i)).toBeInTheDocument();
    });

    it('still shows what it wraps', () => {
        render(<Preview><p>47 views</p></Preview>);

        expect(screen.getByText('47 views')).toBeInTheDocument();
    });

    // The marker is a colour and a border to a sighted reader; this is what
    // carries the same fact to somebody who has neither.
    it('is a region a reader can find, named by the warning', () => {
        render(<Preview><p>47 views</p></Preview>);

        const region = screen.getByRole('region', { name: /Sample data/ });

        expect(within(region).getByText('47 views')).toBeInTheDocument();
    });

    // Some blocks need to say which numbers are invented and why; the default
    // wording covers the ordinary case.
    it('takes a sentence of its own', () => {
        render(<Preview note="Entry counts need an endpoint that does not exist yet."><p>3</p></Preview>);

        expect(screen.getByText(/Entry counts need an endpoint/)).toBeInTheDocument();
    });
});

/**
 * The note is the *specific* half of the warning: the default says a block is
 * invented, a note says **which** part of the screen is. Announcing the default
 * over a caller's note does not merely lose detail - on the dashboard it
 * reverses the meaning, telling a reader the whole region is examples when only
 * the counts are.
 */
describe('Preview, what it announces', () => {
    it('announces the note it was given, not the default', () => {
        render(
            <Preview note="The counts below are examples. Everything else is your own.">
                <p>3</p>
            </Preview>
        );

        const name = screen.getByRole('region').getAttribute('aria-label');

        expect(name).toContain('Sample data');
        expect(name).toContain('The counts below are examples');
        expect(name).not.toContain('not from your site');
    });

    it('falls back to the default when no note is given', () => {
        render(<Preview><p>3</p></Preview>);

        expect(screen.getByRole('region').getAttribute('aria-label'))
            .toContain('not from your site');
    });

    // The visible sentence and the announced one must not drift apart, which is
    // the whole defect: one said "only the counts", the other "everything".
    it('says the same thing to both readers', () => {
        render(<Preview note="Only the counts are invented."><p>3</p></Preview>);

        const region = screen.getByRole('region');

        expect(region.getAttribute('aria-label')).toContain('Only the counts are invented.');
        expect(region).toHaveTextContent('Only the counts are invented.');
    });
});
