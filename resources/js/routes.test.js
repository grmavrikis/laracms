import { describe, it, expect } from 'vitest';
import { ROUTES, PATTERNS, FALLBACK } from './routes';
import { matchPath, matchRoute, buildPath } from './lib/router';

const isLiteral = (path) => !path.split('/').some((segment) => segment.startsWith(':'));

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
        // One value per parameter name the table uses.
        const sample = { module: 'rooms', entry: '12' };

        for (const route of ROUTES) {
            const address = buildPath(route.path, sample);
            const resolved = matchRoute(ROUTES, address);

            expect(resolved, `${route.name} did not resolve from ${address}`).not.toBeNull();
            expect(resolved.name, `${address} resolved to ${resolved.name}`).toBe(route.name);
        }
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
