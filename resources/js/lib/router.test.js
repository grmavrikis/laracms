import { describe, it, expect } from 'vitest';
import { BASE, segmentsOf, matchPath, buildPath, matchRoute } from './router';

// A tiny table standing in for the real one, so these tests describe the
// matcher rather than the panel's current set of screens.
const TABLE = [
    { name: 'dashboard', path: '/' },
    { name: 'settings', path: '/settings' },
    { name: 'moduleCreate', path: '/modules/new' },
    { name: 'moduleEdit', path: '/modules/:module' },
    { name: 'entries', path: '/content/:module' },
    { name: 'entryCreate', path: '/content/:module/new' },
    { name: 'entryEdit', path: '/content/:module/:entry' },
];

describe('segmentsOf', () => {
    it('ignores leading, trailing and doubled slashes', () => {
        expect(segmentsOf('/content/rooms/')).toEqual(['content', 'rooms']);
        expect(segmentsOf('content//rooms')).toEqual(['content', 'rooms']);
        expect(segmentsOf('/')).toEqual([]);
        expect(segmentsOf('')).toEqual([]);
    });
});

describe('matchPath', () => {
    it('matches a literal path and yields no parameters', () => {
        expect(matchPath('/settings', '/settings')).toEqual({});
    });

    it('captures a parameter', () => {
        expect(matchPath('/content/:module', '/content/rooms')).toEqual({ module: 'rooms' });
    });

    it('captures several', () => {
        expect(matchPath('/content/:module/:entry', '/content/rooms/12'))
            .toEqual({ module: 'rooms', entry: '12' });
    });

    it('refuses a path of a different length', () => {
        expect(matchPath('/content/:module', '/content')).toBeNull();
        expect(matchPath('/content/:module', '/content/rooms/12')).toBeNull();
    });

    it('refuses a literal segment that differs', () => {
        expect(matchPath('/settings', '/enquiries')).toBeNull();
    });

    // The first market is Greek, and a module's panel slug is ASCII but an
    // entry's is not necessarily - `/content/rooms/δωμάτιο` arrives from the
    // browser percent-encoded, and a caller wants the text back.
    it('decodes what it captures', () => {
        expect(matchPath('/content/:module/:entry', '/content/rooms/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%BF'))
            .toEqual({ module: 'rooms', entry: 'δωμάτιο' });
    });

    // `decodeURIComponent('%')` throws. A hand-typed or truncated address must
    // be a miss, not an exception thrown out of render.
    it('treats a malformed escape as no match rather than throwing', () => {
        expect(() => matchPath('/content/:module', '/content/%E0%A4%A')).not.toThrow();
        expect(matchPath('/content/:module', '/content/%E0%A4%A')).toBeNull();
    });

    it('does not let a parameter match an empty segment', () => {
        expect(matchPath('/content/:module', '/content/')).toBeNull();
    });

    // The frozen result matters because it is handed to every consumer of the
    // route: one of them writing a default into it would change what the next
    // reader sees, on a later and unrelated navigation.
    it('hands back parameters nothing can mutate', () => {
        const params = matchPath('/content/:module', '/content/rooms');

        expect(Object.isFrozen(params)).toBe(true);
        expect(() => { params.module = 'other'; }).toThrow();
    });
});

describe('a constrained parameter', () => {
    it('matches only what the constraint allows', () => {
        expect(matchPath('/content/:module/:entry(\\d+)', '/content/rooms/12'))
            .toEqual({ module: 'rooms', entry: '12' });
        expect(matchPath('/content/:module/:entry(\\d+)', '/content/rooms/new')).toBeNull();
    });

    // Anchored, or `\d+` would match the digits at the front of `12abc` and let
    // the rest through - which is how a constraint turns into no constraint.
    it('must match the whole segment', () => {
        expect(matchPath('/x/:id(\\d+)', '/x/12abc')).toBeNull();
        expect(matchPath('/x/:id(\\d+)', '/x/abc12')).toBeNull();
    });

    it('refuses to build an address the same constraint would reject', () => {
        expect(() => buildPath('/x/:id(\\d+)', { id: 'new' })).toThrow(/not a valid :id/);
        expect(buildPath('/x/:id(\\d+)', { id: 12 })).toBe('/admin/x/12');
    });

    it('leaves an unconstrained parameter taking anything', () => {
        expect(matchPath('/x/:id', '/x/anything-at-all')).toEqual({ id: 'anything-at-all' });
    });
});

