import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime } from './format';

// The setup file stubs `window.miniCms` with `locale: 'en'`, so that is the
// language these assertions are in.
describe('formatDate', () => {
    it('formats a date string', () => {
        expect(formatDate('2026-09-10T12:00:00Z')).toMatch(/2026/);
        expect(formatDate('2026-09-10T12:00:00Z')).toMatch(/Sep/);
    });

    it('accepts a Date as well as a string', () => {
        expect(formatDate(new Date('2026-09-10T12:00:00Z'))).toMatch(/2026/);
    });

    // A caller decides what an absent date looks like - usually a dash. The old
    // code printed the string "Invalid Date" into the cell.
    it('answers null for anything it cannot read', () => {
        expect(formatDate(null)).toBeNull();
        expect(formatDate(undefined)).toBeNull();
        expect(formatDate('')).toBeNull();
        expect(formatDate('not a date')).toBeNull();
    });

    // The point of the module. `toLocaleDateString()` with no argument asks the
    // browser, so a Greek panel on an English Windows printed 9/10/2026 and the
    // reader could not tell September from October.
    it('reads the panel’s language rather than the browser’s', () => {
        const greek = new Intl.DateTimeFormat('el', { dateStyle: 'medium' })
            .format(new Date('2026-09-10T12:00:00Z'));

        expect(greek).not.toBe(
            new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
                .format(new Date('2026-09-10T12:00:00Z'))
        );
    });

    it('formats a time when asked for one', () => {
        expect(formatDateTime('2026-09-10T12:00:00Z')).toMatch(/2026/);
        expect(formatDateTime('2026-09-10T12:00:00Z')).toMatch(/:/);
    });
});
