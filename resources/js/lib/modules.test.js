import { describe, it, expect } from 'vitest';
import { moduleTranslation, moduleNameIn, missingTranslations } from './modules';

// What `GET /api/modules` returns since #114.
const services = {
    id: 51,
    name: 'Υπηρεσίες',
    slug: 'ypiresies',
    slugs: [
        { language_code: 'el', name: 'Υπηρεσίες', slug: 'ypiresies' },
        { language_code: 'en', name: 'Services', slug: 'services' },
    ],
};

// Backfilled and never translated: the same words in every language.
const rooms = {
    id: 50,
    name: 'Δωμάτια',
    slug: 'domatia',
    slugs: [{ language_code: 'el', name: 'Δωμάτια', slug: 'domatia' }],
};

describe('moduleNameIn', () => {
    /**
     * The decision two screens make and neither could test: which name a row
     * shows. The heading of the entries screen went on reading `module.name`
     * through the whole of #116 and was caught by opening the panel, not by
     * the suite.
     */
    it('reads the name in the language asked for', () => {
        expect(moduleNameIn(services, 'en')).toBe('Services');
        expect(moduleNameIn(services, 'el')).toBe('Υπηρεσίες');
    });

    /**
     * A module nobody has translated into that language shows what it has -
     * the panel's own name, which is all a module had before #114.
     */
    it('falls back to the panel name when there is no translation', () => {
        expect(moduleNameIn(services, 'fr')).toBe('Υπηρεσίες');
        expect(moduleNameIn(rooms, 'en')).toBe('Δωμάτια');
    });

    /**
     * Before the languages have loaded there is no code to read in, and the
     * list still has to render something.
     */
    it('falls back when no language is known yet', () => {
        expect(moduleNameIn(services, null)).toBe('Υπηρεσίες');
    });

    it('survives a module with no translations at all', () => {
        expect(moduleNameIn({ name: 'Old', slug: 'old' }, 'en')).toBe('Old');
    });
});

describe('moduleTranslation', () => {
    it('answers the whole row, so a caller reads name and slug from one lookup', () => {
        expect(moduleTranslation(services, 'en')).toEqual({
            language_code: 'en',
            name: 'Services',
            slug: 'services',
        });
    });

    it('answers null when the module has no page in that language', () => {
        expect(moduleTranslation(services, 'fr')).toBeNull();
        expect(moduleTranslation({ name: 'Old' }, 'en')).toBeNull();
    });
});

describe('missingTranslations', () => {
    const el = { code: 'el', is_active: true };
    const en = { code: 'en', is_active: true };
    const de = { code: 'de', is_active: true };

    const withSlugs = (...codes) => ({
        name: 'Rooms',
        slugs: codes.map((code) => ({ language_code: code, name: code, slug: code })),
    });

    it('names the active languages a module has no page in', () => {
        expect(missingTranslations(withSlugs('el'), [el, en, de])).toEqual(['en', 'de']);
    });

    it('answers nothing when every active language is covered', () => {
        expect(missingTranslations(withSlugs('el', 'en'), [el, en])).toEqual([]);
    });

    // A language is offered in the panel so a section can be translated before
    // it goes live (#114). Owing nobody a translation is not the same as being
    // incomplete, so an inactive language must not mark every module.
    it('ignores a language that is switched off', () => {
        expect(missingTranslations(withSlugs('el'), [el, { code: 'fr', is_active: false }])).toEqual([]);
    });

    // `languagesFrom` treats a row that says nothing as active; two helpers
    // disagreeing about that is how a module reads complete in one place and
    // missing in another.
    it('treats a row that says nothing about being active as active', () => {
        expect(missingTranslations(withSlugs('el'), [el, { code: 'en' }])).toEqual(['en']);
    });

    // `getLangCode` prefers `locale`, then `code`. Reading `.code` directly
    // marked every module incomplete on a site whose rows carry `locale`.
    it('keys a language the way the rest of the panel does', () => {
        expect(missingTranslations(withSlugs('el'), [{ locale: 'el' }, { locale: 'en' }])).toEqual(['en']);
    });

    it('survives a module with no translations at all', () => {
        expect(missingTranslations({ name: 'Rooms' }, [el, en])).toEqual(['el', 'en']);
        expect(missingTranslations(null, [el])).toEqual(['el']);
    });

    it('survives being given no languages', () => {
        expect(missingTranslations(withSlugs('el'), [])).toEqual([]);
        expect(missingTranslations(withSlugs('el'), null)).toEqual([]);
    });
});
