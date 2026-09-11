// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModuleTranslations, { translationsPayload, translationsFrom } from './ModuleTranslations';

const LANGUAGES = [
    { id: 1, code: 'el', is_default: true, is_active: true },
    { id: 2, code: 'en', is_active: true },
    { id: 3, code: 'fr', is_active: false },
];

const draw = (props = {}) => {
    const onChange = vi.fn();
    const result = render(
        <ModuleTranslations languages={LANGUAGES} value={{}} onChange={onChange} {...props} />
    );

    return { ...result, onChange };
};

/** The block for one language - three languages is six identical boxes. */
const block = (code) => screen.getByRole('group', { name: code.toUpperCase() });

describe('ModuleTranslations', () => {
    /**
     * `getLangCode` answers `null` for a row carrying no locale, code or
     * short_code, and `null.toUpperCase()` is a TypeError - so the group name
     * took the whole panel to the ErrorBoundary where the old markup had drawn
     * one odd-looking block. `languages.code` is NOT NULL today, which makes
     * this latent rather than live; `lib/languages.js` guards the case anyway,
     * because it caused a real bug once.
     */
    it('draws a language carrying no code rather than throwing', () => {
        expect(() => render(
            <ModuleTranslations languages={[{ id: 9 }]} value={{}} onChange={vi.fn()} />
        )).not.toThrow();
    });

    it('asks once per language', () => {
        draw();

        expect(screen.getAllByRole('group')).toHaveLength(3);
    });

    // Six boxes that look alike, and the language code was a `span` beside an
    // input - which associates with nothing.
    it('labels both boxes, inside the language they belong to', () => {
        draw({ value: { el: { name: 'Δωμάτια', slug: 'domatia' } } });

        expect(within(block('el')).getByLabelText('Module name')).toHaveValue('Δωμάτια');
        expect(within(block('el')).getByLabelText(/Address/)).toHaveValue('domatia');
        expect(within(block('en')).getByLabelText('Module name')).toHaveValue('');
    });

    it('reports an edit against its own language and key', async () => {
        const user = userEvent.setup();
        const { onChange } = draw();

        await user.type(within(block('en')).getByLabelText('Module name'), 'R');

        expect(onChange).toHaveBeenCalledWith('en', 'name', 'R');
    });

    /**
     * `LanguageController` returns every language since #114, so the agency can
     * add one and the client translate into it before it goes live. Which means
     * the screen has to say which ones are not live - and this is the screen
     * that does; the entry form does not, which is TASKS #119.
     */
    it('marks a language the site has not published', () => {
        draw();

        expect(within(block('fr')).getByText('not published yet')).toBeInTheDocument();
        expect(within(block('el')).queryByText('not published yet')).not.toBeInTheDocument();
    });

    // The address is the part of the URL a visitor reads, so the screen shows
    // what it will actually be rather than asking somebody to imagine it.
    it('shows where the section will live', () => {
        draw({ value: { el: { name: 'Δωμάτια', slug: 'domatia' } } });

        expect(within(block('el')).getByText('/el/domatia')).toBeInTheDocument();
    });
});

/**
 * The payload rule, which had no test at all.
 *
 * A blank name means *not translated*, which is a real state rather than an
 * omission: that language then has no page for this section. A blank address is
 * left out entirely so the server derives one - sending an empty string would
 * mean "exactly this" and fail validation.
 */
describe('translationsPayload', () => {
    it('drops a language nobody named', () => {
        expect(translationsPayload({ el: { name: 'Δωμάτια' }, en: { name: '   ' } }))
            .toEqual({ el: { name: 'Δωμάτια' } });
    });

    it('omits the address when it is blank, so the server derives it', () => {
        expect(translationsPayload({ el: { name: 'Δωμάτια', slug: '' } }))
            .toEqual({ el: { name: 'Δωμάτια' } });
    });

    it('sends an address that was typed', () => {
        expect(translationsPayload({ el: { name: 'Δωμάτια', slug: ' domatia ' } }))
            .toEqual({ el: { name: 'Δωμάτια', slug: 'domatia' } });
    });

    it('survives a language holding nothing at all', () => {
        expect(translationsPayload({ el: undefined, en: null })).toEqual({});
    });
});

describe('translationsFrom', () => {
    it('turns the rows the API sends into what the form holds', () => {
        expect(translationsFrom([{ language_code: 'el', name: 'Δωμάτια', slug: 'domatia' }]))
            .toEqual({ el: { name: 'Δωμάτια', slug: 'domatia' } });
    });

    it('answers an empty map when a module has no translations yet', () => {
        expect(translationsFrom()).toEqual({});
        expect(translationsFrom(null)).toEqual({});
    });
});
