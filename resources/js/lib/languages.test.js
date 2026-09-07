import { describe, it, expect } from 'vitest';
import { getLangCode, defaultLanguage, defaultLangCode, languagesFrom, contentLangCode } from './languages';

// The shape /api/languages returns, taken from the live endpoint.
const gr = { id: 1, code: 'gr', name: 'Greek', is_default: false, is_active: true };
const en = { id: 2, code: 'en', name: 'English', is_default: true, is_active: true };
const fr = { id: 3, code: 'fr', name: 'French', is_default: false, is_active: true };

describe('languagesFrom', () => {
    /**
     * `/api/languages` answers with a bare array. Two components were each
     * guessing at a paginator envelope in case it ever does not, so the shape
     * of one endpoint was decided in two files (TASKS.md #67 review).
     */
    it('takes the list the endpoint actually returns', () => {
        expect(languagesFrom([{ code: 'el' }, { code: 'en' }])).toHaveLength(2);
    });

    it('takes the list out of a paginator envelope', () => {
        expect(languagesFrom({ data: [{ code: 'el' }] })).toEqual([{ code: 'el' }]);
    });

    /**
     * A failed request that still resolved, or an endpoint answering
     * something nobody expected: the caller gets a list to map over either
     * way, because every one of them does.
     */
    it('is a list even when the answer is not', () => {
        expect(languagesFrom(null)).toEqual([]);
        expect(languagesFrom(undefined)).toEqual([]);
        expect(languagesFrom('nonsense')).toEqual([]);
    });
});

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

describe('contentLangCode', () => {
    /**
     * **The panel's language and the content's are different axes** (#96) -
     * files on disk against rows in a table - but a person reading the panel in
     * English wants the listings in English too, when the site has English.
     *
     * Reported by the owner: the panel had el/en, the site had el/en/fr, and
     * switching the panel to English still listed everything in Greek. The
     * interface changed and the content did not, which is the half of the
     * translation nobody asked for.
     */
    it('follows the panel when the site has that language', () => {
        expect(contentLangCode([gr, en, fr], 'en')).toBe('en');
        expect(contentLangCode([gr, en, fr], 'fr')).toBe('fr');
    });

    /**
     * The two lists are not the same list and need not overlap. A panel in
     * German on a site with no German has nothing to follow, so it falls back
     * to the language the site itself opens on.
     */
    it('falls back to the site default when it does not', () => {
        expect(contentLangCode([gr, en, fr], 'de')).toBe('en');
    });

    it('falls back when the panel locale is missing entirely', () => {
        expect(contentLangCode([gr, en, fr], null)).toBe('en');
        expect(contentLangCode([gr, en, fr])).toBe('en');
    });

    /**
     * Only a language the site actually serves. An inactive one is in the
     * panel so it can be translated ahead of publication (#114), but it is not
     * what a listing should open on.
     */
    it('ignores a language that is not published yet', () => {
        const de = { id: 4, code: 'de', name: 'German', is_default: false, is_active: false };

        expect(contentLangCode([gr, en, de], 'de')).toBe('en');
    });

    it('answers null when there are no languages at all', () => {
        expect(contentLangCode([], 'en')).toBeNull();
    });
});

describe('contentLangCode and languages nobody has published', () => {
    const draftDefault = { id: 1, code: 'de', name: 'German', is_default: true, is_active: false };

    /**
     * The rule the docblock states - "only a published language" - held for
     * the branch that matches the panel and not for the fallback, which went
     * through `defaultLangCode` and never looked at `is_active`. Since #114
     * the endpoint returns unpublished languages too, so the fallback could
     * hand a listing a language with no public pages at all.
     */
    it('does not fall back to an unpublished default', () => {
        expect(contentLangCode([draftDefault, en], 'fr')).toBe('en');
    });

    it('does not fall back to an unpublished first row either', () => {
        const noneFlagged = [
            { id: 1, code: 'de', name: 'German', is_default: false, is_active: false },
            { id: 2, code: 'el', name: 'Greek', is_default: false, is_active: true },
        ];

        expect(contentLangCode(noneFlagged, 'fr')).toBe('el');
    });

    /**
     * But a site where nothing is published yet still has to be editable, so
     * the last resort is whatever default there is. A panel that answered
     * `null` here would leave the entries table with no language to show.
     */
    it('still answers when nothing is published at all', () => {
        expect(contentLangCode([draftDefault], 'fr')).toBe('de');
    });

    /**
     * A row carrying no code used to match a null panel locale - `null ===
     * null` - and the function then answered `null` instead of the default.
     */
    it('is not matched by a row with no code', () => {
        const broken = { id: 9, name: 'Broken', is_default: false, is_active: true };

        expect(contentLangCode([broken, en], null)).toBe('en');
        expect(contentLangCode([broken, en], '')).toBe('en');
    });
});
