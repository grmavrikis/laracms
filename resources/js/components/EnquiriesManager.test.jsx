// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnquiriesManager from './EnquiriesManager';

const get = vi.fn();
const del = vi.fn();

vi.mock('../lib/api', () => ({
    default: { get: (...args) => get(...args), delete: (...args) => del(...args) },
}));

const ENQUIRY = {
    id: 12,
    name: 'Maria Papadopoulou',
    email: 'maria@example.com',
    phone: '+30 6900000000',
    message: 'Do you have a room for two?',
    language_code: 'el',
    created_at: '2026-09-03T14:30:00Z',
    arrives_on: '2026-07-14',
    departs_on: '2026-07-21',
    guests: 2,
    source_url: 'https://villathea.gr/el/epikoinonia',
};

/** Laravel's paginator envelope, which `lib/pagination.js` reduces. */
const page = (rows, over = {}) => ({
    data: rows,
    current_page: 1, last_page: 1, total: rows.length, from: 1, to: rows.length,
    ...over,
});

const draw = (props = {}) => {
    const onBack = vi.fn();
    const result = render(<EnquiriesManager onBack={onBack} {...props} />);

    return { ...result, onBack };
};

const row = (name) => screen.getByRole('article', { name: new RegExp(name) });

beforeEach(() => {
    get.mockReset().mockResolvedValue({ data: page([ENQUIRY]) });
    del.mockReset().mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('EnquiriesManager', () => {
    it('shows what somebody sent', async () => {
        draw();

        expect(await screen.findByText('Maria Papadopoulou')).toBeInTheDocument();
        expect(screen.getByText('Do you have a room for two?')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'maria@example.com' }))
            .toHaveAttribute('href', 'mailto:maria@example.com');
    });

    /**
     * **`toLocaleString()` with no argument formats in the browser's locale**,
     * not the panel's - so a Greek panel on an English-language machine printed
     * `9/3/2026`, which reads as the ninth of March. `lib/format.js` exists for
     * exactly this and was written in item 13 after the same defect in
     * `EntryForm`; this screen kept its own two helpers and never got the fix.
     */
    it('formats dates in the panel’s language, not the browser’s', async () => {
        draw();
        await screen.findByText('Maria Papadopoulou');

        // `test/setup.js` runs the panel in English, so `formatDate` answers a
        // medium English date rather than a US numeric one.
        expect(screen.getByText(/Jul 14, 2026/)).toBeInTheDocument();
        expect(screen.queryByText(/7\/14\/2026/)).not.toBeInTheDocument();
    });

    it('marks the arrival and departure as dates a machine can read', async () => {
        draw();
        await screen.findByText('Maria Papadopoulou');

        const times = [...document.querySelectorAll('time')].map((el) => el.getAttribute('dateTime'));

        expect(times).toContain('2026-07-14');
        expect(times).toContain('2026-09-03T14:30:00Z');
    });

    // Each enquiry is a self-contained thing to read, and a reader needs to be
    // able to move between them rather than through them.
    it('gives each enquiry a landmark of its own, named by its sender', async () => {
        draw();
        await screen.findByText('Maria Papadopoulou');

        expect(row('Maria Papadopoulou')).toBeInTheDocument();
    });

    it('says how many there are, and for how long they are kept', async () => {
        draw();

        expect(await screen.findByText(/1 received/)).toBeInTheDocument();
        expect(screen.getByText(/then deleted/)).toBeInTheDocument();
    });

    it('says so when there are none', async () => {
        get.mockResolvedValue({ data: page([]) });
        draw();

        expect(await screen.findByText('No enquiries yet')).toBeInTheDocument();
    });

    it('announces why the list could not be loaded', async () => {
        get.mockRejectedValue(new Error('Network Error'));
        draw();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    });
});

/**
 * Deletion is permanent and asks first: an enquiry is somebody's personal data
 * and a wrong click cannot be undone.
 */
describe('EnquiriesManager, deleting', () => {
    // A column of identical `Delete` buttons says nothing about which row it
    // belongs to - the same defect the gallery and the field editor carried.
    it('names the control by whose enquiry it removes', async () => {
        draw();
        await screen.findByText('Maria Papadopoulou');

        expect(screen.getByRole('button', { name: 'Delete the enquiry from Maria Papadopoulou' }))
            .toBeInTheDocument();
    });

    it('asks before it deletes', async () => {
        const user = userEvent.setup();
        draw();
        await screen.findByText('Maria Papadopoulou');

        await user.click(screen.getByRole('button', { name: /Delete the enquiry/ }));

        expect(screen.getByText('Delete permanently?')).toBeInTheDocument();
        expect(del).not.toHaveBeenCalled();
    });

    it('deletes once it has been confirmed', async () => {
        const user = userEvent.setup();
        draw();
        await screen.findByText('Maria Papadopoulou');

        await user.click(screen.getByRole('button', { name: /Delete the enquiry/ }));
        await user.click(within(row('Maria Papadopoulou')).getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(del).toHaveBeenCalledWith('/enquiries/12'));
    });

    it('lets the wrong click be taken back', async () => {
        const user = userEvent.setup();
        draw();
        await screen.findByText('Maria Papadopoulou');

        await user.click(screen.getByRole('button', { name: /Delete the enquiry/ }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByText('Delete permanently?')).not.toBeInTheDocument();
        expect(del).not.toHaveBeenCalled();
    });

    it('announces a deletion that failed', async () => {
        const user = userEvent.setup();
        del.mockRejectedValue(new Error('Network Error'));
        draw();
        await screen.findByText('Maria Papadopoulou');

        await user.click(screen.getByRole('button', { name: /Delete the enquiry/ }));
        await user.click(within(row('Maria Papadopoulou')).getByRole('button', { name: 'Delete' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    });
});

describe('EnquiriesManager, more than one page', () => {
    it('offers the shared pagination once there is a second page', async () => {
        get.mockResolvedValue({ data: page([ENQUIRY], { last_page: 3, total: 41, from: 1, to: 15 }) });
        draw();
        await screen.findByText('Maria Papadopoulou');

        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    });

    it('hides it when everything fits on one', async () => {
        draw();
        await screen.findByText('Maria Papadopoulou');

        expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    });

    it('asks the API for the page it moved to', async () => {
        const user = userEvent.setup();
        get.mockResolvedValue({ data: page([ENQUIRY], { last_page: 3, total: 41, from: 1, to: 15 }) });
        draw();
        await screen.findByText('Maria Papadopoulou');

        await user.click(screen.getByRole('button', { name: 'Next' }));

        await waitFor(() => {
            expect(get).toHaveBeenLastCalledWith('/enquiries', { params: { page: 2 } });
        });
    });
});
