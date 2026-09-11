// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleBuilder from './ModuleBuilder';
import { forgetLanguages } from '../lib/languageStore';

const post = vi.fn();
const get = vi.fn();

vi.mock('../lib/api', () => ({
    default: { post: (...args) => post(...args), get: (...args) => get(...args) },
}));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

const draw = (props = {}) => {
    const onCreated = vi.fn();
    const onCancel = vi.fn();
    const result = render(<ModuleBuilder onCreated={onCreated} onCancel={onCancel} {...props} />);

    return { ...result, onCreated, onCancel };
};

const ready = () => screen.findByRole('group', { name: 'EL' });

const nameIn = (code) => within(screen.getByRole('group', { name: code })).getByLabelText('Module name');

const create = (user) => user.click(screen.getByRole('button', { name: /Create module/ }));

/**
 * The least a module can be: one named field. The name box carries `required`,
 * so a form without it never reaches the API at all - which is correct, and
 * means every test that submits has to satisfy it.
 */
const nameTheField = (user, name = 'title') => user.type(
    within(screen.getByRole('group', { name: 'Field 1' })).getByLabelText('Field name'),
    name
);

beforeEach(() => {
    forgetLanguages();
    post.mockReset().mockResolvedValue({ data: { data: { id: 9, slug: 'rooms' } } });
    get.mockReset().mockResolvedValue({ data: LANGUAGES });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ModuleBuilder', () => {
    it('opens on one blank field, because a module with none holds nothing', async () => {
        draw();
        await ready();

        expect(screen.getByRole('group', { name: 'Field 1' })).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Field 2' })).not.toBeInTheDocument();
    });

    it('asks for a name in every language', async () => {
        draw();
        await ready();

        expect(nameIn('EL')).toBeInTheDocument();
        expect(nameIn('EN')).toBeInTheDocument();
    });

    /**
     * **There is deliberately no slugify in the browser.** This screen used to
     * transliterate the name itself and send the result, from a Greek-only
     * character map that disagreed with the backend's `Str::slug`: "Café
     * München" became `caf-m-nch-n` here and `cafe-munchen` on the server.
     * Leaving the address out is how the form says *derive it*.
     */
    it('sends no address when none was typed', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.type(nameIn('EL'), 'Δωμάτια');
        await user.type(within(screen.getByRole('group', { name: 'Field 1' })).getByLabelText('Field name'), 'title');
        await create(user);

        await waitFor(() => expect(post).toHaveBeenCalled());

        const [url, payload] = post.mock.calls[0];
        expect(url).toBe('/modules');
        expect(payload.translations).toEqual({ el: { name: 'Δωμάτια' } });
    });

    /**
     * The panel's own key, which never moves again once created. It comes from
     * the **default** language so the module reads sensibly in the admin list;
     * what a visitor reads comes from `translations`.
     */
    it('takes the panel’s name from the default language', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        // English **first**, so the default language is not simply the first
        // key in the map. Filling Greek first made this pass against a version
        // that ignored `defaultLangCode` entirely and took whatever came first
        // - which the mutation check caught and this ordering fixes.
        await user.type(nameIn('EN'), 'Rooms');
        await user.type(nameIn('EL'), 'Δωμάτια');
        await nameTheField(user);
        await create(user);

        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][1].name).toBe('Δωμάτια');
        expect(post.mock.calls[0][1].translations.en.name).toBe('Rooms');
    });

    // A module named in English only still needs a key, or the admin list shows
    // a blank row.
    it('falls back to whichever language was filled in', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.type(nameIn('EN'), 'Rooms');
        await nameTheField(user);
        await create(user);

        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][1].name).toBe('Rooms');
    });

    // "About" is one entry; "Blog" is many (TASKS.md #60). Worded as what the
    // client will see rather than as a flag, because that is the decision.
    it('offers the single-page choice, and sends it', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        const box = screen.getByRole('checkbox', { name: /single page/ });
        expect(box).not.toBeChecked();

        await user.click(box);
        await user.type(nameIn('EL'), 'Επικοινωνία');
        await nameTheField(user);
        await create(user);

        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][1].is_singleton).toBe(true);
    });

    it('sends the fields that were described', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        const row = screen.getByRole('group', { name: 'Field 1' });
        await user.type(within(row).getByLabelText('Field name'), 'sleeps');
        await user.selectOptions(within(row).getByLabelText('Type'), 'integer');
        await user.click(within(row).getByRole('checkbox', { name: /Required/ }));
        await user.type(nameIn('EL'), 'Δωμάτια');
        await create(user);

        await waitFor(() => expect(post).toHaveBeenCalled());
        expect(post.mock.calls[0][1].schema).toEqual([
            expect.objectContaining({ name: 'sleeps', type: 'integer', required: true }),
        ]);
    });

    it('hands the created module back and empties itself', async () => {
        const user = userEvent.setup();
        const { onCreated } = draw();
        await ready();

        await user.type(nameIn('EL'), 'Δωμάτια');
        await nameTheField(user);
        await create(user);

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 9, slug: 'rooms' }));
        await waitFor(() => expect(nameIn('EL')).toHaveValue(''));
    });

    it('shows why a create was refused', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: { name: ['That name is taken.'] } } };
        post.mockRejectedValue(refusal);
        draw();
        await ready();

        await nameTheField(user);
        await create(user);

        expect(await screen.findByRole('alert')).toHaveTextContent('That name is taken.');
    });

    it('says so when the languages cannot be loaded', async () => {
        get.mockRejectedValue(new Error('Network Error'));
        draw();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    });

    it('leaves without creating anything', async () => {
        const user = userEvent.setup();
        const { onCancel } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onCancel).toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
    });
});
