/**
 * The panel's addresses (#117).
 *
 * **Hand-written rather than `react-router`.** There are ten routes, no
 * nesting, no loaders and no data layer, against ~20 KB on a bundle already at
 * 686 KB. What is here instead is a page of pure functions, which run in
 * `environment: 'node'` - and that matters more than the size, because it is
 * where this project's confidence actually lives.
 *
 * Patterns are written **without** the base, so `/admin` is named once. A
 * segment is a literal, `:name`, or `:name(regex)` - see `matchPath`.
 */

export const BASE = '/admin';

/** `:name` with an optional constraint: `:entry(\d+)`. */
const PARAMETER = /^:([A-Za-z_]\w*)(?:\((.+)\))?$/;

/** Path to segments, tolerant of leading, trailing and doubled slashes. */
export const segmentsOf = (path) => String(path ?? '').split('/').filter(Boolean);

/**
 * Patterns are module constants matched on every navigation, so each one is
 * split and compiled once and then remembered. Keyed by the pattern string, so
 * two routes that happen to share a shape share the work.
 */
const compiled = new Map();

const compile = (pattern) => {
    const key = String(pattern ?? '');
    const already = compiled.get(key);

    if (already) return already;

    const parts = segmentsOf(key).map((segment) => {
        const parameter = PARAMETER.exec(segment);

        if (!parameter) return { literal: segment };

        return {
            name: parameter[1],
            // Anchored, so a constraint cannot match part of a segment and let
            // the rest through: `:entry(\d+)` must refuse `12abc`.
            constraint: parameter[2] ? new RegExp(`^(?:${parameter[2]})$`) : null,
        };
    });

    compiled.set(key, parts);

    return parts;
};

/** The base costs nothing to split, but it is a constant and splitting it is not. */
const BASE_SEGMENTS = segmentsOf(BASE);

/**
 * The parameters a pattern captures from a path, or `null` if it does not match.
 *
 * The path is expected **without** the base; `matchRoute` strips it. The
 * returned object is frozen: it is handed to every consumer of the route, and
 * one of them writing a default into it would rewrite what the next reader
 * sees.
 */
export const matchPath = (pattern, path) => {
    const wanted = compile(pattern);
    const given = segmentsOf(path);

    if (wanted.length !== given.length) {
        return null;
    }

    const params = {};

    for (let i = 0; i < wanted.length; i += 1) {
        const part = wanted[i];

        if (part.literal !== undefined) {
            if (part.literal !== given[i]) return null;

            continue;
        }

        // Checked against the raw segment, because a constraint describes the
        // shape of the URL rather than of the value read out of it.
        if (part.constraint && !part.constraint.test(given[i])) {
            return null;
        }

        // `decodeURIComponent` throws on a malformed escape - `%E0%A4%A` from a
        // truncated or hand-typed address is enough. Thrown from here it would
        // come out of render, so a bad address would white-screen the panel
        // instead of simply not being a route.
        try {
            params[part.name] = decodeURIComponent(given[i]);
        } catch (e) {
            return null;
        }
    }

    return Object.freeze(params);
};

/**
 * A complete address for a pattern, base included.
 *
 * Refuses a missing parameter rather than writing `undefined` into the path: a
 * link that looks right and leads nowhere is harder to trace back than a throw
 * at the call site that produced it. A value that breaks the segment's own
 * constraint is refused for the same reason - it would build an address that
 * `matchPath` then declines to resolve, which is a link to nowhere with no
 * error anywhere.
 */
export const buildPath = (pattern, params = {}) => {
    const path = compile(pattern)
        .map((part) => {
            if (part.literal !== undefined) return part.literal;

            const value = params[part.name];

            if (value === undefined || value === null || value === '') {
                throw new Error(`buildPath: "${pattern}" needs a value for :${part.name}.`);
            }

            if (part.constraint && !part.constraint.test(String(value))) {
                throw new Error(
                    `buildPath: "${value}" is not a valid :${part.name} for "${pattern}".`
                );
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

    const given = segmentsOf(pathname);

    // Outside the panel entirely. Answering a route here would mean rendering
    // the panel over a page that belongs to the public site.
    for (let i = 0; i < BASE_SEGMENTS.length; i += 1) {
        if (given[i] !== BASE_SEGMENTS[i]) return null;
    }

    const inside = `/${given.slice(BASE_SEGMENTS.length).join('/')}`;

    for (const route of routes) {
        const params = matchPath(route.path, inside);

        if (params) return Object.freeze({ name: route.name, params });
    }

    return null;
};
