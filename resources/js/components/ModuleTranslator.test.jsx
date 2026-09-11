// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleTranslator from './ModuleTranslator';
import { forgetLanguages } from '../lib/languageStore';

const put = vi.fn();
const get = vi.fn();

vi.mock('../lib/api', () => ({
    default: { put: (...args) => put(...args), get: (...args) => get(...args) },
}));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const MODULE = {
    id: 4,
    slug: 'rooms',
    schema: [{ name: 'title', type: 'string', translatable: true }],
    slugs: [
        { language_code: 'el', name: 'Δωμάτια', slug: 'domatia' },
        { language_code: 'en', name: 'Rooms', slug: 'rooms' },
    ],
};

const draw = (props = {}) => {
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const result = render(
        <ModuleTranslator module={MODULE} onSaved={onSaved} onCancel={onCancel} {...props} />
    );

    return { ...result, onSaved, onCancel };
};

/** The form has loaded once the languages have arrived and drawn their blocks. */
const ready = () => screen.findByRole('group', { name: 'EL' });

beforeEach(() => {
    forgetLanguages();
    put.mockReset().mockResolvedValue({ data: { data: { ...MODULE } } });
    get.mockReset().mockResolvedValue({ data: LANGUAGES });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ModuleTranslator', () => {
    it('fills itself from the module it was given', async () => {
        draw();
        await ready();

        expect(within(screen.getByRole('group', { name: 'EL' })).getByLabelText('Module name'))
            .toHaveValue('Δωμάτια');
        expect(within(screen.getByRole('group', { name: 'Field 1' })).getByLabelText('Field name'))
            .toHaveValue('title');
    });

    /**
     * The screen's own warning, and the reason it exists: a rename rewrites the
     * listing's address and every entry page under it. #69 writes the 301s, but
     * only the person pressing save knows whether they meant to.
     */
    it('says what a rename costs before it is made', async () => {
        draw();
        await ready();

        expect(screen.getByText(/Changing an address changes every page under it/)).toBeInTheDocument();
    });

    it('puts the translations and the schema to the module’s own address', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.click(screen.getByRole('button', { name: /Save module/ }));

        await waitFor(() => expect(put).toHaveBeenCalled());

        const [url, payload] = put.mock.calls[0];
        expect(url).toBe('/modules/rooms');
        expect(payload.translations).toEqual({
            el: { name: 'Δωμάτια', slug: 'domatia' },
            en: { name: 'Rooms', slug: 'rooms' },
        });
        // `schemaPayload`'s exact shape is pinned in `moduleFields.test.js`;
        // what matters here is that the screen sends the module's own field
        // rather than a blank row.
        expect(payload.schema).toEqual([
            expect.objectContaining({ name: 'title', type: 'string', translatable: true }),
        ]);
    });

    it('sends the new address once one has been typed', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        const box = within(screen.getByRole('group', { name: 'EL' })).getByLabelText(/Address/);
        await user.clear(box);
        await user.type(box, 'dwmatia');
        await user.click(screen.getByRole('button', { name: /Save module/ }));

        await waitFor(() => expect(put).toHaveBeenCalled());
        expect(put.mock.calls[0][1].translations.el).toEqual({ name: 'Δωμάτια', slug: 'dwmatia' });
    });

    // A field already in the database cannot be renamed, retyped, made
    // translatable or removed (#115) - the API refuses all four.
    it('locks the fields the module already has', async () => {
        draw();
        await ready();

        const row = screen.getByRole('group', { name: 'Field 1' });

        expect(within(row).getByLabelText('Field name')).toBeDisabled();
        expect(within(row).getByText(/Entries have already been written/)).toBeInTheDocument();
    });

    // Adding one is additive and allowed, and the new row is not locked.
    it('lets a field be added, and leaves it editable', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.click(screen.getByRole('button', { name: /Add field/ }));

        expect(within(screen.getByRole('group', { name: 'Field 2' })).getByLabelText('Field name'))
            .toBeEnabled();
    });

    it('hands the saved module back', async () => {
        const user = userEvent.setup();
        const { onSaved } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: /Save module/ }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ slug: 'rooms' })));
    });

    it('shows why a save was refused', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: { 'translations.el.slug': ['That address is taken.'] } } };
        put.mockRejectedValue(refusal);
        draw();
        await ready();

        await user.click(screen.getByRole('button', { name: /Save module/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That address is taken.');
    });

    it('says so when the languages cannot be loaded', async () => {
        get.mockRejectedValue(new Error('Network Error'));
        draw();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    });

    /**
     * With four languages and several fields this form is taller than the
     * screen, and the swap to `PageHeader` dropped the escape at the top - so
     * the only way out was the Cancel button past every control. The other four
     * screens all keep one.
     */
    it('offers a way back without scrolling to the bottom', async () => {
        const user = userEvent.setup();
        const { onCancel } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: 'Back to modules' }));

        expect(onCancel).toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
    });

    it('leaves without saving', async () => {
        const user = userEvent.setup();
        const { onCancel } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onCancel).toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
    });
});
