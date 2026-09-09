/**
 * Every screen the panel has, and its address (#117).
 *
 * **An array, because order disambiguates.** `matchRoute` takes the first
 * pattern that matches, so a literal segment must be declared above the
 * parameter that would also swallow it - `/modules/new` before
 * `/modules/:module`, or creating a module edits one called "new".
 *
 * **Content sits under `/content`, and that prefix is not decoration.** Module
 * slugs have exactly the shape of the panel's own words: a client section
 * slugged `settings` or `analytics` would shadow the screen of that name and
 * become unreachable, and no pattern constraint can tell the two apart. Craft
 * and Directus both prefix content for this reason. It is the same instinct as
 * the public side's non-optional language prefix - one page, one address, no
 * ambiguity - paid for with a longer URL.
 */
export const ROUTES = [
    { name: 'dashboard', path: '/' },
    { name: 'analytics', path: '/analytics' },

    // Content: what the client works in every day.
    { name: 'entryCreate', path: '/content/:module/new' },
    { name: 'entryEdit', path: '/content/:module/:entry' },
    { name: 'entries', path: '/content/:module' },

    // The agency's own screens.
    { name: 'enquiries', path: '/enquiries' },
    { name: 'modules', path: '/modules' },
    { name: 'moduleCreate', path: '/modules/new' },
    { name: 'moduleEdit', path: '/modules/:module' },
    { name: 'settings', path: '/settings' },
];

/** Looked up by name when building a link, so no call site retypes a pattern. */
export const PATTERNS = Object.fromEntries(ROUTES.map((route) => [route.name, route.path]));

/**
 * Where an unknown address goes.
 *
 * The dashboard rather than a "not found" screen: every address the panel
 * itself produces is built from `PATTERNS`, so a miss is a stale bookmark or a
 * hand-typed URL, and the useful answer to both is the way in.
 */
export const FALLBACK = { name: 'dashboard', params: {} };
