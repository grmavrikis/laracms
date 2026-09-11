// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsManager from './SettingsManager';
import { forgetLanguages } from '../lib/languageStore';

const get = vi.fn();
const put = vi.fn();
const uploadImage = vi.fn();

vi.mock('../lib/api', () => ({
    default: { get: (...args) => get(...args), put: (...args) => put(...args) },
    uploadImage: (...args) => uploadImage(...args),
}));

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
];

/**
 * The server declares the form (#67): `GET /api/settings` hands over the schema
 * as well as the values, and the labels arrive **already translated**, so
 * nothing here has to know a field name.
 */
const SCHEMA = [
    { name: 'site_name', label: 'Site name', type: 'string', group: 'core' },
    { name: 'default_locale', label: 'Default language', type: 'select', options: ['el', 'en'], group: 'core' },
    { name: 'maintenance', label: 'Maintenance mode', type: 'boolean', group: 'core' },
    { name: 'logo', label: 'Logo', type: 'image', group: 'core' },
    { name: 'tagline', label: 'Tagline', type: 'string', translatable: true, group: 'core' },
    { name: 'email', label: 'Email address', type: 'string', group: 'contact' },
    { name: 'phone', label: 'Telephone', type: 'string', group: 'contact' },
];

const VALUES = {
    site_name: 'Villa Thea',
    default_locale: 'el',
    maintenance: false,
    logo: null,
    tagline: { el: 'Θέα στη θάλασσα', en: 'Sea view' },
    email: 'hello@villathea.gr',
    phone: '',
};

const draw = (props = {}) => {
    const onBack = vi.fn();
    const result = render(<SettingsManager onBack={onBack} {...props} />);

    return { ...result, onBack };
};

/** The form has arrived once the first field is on screen. */
const ready = () => screen.findByLabelText('Site name');

const save = (user) => user.click(screen.getByRole('button', { name: /Save settings/ }));

