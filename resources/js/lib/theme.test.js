import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    THEMES,
    ACCENTS,
    STORAGE_KEYS,
    resolveTheme,
    resolveAccent,
    readPreference,
    writePreference,
    applyPreference,
} from './theme';

describe('resolveTheme', () => {
    it('takes a stored value it recognises', () => {
        expect(resolveTheme('dark', false)).toBe('dark');
        expect(resolveTheme('light', true)).toBe('light');
    });

    // An explicit choice outranks the operating system's, in both directions.
    // Only falling back *to* the system when nothing is stored is the point;
    // letting it win afterwards would make the switch look broken to anyone
    // whose machine disagrees with them.
    it('falls back to the system preference when nothing is stored', () => {
        expect(resolveTheme(null, true)).toBe('dark');
        expect(resolveTheme(null, false)).toBe('light');
    });

    // The value comes out of localStorage, which anything on the origin can
    // write. Echoing it into an attribute unchecked is how a stray string ends
    // up as a selector nothing matches - a panel with no theme at all.
    it('refuses a value that is not a theme', () => {
        expect(resolveTheme('emerald', false)).toBe('light');
        expect(resolveTheme('', true)).toBe('dark');
        expect(resolveTheme(undefined, false)).toBe('light');
    });
});

describe('resolveAccent', () => {
    it('takes a stored value it recognises', () => {
        expect(resolveAccent('rose')).toBe('rose');
    });

    it('falls back to the first accent, which is the default', () => {
        expect(resolveAccent(null)).toBe(ACCENTS[0]);
        expect(resolveAccent('chartreuse')).toBe(ACCENTS[0]);
    });

    it('offers emerald first, because that is what the design was drawn in', () => {
        expect(ACCENTS[0]).toBe('emerald');
    });
});

describe('readPreference / writePreference', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('round-trips through storage', () => {
        writePreference({ theme: 'dark', accent: 'teal' });

        expect(readPreference()).toEqual({ theme: 'dark', accent: 'teal' });
    });

    it('resolves what it reads, so a tampered value cannot reach the DOM', () => {
        localStorage.setItem(STORAGE_KEYS.theme, 'neon');
        localStorage.setItem(STORAGE_KEYS.accent, 'neon');

        expect(readPreference()).toEqual({ theme: 'light', accent: 'emerald' });
    });

    // A browser set to block site data throws on access rather than answering
    // null. Unguarded that is not a lost theme, it is a panel that does not
    // start - this runs before anything is rendered.
    it('survives storage throwing outright', () => {
        const boom = () => { throw new Error('blocked'); };
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);

        expect(() => readPreference()).not.toThrow();
        expect(readPreference()).toEqual({ theme: 'light', accent: 'emerald' });
        expect(() => writePreference({ theme: 'dark', accent: 'rose' })).not.toThrow();

        getItem.mockRestore();
        setItem.mockRestore();
    });
});

describe('applyPreference', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-accent');
    });

    it('writes both axes onto the root element', () => {
        applyPreference({ theme: 'dark', accent: 'violet' });

        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(document.documentElement.getAttribute('data-accent')).toBe('violet');
    });

    // The two axes are independent by design: the sidebar stays dark in both
    // themes, so "dark mode" and "which green" are different questions and
    // changing one must not reset the other.
    it('changes one axis without disturbing the other', () => {
        applyPreference({ theme: 'dark', accent: 'violet' });
        applyPreference({ theme: 'light', accent: 'violet' });

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-accent')).toBe('violet');
    });

    it('resolves before it writes', () => {
        applyPreference({ theme: 'nonsense', accent: 'nonsense' });

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.documentElement.getAttribute('data-accent')).toBe('emerald');
    });
});

describe('the contract with the inline script in admin.blade.php', () => {
    // That script runs before this bundle exists and writes the same two
    // attributes from the same two keys. The duplication is deliberate - it is
    // what stops a dark-mode reader seeing a white flash on every navigation -
    // but it means the two lists have to agree. If this fails, the Blade
    // template is the other half that needs editing.
    it('keeps the storage keys and the allowed values that the script assumes', () => {
        expect(STORAGE_KEYS).toEqual({ theme: 'miniCms.theme', accent: 'miniCms.accent' });
        expect(THEMES).toEqual(['light', 'dark']);
        expect(ACCENTS).toEqual(['emerald', 'teal', 'blue', 'violet', 'rose', 'amber']);
    });
});