describe('buildPath', () => {
    it('substitutes parameters and prefixes the base', () => {
        expect(buildPath('/content/:module', { module: 'rooms' })).toBe('/admin/content/rooms');
    });

    it('encodes what it substitutes', () => {
        expect(buildPath('/content/:module/:entry', { module: 'rooms', entry: 'δωμάτιο' }))
            .toBe('/admin/content/rooms/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%BF');
    });

    it('builds the index as the base itself', () => {
        expect(buildPath('/', {})).toBe(BASE);
    });

    // Silently emitting `/content/undefined` would be a link that looks fine
    // and 404s in the panel, which is worse than a stack trace at the call site.
    it('refuses a parameter it was not given', () => {
        expect(() => buildPath('/content/:module', {})).toThrow(/module/);
    });
});

describe('round trip', () => {
    it.each([
        ['/content/:module', { module: 'rooms' }],
        ['/content/:module/:entry', { module: 'rooms', entry: '12' }],
        ['/content/:module/:entry', { module: 'δωμάτια', entry: 'μπαλκόνι' }],
    ])('%s survives being built and matched again', (pattern, params) => {
        const built = buildPath(pattern, params);

        expect(matchPath(pattern, built.slice(BASE.length))).toEqual(params);
    });
});

describe('matchRoute', () => {
    it('resolves a path to its route and parameters', () => {
        expect(matchRoute(TABLE, '/admin/content/rooms/12'))
            .toEqual({ name: 'entryEdit', params: { module: 'rooms', entry: '12' }, query: {} });
    });

    it('resolves the base itself to the index', () => {
        expect(matchRoute(TABLE, '/admin')).toEqual({ name: 'dashboard', params: {}, query: {} });
        expect(matchRoute(TABLE, '/admin/')).toEqual({ name: 'dashboard', params: {}, query: {} });
    });

    // Order is the whole disambiguation strategy, and it is the reason the
    // table is an array rather than an object. `/modules/new` has to be
    // declared before `/modules/:module` or creating a module edits one called
    // "new" instead.
    it('takes the first matching route, so a literal beats a parameter', () => {
        expect(matchRoute(TABLE, '/admin/modules/new').name).toBe('moduleCreate');
        expect(matchRoute(TABLE, '/admin/modules/rooms').name).toBe('moduleEdit');
        expect(matchRoute(TABLE, '/admin/content/rooms/new').name).toBe('entryCreate');
    });

    it('answers null for a path it does not know', () => {
        expect(matchRoute(TABLE, '/admin/nothing/here')).toBeNull();
    });

    // Anything outside the panel is not this router's business - and answering
    // a route for it would mean the panel rendered itself over another page.
    it('answers null for a path outside the base', () => {
        expect(matchRoute(TABLE, '/el/rooms')).toBeNull();
        expect(matchRoute(TABLE, '/administrator')).toBeNull();
    });

    it('ignores a query string and a fragment', () => {
        expect(matchRoute(TABLE, '/admin/settings?tab=core#top').name).toBe('settings');
    });
});

// The page of a listing belongs to the address rather than to component state:
// it is what makes a reload, a bookmark and the Back button land on the same
// fifteen rows. Without it, editing an entry from page two and saving returned
// the reader to page one.
describe('a query string', () => {
    it('is appended to a built address', () => {
        expect(buildPath('/content/:module', { module: 'rooms' }, { page: 2 }))
            .toBe('/admin/content/rooms?page=2');
    });

    // The address of page one is the plain path, so there are not two URLs for
    // the same fifteen rows.
    it('drops keys with nothing in them', () => {
        expect(buildPath('/content/:module', { module: 'rooms' }, { page: null, q: '' }))
            .toBe('/admin/content/rooms');
        expect(buildPath('/content/:module', { module: 'rooms' }, {}))
            .toBe('/admin/content/rooms');
    });

    it('is encoded', () => {
        expect(buildPath('/settings', {}, { q: 'a b&c' })).toBe('/admin/settings?q=a+b%26c');
    });

    it('is read back off a matched address', () => {
        expect(matchRoute(TABLE, '/admin/content/rooms?page=2'))
            .toEqual({ name: 'entries', params: { module: 'rooms' }, query: { page: '2' } });
    });

    it('is an empty object when the address carries none', () => {
        expect(matchRoute(TABLE, '/admin/settings').query).toEqual({});
    });

    // It must not change which route matches - only what that route is showing.
    it('does not affect which route is chosen', () => {
        expect(matchRoute(TABLE, '/admin/content/rooms?page=9').name).toBe('entries');
    });

    it('is frozen, like the params beside it', () => {
        const { query } = matchRoute(TABLE, '/admin/content/rooms?page=2');

        expect(Object.isFrozen(query)).toBe(true);
    });
});
