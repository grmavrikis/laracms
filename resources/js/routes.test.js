import { describe, it, expect } from 'vitest';
import { ROUTES, PATTERNS, FALLBACK, hrefFor } from './routes';
import { matchPath, matchRoute, buildPath } from './lib/router';

const isLiteral = (path) => !path.split('/').some((segment) => segment.startsWith(':'));

/**
 * A value for every parameter a pattern names, derived from the pattern itself.
 *
 * A single shared object would break opaquely the day a route introduced a
 * parameter nobody added to it: `buildPath` would throw "needs a value for
 * :language" from inside the test, which reads as a bug in `buildPath` rather
 * than as "add a sample".
 */
const sampleFor = (path) => Object.fromEntries(
    path.split('/')
        .filter((segment) => segment.startsWith(':'))
        .map((segment) => {
            const [, name, constraint] = /^:([A-Za-z_]\w*)(?:\((.+)\))?$/.exec(segment);

            // The value has to satisfy the segment's own constraint, or the
            // round trip would fail for a reason that is not about routing.
            return [name, constraint === '\\d+' ? '12' : name];
        })
);

describe('the panel’s route table', () => {
    it('names every screen once', () => {
        const names = ROUTES.map((route) => route.name);

        expect(new Set(names).size).toBe(names.length);
    });

    /**
     * The ordering invariant, checked generally rather than case by case.
     *
     * A route made only of literal segments is unreachable if some earlier
     * pattern already matches it - `/modules/new` declared below
     * `/modules/:module` is a create screen that silently edits a module called
     * "new". Enumerating the known pairs would pass while saying nothing about
     * the pair somebody adds next.
     */
    it('declares no literal route beneath a parameter that would shadow it', () => {
        ROUTES.forEach((route, index) => {
            if (!isLiteral(route.path)) return;

            const shadowedBy = ROUTES.slice(0, index)
                .find((earlier) => matchPath(earlier.path, route.path) !== null);

            expect(
                shadowedBy,
                `"${route.name}" (${route.path}) is unreachable: "${shadowedBy?.name}" `
                + `(${shadowedBy?.path}) is declared above it and matches the same address`
            ).toBeUndefined();
        });
    });

    it('gives every route a pattern that can be looked up by name', () => {
        for (const route of ROUTES) {
            expect(PATTERNS[route.name]).toBe(route.path);
        }
    });

    it('resolves what it builds, for every route', () => {
        for (const route of ROUTES) {
            const address = buildPath(route.path, sampleFor(route.path));
            const resolved = matchRoute(ROUTES, address);

            expect(resolved, `${route.name} did not resolve from ${address}`).not.toBeNull();
            expect(resolved.name, `${address} resolved to ${resolved.name}`).toBe(route.name);
        }
    });

    // Order alone would leave an entry identified as the word `new`
    // permanently unreachable, and entries carry per-language slugs, which are
    // words. The constraint states the real invariant instead: the panel
    // addresses an entry by its numeric id.
    it('tells create from edit by shape, not only by declaration order', () => {
        expect(matchRoute(ROUTES, '/admin/content/rooms/new').name).toBe('entryCreate');
        expect(matchRoute(ROUTES, '/admin/content/rooms/12')).toEqual({
            name: 'entryEdit',
            params: { module: 'rooms', entry: '12' },
        });

        // Anything that is not an id and is not `new` is simply not a route,
        // rather than quietly opening the create form.
        expect(matchRoute(ROUTES, '/admin/content/rooms/balcony-suite')).toBeNull();
        expect(matchRoute(ROUTES, '/admin/content/rooms/12abc')).toBeNull();
    });

    it('refuses to build an edit address for something that is not an id', () => {
        expect(() => hrefFor('entryEdit', { module: 'rooms', entry: 'new' }))
            .toThrow(/not a valid :entry/);
    });

    describe('hrefFor', () => {
        it('gives a real address for a named route', () => {
            expect(hrefFor('entries', { module: 'rooms' })).toBe('/admin/content/rooms');
            expect(hrefFor('dashboard')).toBe('/admin');
        });

        it('refuses a route that does not exist', () => {
            expect(() => hrefFor('nowhere')).toThrow(/nowhere/);
        });
    });

    // Handed to every consumer of an unmatched address, so one of them writing
    // a default into `route.params` would rewrite what the next reader sees -
    // and the symptom would surface on a later, unrelated navigation.
    it('hands out a fallback nothing can mutate', () => {
        expect(Object.isFrozen(FALLBACK)).toBe(true);
        expect(Object.isFrozen(FALLBACK.params)).toBe(true);
        expect(() => { FALLBACK.params.module = 'rooms'; }).toThrow();
    });

    it('sends the panel’s own address to the dashboard', () => {
        expect(matchRoute(ROUTES, '/admin')).toEqual({ name: 'dashboard', params: {} });
    });

    // The prefix that keeps a client's section from shadowing a panel screen.
    // Without it, a module slugged `settings` would take the settings screen's
    // address and disappear from the panel.
    it('keeps content clear of the screens the panel names', () => {
        for (const reserved of ['settings', 'analytics', 'enquiries', 'modules']) {
            const asContent = matchRoute(ROUTES, `/admin/content/${reserved}`);

            expect(asContent).toEqual({ name: 'entries', params: { module: reserved } });
            expect(matchRoute(ROUTES, `/admin/${reserved}`).name).not.toBe('entries');
        }
    });

    it('falls back to a route that exists', () => {
        expect(ROUTES.some((route) => route.name === FALLBACK.name)).toBe(true);
    });
});
