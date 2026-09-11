// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { forgetModules } from '../lib/moduleStore';
import { forgetLanguages } from '../lib/languageStore';

const get = vi.fn();

vi.mock('../lib/api', () => ({ default: { get: (...args) => get(...args) } }));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const MODULES = [
    { id: 1, slug: 'rooms', name: 'Rooms', slugs: [{ language_code: 'en', name: 'Rooms', slug: 'rooms' }] },
    { id: 2, slug: 'facilities', name: 'Facilities', slugs: [{ language_code: 'en', name: 'Facilities', slug: 'facilities' }] },
];

const INBOX = {
    data: [
        { id: 9, name: 'Maria', email: 'maria@example.com', created_at: '2026-09-03T14:30:00Z' },
        { id: 8, name: 'Nikos', email: 'nikos@example.com', created_at: '2026-09-02T10:00:00Z' },
    ],
    current_page: 1, last_page: 3, total: 41, from: 1, to: 15,
};

const draw = (props = {}) => {
    const navigate = vi.fn();
    const result = render(<Dashboard navigate={navigate} {...props} />);

    return { ...result, navigate };
};

const ready = () => screen.findByRole('heading', { name: 'Your sections' });

beforeEach(() => {
    forgetModules();
    forgetLanguages();
    get.mockReset().mockImplementation((url) => {
        if (url === '/languages') return Promise.resolve({ data: LANGUAGES });
        if (url === '/modules') return Promise.resolve({ data: MODULES });
        return Promise.resolve({ data: INBOX });
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * The phase rule, applied rather than assumed: **real where an endpoint already
 * exists, invented where one does not.** `/api/modules` and `/api/enquiries`
 * are both served today, so those numbers are the site's own; a count of
 * entries per module is not, so it is drawn and marked.
 */
describe('Dashboard, the numbers that are real', () => {
    it('counts the sections the site actually has', async () => {
        draw();
        await ready();

        const sections = screen.getByRole('link', { name: /Modules/ });

        expect(within(sections).getByText('2')).toBeInTheDocument();
    });

    // Read from the paginator's `total`, not from the rows on the first page -
    // the inbox holds 41 and the endpoint answers fifteen at a time.
    it('counts every enquiry, not the ones on the first page', async () => {
        draw();
        await ready();

        expect(within(screen.getByRole('link', { name: /Enquiries/ })).getByText('41')).toBeInTheDocument();
    });

    it('shows the most recent enquiries, dated in the panel’s language', async () => {
        draw();
        await ready();

        expect(screen.getByText('Maria')).toBeInTheDocument();
        expect(screen.getByText(/Sep 3, 2026/)).toBeInTheDocument();
    });

    it('lists the sections by the name this reader sees', async () => {
        draw();
        await ready();

        expect(screen.getByRole('link', { name: /Rooms/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Facilities/ })).toBeInTheDocument();
    });
});

/**
 * A dashboard showing an invented figure convincingly is worse than one showing
 * nothing: the owner makes a decision on it. The marker is the whole point of
 * this item, so the entry counts may not sit outside it.
 */
describe('Dashboard, the numbers that are not', () => {
    it('keeps the entry counts inside the marker', async () => {
        draw();
        await ready();

        const marked = screen.getByRole('region', { name: /Sample data/ });

        expect(within(marked).getByRole('link', { name: /Rooms/ })).toBeInTheDocument();
    });

    it('says which part of the screen is invented', async () => {
        draw();
        await ready();

        expect(screen.getByText(/The counts below are examples/)).toBeInTheDocument();
    });

    // The same row must not show a different number on the next render, or the
    // screen looks like it is measuring something.
    it('draws a figure that does not move between renders', async () => {
        const { rerender } = render(<Dashboard navigate={vi.fn()} />);
        await ready();

        const before = screen.getByRole('link', { name: /Rooms/ }).textContent;
        rerender(<Dashboard navigate={vi.fn()} />);

        expect(screen.getByRole('link', { name: /Rooms/ }).textContent).toBe(before);
    });
});

describe('Dashboard, getting somewhere', () => {
    it.each([
        [/Modules/, 'modules', undefined],
        [/Enquiries/, 'enquiries', undefined],
    ])('%s leads to its screen', async (name, route) => {
        const user = userEvent.setup();
        const { navigate } = draw();
        await ready();

        await user.click(screen.getByRole('link', { name }));

        expect(navigate).toHaveBeenCalledWith(route, undefined);
    });

    it('opens a section’s entries', async () => {
        const user = userEvent.setup();
        const { navigate } = draw();
        await ready();

        await user.click(screen.getByRole('link', { name: /Rooms/ }));

        expect(navigate).toHaveBeenCalledWith('entries', { module: 'rooms' });
    });

    // Anchors, not buttons: middle-click and "open in new tab" are how anybody
    // actually works through a list of sections.
    it('is an anchor carrying a real address', async () => {
        draw();
        await ready();

        expect(screen.getByRole('link', { name: /Rooms/ }))
            .toHaveAttribute('href', '/admin/content/rooms');
    });
});

describe('Dashboard, when nothing loads', () => {
    it('announces the failure rather than drawing zeroes', async () => {
        get.mockRejectedValue(new Error('Network Error'));
        draw();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
        expect(screen.queryByRole('region', { name: /Sample data/ })).not.toBeInTheDocument();
    });

    it('says so when the site has no sections yet', async () => {
        get.mockImplementation((url) => {
            if (url === '/languages') return Promise.resolve({ data: LANGUAGES });
            if (url === '/modules') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: { ...INBOX, data: [], total: 0 } });
        });
        draw();
        await ready();

        expect(screen.getByText('No sections yet.')).toBeInTheDocument();
        expect(screen.getByText('No enquiries yet')).toBeInTheDocument();
    });
});
