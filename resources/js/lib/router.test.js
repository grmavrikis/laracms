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
            .toEqual({ name: 'entryEdit', params: { module: 'rooms', entry: '12' } });
    });

    it('resolves the base itself to the index', () => {
        expect(matchRoute(TABLE, '/admin')).toEqual({ name: 'dashboard', params: {} });
        expect(matchRoute(TABLE, '/admin/')).toEqual({ name: 'dashboard', params: {} });
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
