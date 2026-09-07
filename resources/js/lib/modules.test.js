import { describe, it, expect } from 'vitest';
import { moduleTranslation, moduleNameIn } from './modules';

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
