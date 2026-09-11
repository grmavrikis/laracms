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
