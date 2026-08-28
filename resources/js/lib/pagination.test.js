import { describe, it, expect } from 'vitest';
import { paginationFrom, rowsFrom, isPastLastPage } from './pagination';

// The envelope Laravel's paginator actually returns, confirmed against the
// live endpoint.
const page = (over = {}) => ({
    current_page: 1,
    data: [{ id: 1 }, { id: 2 }],
    from: 1,
    last_page: 2,
    per_page: 15,
    to: 2,
    total: 18,
    links: [],
    path: 'http://mini-cms.test/api/modules/rest/entries',
    ...over,
});

describe('paginationFrom', () => {
    it('reads the paginator envelope', () => {
        expect(paginationFrom(page())).toEqual({
            currentPage: 1,
            lastPage: 2,
            perPage: 15,
            total: 18,
            from: 1,
            to: 2,
        });
    });

    it('reports the real total, not the number of rows on the page', () => {
        // This is the bug the whole helper exists to prevent.
        const meta = paginationFrom(page({ data: [], current_page: 2, from: null, to: null }));

        expect(meta.total).toBe(18);
    });

    it('falls back to 0 for a missing from/to', () => {
        expect(paginationFrom(page({ from: null, to: null })).from).toBe(0);
    });

    it('returns null for a plain array', () => {
        expect(paginationFrom([{ id: 1 }])).toBeNull();
    });

    it('returns null for an unrelated object', () => {
        expect(paginationFrom({ foo: 1 })).toBeNull();
    });

    it('returns null for nothing at all', () => {
        expect(paginationFrom(null)).toBeNull();
    });
});

describe('rowsFrom', () => {
    it('takes the rows out of a paginated response', () => {
        expect(rowsFrom(page())).toHaveLength(2);
    });

    it('passes a plain array through', () => {
        expect(rowsFrom([{ id: 1 }])).toHaveLength(1);
    });

    it('yields no rows for nothing at all', () => {
        expect(rowsFrom(undefined)).toEqual([]);
    });
});

describe('isPastLastPage', () => {
    it('detects a page beyond the end', () => {
        expect(isPastLastPage({ currentPage: 3, lastPage: 2 })).toBe(true);
    });

    it('does not treat the last page itself as beyond the end', () => {
        expect(isPastLastPage({ currentPage: 2, lastPage: 2 })).toBe(false);
    });

    it('is satisfied by an empty module, which still has one page', () => {
        expect(isPastLastPage(paginationFrom(page({ total: 0, last_page: 1, data: [] })))).toBe(false);
    });

    it('is false when there is no pagination to speak of', () => {
        expect(isPastLastPage(null)).toBe(false);
    });
});
