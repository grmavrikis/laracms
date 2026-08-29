import { describe, it, expect } from 'vitest';
import { getLangCode, defaultLanguage, defaultLangCode } from './languages';

// The shape /api/languages returns, taken from the live endpoint.
const gr = { id: 1, code: 'gr', name: 'Greek', is_default: false, is_active: true };
const en = { id: 2, code: 'en', name: 'English', is_default: true, is_active: true };
const fr = { id: 3, code: 'fr', name: 'French', is_default: false, is_active: true };

describe('getLangCode', () => {
    it('uses the code', () => {
        expect(getLangCode(gr)).toBe('gr');
    });

    it('prefers a locale when one is present', () => {
        expect(getLangCode({ locale: 'el-GR', code: 'gr' })).toBe('el-GR');
    });

    it('returns null rather than guessing when there is nothing to read', () => {
        expect(getLangCode({})).toBeNull();
        expect(getLangCode(undefined)).toBeNull();
    });
});

describe('defaultLanguage', () => {
    it('picks the flagged language, not the first one', () => {
        // The whole point: `en` is flagged while `gr` comes first by id.
        expect(defaultLanguage([gr, en, fr])).toBe(en);
    });

    it('finds the flag wherever it sits in the list', () => {
        expect(defaultLanguage([en, gr, fr])).toBe(en);
    });

    it('falls back to the first when nothing is flagged', () => {
        expect(defaultLanguage([gr, fr])).toBe(gr);
    });

    it('takes the first flagged language if several claim to be default', () => {
        const alsoDefault = { ...fr, is_default: true };

        expect(defaultLanguage([gr, en, alsoDefault])).toBe(en);
    });

    it('returns null for an empty list, and for no list at all', () => {
        expect(defaultLanguage([])).toBeNull();
        expect(defaultLanguage()).toBeNull();
    });
});

describe('defaultLangCode', () => {
    it('returns the code of the flagged language', () => {
        expect(defaultLangCode([gr, en, fr])).toBe('en');
    });

    it('returns null when there are no languages', () => {
        expect(defaultLangCode([])).toBeNull();
    });
});
