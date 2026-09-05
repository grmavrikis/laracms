import { describe, it, expect } from 'vitest';
import {
    STATUSES,
    STATUS_DRAFT,
    STATUS_PUBLISHED,
    isPublished,
    slugsToMap,
    slugsForPayload,
    reorderedIds,
    entryPayload,
    sortByOrder,
    valueForLanguage,
} from './entries';

describe('statuses', () => {
    it('comes from the generated file rather than being written here', () => {
        expect(Object.values(STATUSES)).toContain(STATUS_DRAFT);
        expect(Object.values(STATUSES)).toContain(STATUS_PUBLISHED);
        expect(STATUS_DRAFT).not.toBe(STATUS_PUBLISHED);
    });

    it('reads them by name, so a third state cannot silently reassign one', () => {
        // Positional reads - STATUSES[0], STATUSES[1] - would survive
        // ['draft', 'scheduled', 'published'] with the build green and
        // STATUS_PUBLISHED quietly meaning 'scheduled' (TASKS.md #79).
        expect(STATUSES.draft).toBe(STATUS_DRAFT);
        expect(STATUSES.published).toBe(STATUS_PUBLISHED);
        expect(Array.isArray(STATUSES)).toBe(false);
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

describe('entryPayload', () => {
    const base = { data: { title: 'x' }, slugs: { el: 'thea' } };

    it('sends the status when creating, because the author just chose it', () => {
        const payload = entryPayload({
            ...base,
            status: STATUS_PUBLISHED,
            initialStatus: STATUS_DRAFT,
            isEdit: false,
        });

        expect(payload.status).toBe(STATUS_PUBLISHED);
        expect(payload.slugs).toEqual({ el: 'thea' });
    });

    it('leaves the status out of an edit that did not touch it', () => {
        // The form held whatever it loaded when it opened. Resending that
        // reverts a publish made elsewhere, and the live page disappears with
        // nothing said (TASKS.md #86). The rule is `sometimes`, so omitting
        // it is already how "I did not change this" is expressed.
        const payload = entryPayload({
            ...base,
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        });

        expect('status' in payload).toBe(false);
    });

    it('sends the status when the author did change it', () => {
        const payload = entryPayload({
            ...base,
            status: STATUS_PUBLISHED,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        });

        expect(payload.status).toBe(STATUS_PUBLISHED);
    });

    it('still drops an empty slug, so clearing a box removes the URL', () => {
        const payload = entryPayload({
            data: {},
            slugs: { el: 'thea', en: '  ' },
            initialSlugs: { el: 'thea', en: 'sea-view' },
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        });

        expect(payload.slugs).toEqual({ el: 'thea' });
    });

    it('leaves the slugs out of an edit that did not touch them', () => {
        // Sending them replaces the whole set, so resending what the form
        // loaded deletes a URL somebody else added meanwhile - the same
        // defect as the status one above, one field along.
        const payload = entryPayload({
            data: { title: 'fixed a typo' },
            slugs: { el: 'thea', en: 'sea-view' },
            initialSlugs: { el: 'thea', en: 'sea-view' },
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        });

        expect('slugs' in payload).toBe(false);
    });

    it('does not care what order the languages come in', () => {
        const payload = entryPayload({
            data: {},
            slugs: { en: 'sea-view', el: 'thea' },
            initialSlugs: { el: 'thea', en: 'sea-view' },
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        });

        expect('slugs' in payload).toBe(false);
    });

    it('sends the slugs when one was edited', () => {
        expect(entryPayload({
            data: {},
            slugs: { el: 'nea-thea', en: 'sea-view' },
            initialSlugs: { el: 'thea', en: 'sea-view' },
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        }).slugs).toEqual({ el: 'nea-thea', en: 'sea-view' });
    });

    it('sends the slugs when one was cleared', () => {
        // Clearing a box means "this language has no URL", which only the
        // whole set can express.
        expect(entryPayload({
            data: {},
            slugs: { el: 'thea', en: '' },
            initialSlugs: { el: 'thea', en: 'sea-view' },
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: true,
        }).slugs).toEqual({ el: 'thea' });
    });

    it('sends the slugs when creating, however empty', () => {
        const payload = entryPayload({
            data: {},
            slugs: {},
            initialSlugs: {},
            status: STATUS_DRAFT,
            initialStatus: STATUS_DRAFT,
            isEdit: false,
        });

        expect(payload.slugs).toEqual({});
    });
});

describe('sortByOrder', () => {
    const rows = [{ id: 10 }, { id: 20 }, { id: 30 }];

    it('puts the rows in the order the ids give', () => {
        expect(sortByOrder(rows, [30, 10, 20]).map((r) => r.id)).toEqual([30, 10, 20]);
    });

    it('leaves the rows alone until the order has arrived', () => {
        // The listing renders before the id list does, and a page of rows in
        // the server's own order is the right thing to show meanwhile.
        expect(sortByOrder(rows, []).map((r) => r.id)).toEqual([10, 20, 30]);
        expect(sortByOrder(rows, undefined).map((r) => r.id)).toEqual([10, 20, 30]);
    });

    it('keeps a row the order does not mention, at the end', () => {
        // Somebody else created an entry: it is on this page but not in the
        // id list this client holds. Dropping it would make a row vanish.
        expect(sortByOrder([...rows, { id: 99 }], [30, 10, 20]).map((r) => r.id))
            .toEqual([30, 10, 20, 99]);
    });

    it('orders a page by the whole module, not by the page', () => {
        // The page holds three of five. Their relative order still has to
        // follow the module's.
        expect(sortByOrder(rows, [50, 30, 40, 10, 20]).map((r) => r.id))
            .toEqual([30, 10, 20]);
    });

    it('copes with no rows at all', () => {
        expect(sortByOrder([], [1, 2])).toEqual([]);
        expect(sortByOrder(undefined, [1, 2])).toEqual([]);
    });
});

describe('valueForLanguage', () => {
    const title = { el: 'Θέα', en: 'Sea view' };

    it('gives the language asked for', () => {
        expect(valueForLanguage(title, 'el')).toBe('Θέα');
        expect(valueForLanguage(title, 'en')).toBe('Sea view');
    });

    it('gives nothing when that language is untranslated', () => {
        // It used to fall through to `Object.values(raw)[0]`, so switching the
        // table to French showed the Greek text - which made the listing claim
        // a translation that does not exist, and hid the ones that are missing.
        expect(valueForLanguage(title, 'fr')).toBe('');
        expect(valueForLanguage({ el: 'Θέα', fr: null }, 'fr')).toBe('');
        expect(valueForLanguage({ el: 'Θέα', fr: '' }, 'fr')).toBe('');
    });

    it('leaves a value that is not a translation map alone', () => {
        expect(valueForLanguage('plain', 'el')).toBe('plain');
        expect(valueForLanguage(42, 'el')).toBe(42);
        expect(valueForLanguage(null, 'el')).toBe(null);
        expect(valueForLanguage(true, 'el')).toBe(true);
    });

    it('leaves a list alone, because a gallery is not translatable', () => {
        const gallery = [{ url: '/a.jpg' }];

        expect(valueForLanguage(gallery, 'el')).toBe(gallery);
    });

    it('shows something before the languages have arrived', () => {
        // The listing renders before /api/languages resolves, so the code is
        // null for a moment. A blank column would flash; the first translation
        // is replaced as soon as the real language is known.
        expect(valueForLanguage(title, null)).toBe('Θέα');
        expect(valueForLanguage(title, undefined)).toBe('Θέα');
    });
});

