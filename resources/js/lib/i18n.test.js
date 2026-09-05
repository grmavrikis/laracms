import { describe, it, expect } from 'vitest';
import { translate } from './i18n';

/**
 * The rule the panel's text follows, in the four lines that carry it
 * (TASKS.md #96). Everything else in `i18n.js` is that function bound to what
 * the server injected into the page.
 */
describe('translate', () => {
    const messages = {
        'Delete permanently?': 'Οριστική διαγραφή;',
        'Showing :from–:to of :total': ':from–:to από :total',
        'Nothing here': '',
    };

    it('returns the translation', () => {
        expect(translate(messages, 'Delete permanently?')).toBe('Οριστική διαγραφή;');
    });

    /**
     * The key is the English text, so an untranslated string reads as English.
     * A panel showing `panel.entries.title` to a client is worse than one
     * showing a sentence in the wrong language, and this is what lets a screen
     * be translated at a time.
     */
    it('falls back to the key, which is English', () => {
        expect(translate(messages, 'Add field')).toBe('Add field');
    });

    /**
     * `??` rather than `||`: somebody who translates a string to nothing meant
     * nothing, and falling back would put the English back on the screen.
     */
    it('keeps a translation that is deliberately empty', () => {
        expect(translate(messages, 'Nothing here')).toBe('');
    });

    it('replaces :name placeholders, as PHP does', () => {
        expect(translate(messages, 'Showing :from–:to of :total', { from: 1, to: 15, total: 42 }))
            .toBe('1–15 από 42');
    });

    it('replaces every occurrence of a placeholder', () => {
        expect(translate({}, ':word, :word', { word: 'again' })).toBe('again, again');
    });

    /**
     * A replacement whose name is not in the line is not an error: the Greek
     * translation of a sentence may legitimately drop a value the English one
     * carried.
     */
    it('ignores a replacement the line does not use', () => {
        expect(translate({}, 'Saved', { count: 3 })).toBe('Saved');
    });

    it('survives a page that was served no catalogue at all', () => {
        expect(translate(undefined, 'Save')).toBe('Save');
    });

    /**
     * The values come from the API - an entry title, a module name - so they
     * are not trusted to be strings.
     */
    it('takes a non-string replacement', () => {
        expect(translate({}, ':n rows', { n: 0 })).toBe('0 rows');
    });
});