beforeEach(() => {
    forgetLanguages();
    get.mockReset().mockImplementation((url) => {
        if (url === '/languages') return Promise.resolve({ data: LANGUAGES });
        return Promise.resolve({ data: { schema: SCHEMA, data: { ...VALUES } } });
    });
    put.mockReset().mockImplementation((_url, body) => Promise.resolve({ data: { data: body.data } }));
    uploadImage.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

/**
 * TASKS.md #121, and the third file to carry the same defect.
 *
 * `SettingsManager` contained no `htmlFor` at all: its `<label>` sat as a
 * *sibling* of the control rather than wrapping it, so every input on the
 * screen - text, select, boolean, image - was announced as an unnamed box.
 */
describe('SettingsManager, naming its controls', () => {
    it.each([
        ['Site name', 'Villa Thea'],
        ['Email address', 'hello@villathea.gr'],
        ['Telephone', ''],
    ])('labels the %s box', async (label, value) => {
        draw();
        await ready();

        expect(screen.getByLabelText(label)).toHaveValue(value);
    });

    it('labels the select, and offers what the server declared', async () => {
        draw();
        await ready();

        const select = screen.getByLabelText('Default language');

        expect(select).toHaveValue('el');
        expect(within(select).getByRole('option', { name: 'EN' })).toBeInTheDocument();
    });

    // The boolean rendered its own `<label>` carrying `field.label` *under* the
    // field label already showing it, so the words appeared twice on screen and
    // the control had two labels - which readers announce differently.
    it('gives the switch exactly one label', async () => {
        draw();
        await ready();

        expect(screen.getByRole('checkbox', { name: 'Maintenance mode' })).not.toBeChecked();
        expect(screen.getAllByText('Maintenance mode')).toHaveLength(1);
    });

    it('labels the file picker, which had none at all', async () => {
        draw();
        await ready();

        expect(screen.getByLabelText('Logo')).toHaveAttribute('type', 'file');
    });

    // A translatable setting is one box per language, and the code beside each
    // was a `span` - the same defect as the gallery's alt text and the module
    // translator's names.
    it('names each language of a translatable setting', async () => {
        draw();
        await ready();

        const group = screen.getByRole('group', { name: 'Tagline' });

        expect(within(group).getByLabelText('el')).toHaveValue('Θέα στη θάλασσα');
        expect(within(group).getByLabelText('en')).toHaveValue('Sea view');
    });
});

describe('SettingsManager, grouped and saving', () => {
    // `[...new Set(schema.map(f => f.group))]` - the server decides the
    // grouping, and the screen only decides the wording of the two headings.
    it('sorts the fields into the groups the server declared', async () => {
        draw();
        await ready();

        expect(screen.getByRole('heading', { name: 'This installation' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Contact details' })).toBeInTheDocument();
    });

    /**
     * **The whole form is sent, not a patch.** Clearing a value has to actually
     * clear it, and a merge would make "remove my phone number" impossible.
     */
    it('sends every field, including the one just emptied', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.clear(screen.getByLabelText('Email address'));
        await user.type(screen.getByLabelText('Site name'), '!');
        await save(user);

        await waitFor(() => expect(put).toHaveBeenCalled());

        const [url, body] = put.mock.calls[0];
        expect(url).toBe('/settings');
        expect(body.data.email).toBe('');
        expect(body.data.site_name).toBe('Villa Thea!');
        expect(body.data.phone).toBe('');
        expect(body.data.tagline).toEqual({ el: 'Θέα στη θάλασσα', en: 'Sea view' });
    });

    it('saves a translation against its own language', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        const group = screen.getByRole('group', { name: 'Tagline' });
        await user.type(within(group).getByLabelText('en'), 's');
        await save(user);

        await waitFor(() => expect(put).toHaveBeenCalled());
        expect(put.mock.calls[0][1].data.tagline).toEqual({ el: 'Θέα στη θάλασσα', en: 'Sea views' });
    });

    it('saves the switch as a boolean, which the rule demands', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await user.click(screen.getByRole('checkbox', { name: 'Maintenance mode' }));
        await save(user);

        await waitFor(() => expect(put).toHaveBeenCalled());
        expect(put.mock.calls[0][1].data.maintenance).toBe(true);
    });

    // Announced, not a silent green word: the button is at the bottom of a long
    // form and the confirmation is the only sign anything happened.
    it('says it saved, out loud', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await save(user);

        expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    });

    it('stops saying so the moment something changes again', async () => {
        const user = userEvent.setup();
        draw();
        await ready();

        await save(user);
        await screen.findByRole('status');

        await user.type(screen.getByLabelText('Site name'), '!');

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});

describe('SettingsManager, when something fails', () => {
    /**
     * The banner carries only what has no field to sit beside.
     *
     * A 422 naming `data.email` is already rendered under the email box, so
     * repeating it at the top says the same thing twice and buries anything
     * that genuinely belongs to no field - the rule `EntryForm` settled.
     */
    it('banners what belongs to no field, and only that', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: {
            'data.email': ['That address is not valid.'],
            data: ['The settings could not be stored.'],
        } } };
        put.mockRejectedValue(refusal);
        draw();
        await ready();

        await save(user);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('The settings could not be stored.');
        expect(alert).not.toHaveTextContent('That address is not valid.');
    });

    it('says nothing at the top when every message found its field', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: { 'data.email': ['That address is not valid.'] } } };
        put.mockRejectedValue(refusal);
        draw();
        await ready();

        await save(user);

        await waitFor(() => expect(screen.getByText('That address is not valid.')).toBeInTheDocument());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // Filed under `data.<name>` and, for a translatable field,
    // `data.<name>.<code>` - so a complaint about the English tagline appears
    // under the English box rather than the Greek one.
    it('puts a field’s complaint beside that field', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: { 'data.email': ['That address is not valid.'] } } };
        put.mockRejectedValue(refusal);
        draw();
        await ready();

        await save(user);

        await waitFor(() => expect(screen.getByText('That address is not valid.')).toBeInTheDocument());
    });

    it('says so when the settings cannot be loaded at all', async () => {
        get.mockRejectedValue(new Error('Network Error'));
        draw();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    });

    it('reports an upload the endpoint refused', async () => {
        const user = userEvent.setup();
        const refusal = new Error('422');
        refusal.response = { status: 422, data: { errors: { image: ['The image may not be larger than 4 MB.'] } } };
        uploadImage.mockRejectedValue(refusal);
        draw();
        await ready();

        await user.upload(screen.getByLabelText('Logo'), new File(['x'], 'big.png', { type: 'image/png' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('The image may not be larger than 4 MB.');
    });
});

describe('SettingsManager, leaving', () => {
    it('offers a way back', async () => {
        const user = userEvent.setup();
        const { onBack } = draw();
        await ready();

        await user.click(screen.getByRole('button', { name: /Back to modules/ }));

        expect(onBack).toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
    });
});
