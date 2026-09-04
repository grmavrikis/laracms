import { describe, it, expect } from 'vitest';
import {
    STATUSES,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    isPublished,
    slugsToMap,
    slugsForPayload,
    reorderedIds,
} from './entries';

describe('statuses', () => {
    it('comes from the generated file rather than being written here', () => {
        expect(STATUSES).toContain(STATUS_DRAFT);
        expect(STATUSES).toContain(STATUS_PUBLISHED);
        expect(STATUS_DRAFT).not.toBe(STATUS_PUBLISHED);
    });

    it('recognises a published entry', () => {
        expect(isPublished({ status: STATUS_PUBLISHED })).toBe(true);
        expect(isPublished({ status: STATUS_DRAFT })).toBe(false);
        expect(isPublished(null)).toBe(false);
        expect(isPublished({})).toBe(false);
    });
});

describe('slugsToMap', () => {
    it('turns the rows the API sends into something a form can edit', () => {
        expect(slugsToMap([
            { language_code: 'el', slug: 'thea' },
            { language_code: 'en', slug: 'sea-view' },
        ])).toEqual({ el: 'thea', en: 'sea-view' });
    });

    it('copes with an entry that has none, or was never loaded with them', () => {
        expect(slugsToMap([])).toEqual({});
        expect(slugsToMap(undefined)).toEqual({});
        expect(slugsToMap(null)).toEqual({});
    });

    it('ignores a row with no language', () => {
        expect(slugsToMap([{ slug: 'orphan' }, { language_code: 'el', slug: 'ok' }]))
            .toEqual({ el: 'ok' });
    });
});

describe('slugsForPayload', () => {
    it('sends the languages that have one', () => {
        expect(slugsForPayload({ el: 'thea', en: 'sea-view' }))
            .toEqual({ el: 'thea', en: 'sea-view' });
    });

    it('drops a box the author cleared', () => {
        // Sending '' would fail the format rule, and the author clearing a box
        // means "this language has no URL" - which is what leaving it out says.
        expect(slugsForPayload({ el: 'thea', en: '' })).toEqual({ el: 'thea' });
        expect(slugsForPayload({ el: '   ' })).toEqual({});
    });

    it('trims, so a stray space is not a different slug', () => {
        expect(slugsForPayload({ el: '  thea  ' })).toEqual({ el: 'thea' });
    });

    it('copes with nothing at all', () => {
        expect(slugsForPayload(undefined)).toEqual({});
    });
});

describe('reorderedIds', () => {
    // The whole module's order, not the page the table happens to show. The
    // endpoint now refuses anything else (TASKS.md #75).
    const order = [10, 20, 30, 40];

    it('moves an entry up', () => {
        expect(reorderedIds(order, 30, -1)).toEqual([10, 30, 20, 40]);
    });

    it('moves an entry down', () => {
        expect(reorderedIds(order, 10, 1)).toEqual([20, 10, 30, 40]);
    });

    it('moves an entry the table cannot see', () => {
        // The point of taking ids rather than a page of rows: the row above
        // the first one on page 2 is on page 1, and the arrow has to reach it.
        expect(reorderedIds(order, 40, -1)).toEqual([10, 20, 40, 30]);
    });

    it('returns the order unchanged at either end', () => {
        // The buttons are disabled there, and a no-op is the right answer if
        // one ever is not.
        expect(reorderedIds(order, 10, -1)).toEqual([10, 20, 30, 40]);
        expect(reorderedIds(order, 40, 1)).toEqual([10, 20, 30, 40]);
    });

    it('returns the whole order, not just what moved', () => {
        // The endpoint takes the list the module should end up as, so a
        // partial answer is now a 422 rather than a silent renumbering.
        expect(reorderedIds(order, 20, -1)).toHaveLength(4);
    });

    it('leaves the order alone for an id it does not hold', () => {
        expect(reorderedIds(order, 999, 1)).toEqual([10, 20, 30, 40]);
    });

    it('copes with an empty or missing list', () => {
        expect(reorderedIds([], 1, 1)).toEqual([]);
        expect(reorderedIds(undefined, 1, 1)).toEqual([]);
    });
});
