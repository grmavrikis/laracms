/**
 * The panel's addresses (#117).
 *
 * **Hand-written rather than `react-router`.** There are ten routes, no
 * nesting, no loaders and no data layer, against ~20 KB on a bundle already at
 * 686 KB. What is here instead is sixty lines of pure functions, which run in
 * `environment: 'node'` - and that matters more than the size, because it is
 * where this project's confidence actually lives.
 *
 * Patterns are written **without** the base, so `/admin` is named once.
 */

export const BASE = '/admin';

const PARAMETER = /^:(.+)$/;

/** Path to segments, tolerant of leading, trailing and doubled slashes. */
export const segmentsOf = (path) => String(path ?? '').split('/').filter(Boolean);

/**
 * The parameters a pattern captures from a path, or `null` if it does not match.
 *
 * The path is expected **without** the base; `matchRoute` strips it.
 */
export const matchPath = (pattern, path) => {
    const wanted = segmentsOf(pattern);
    const given = segmentsOf(path);

    if (wanted.length !== given.length) {
        return null;
    }

    const params = {};

    for (let i = 0; i < wanted.length; i += 1) {
        const parameter = PARAMETER.exec(wanted[i]);

        if (!parameter) {
            if (wanted[i] !== given[i]) return null;

            continue;
        }

        // `decodeURIComponent` throws on a malformed escape - `%E0%A4%A` from a
        // truncated or hand-typed address is enough. Thrown from here it would
        // come out of render, so a bad address would white-screen the panel
        // instead of simply not being a route.
        try {
            params[parameter[1]] = decodeURIComponent(given[i]);
        } catch (e) {
            return null;
        }
    }

    return params;
};

/**
 * A complete address for a pattern, base included.
 *
 * Refuses a missing parameter rather than writing `undefined` into the path: a
 * link that looks right and leads nowhere is harder to trace back than a throw
 * at the call site that produced it.
 */
export const buildPath = (pattern, params = {}) => {
    const path = segmentsOf(pattern)
        .map((segment) => {
            const parameter = PARAMETER.exec(segment);

            if (!parameter) return segment;

            const value = params[parameter[1]];

            if (value === undefined || value === null || value === '') {
                throw new Error(`buildPath: "${pattern}" needs a value for :${parameter[1]}.`);
            }

            return encodeURIComponent(value);
        })
        .join('/');

    return path === '' ? BASE : `${BASE}/${path}`;
};

/**
 * Which route a browser address belongs to.
 *
 * **The table is an array and order decides**, which is the whole
 * disambiguation strategy: `/modules/new` is declared before `/modules/:module`
 * so that creating a module does not edit one called "new". The same rule the
 * public routes follow, where `/admin` is declared before `/{language}`.
 */
export const matchRoute = (routes, address) => {
    const [withoutFragment] = String(address ?? '').split('#');
    const [pathname] = withoutFragment.split('?');

    const base = segmentsOf(BASE);
    const given = segmentsOf(pathname);

    // Outside the panel entirely. Answering a route here would mean rendering
    // the panel over a page that belongs to the public site.
    for (let i = 0; i < base.length; i += 1) {
        if (given[i] !== base[i]) return null;
    }

    const inside = `/${given.slice(base.length).join('/')}`;

    for (const route of routes) {
        const params = matchPath(route.path, inside);

        if (params) return { name: route.name, params };
    }

    return null;
};
