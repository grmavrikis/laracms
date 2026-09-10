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
import { buildPath } from './lib/router';

export const ROUTES = [
    { name: 'dashboard', path: '/' },
    { name: 'analytics', path: '/analytics' },

    // Content: what the client works in every day.
    //
    // **`:entry` is constrained to digits**, and that is not tidiness. Order
    // alone would make `/content/rooms/new` mean "create" for ever, so an entry
    // whose identifier was the word `new` could never be opened - and entries
    // already carry per-language slugs, which are words. The constraint says
    // what is actually true, that the panel addresses an entry by its numeric
    // id, and it lets the two patterns be told apart by shape rather than by
    // which was declared first.
    { name: 'entryCreate', path: '/content/:module/new' },
    { name: 'entryEdit', path: '/content/:module/:entry(\\d+)' },
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
 * An address for a named route.
 *
 * Lives here rather than beside the hook because it needs no React: a sidebar
 * config array, a test or a redirect can ask for a link without importing a
 * provider and its effects. `navigate` calls it too, so the lookup and its
 * refusal exist once.
 *
 * Sidebar items should be anchors rather than buttons - middle-click,
 * ctrl-click and "copy link address" all work on one and none of them work on
 * the other.
 */
export const hrefFor = (name, params = {}, query = null) => {
    const pattern = PATTERNS[name];

    // Named rather than free-form, so no call site retypes a pattern and a
    // renamed route fails loudly here instead of becoming a dead link.
    if (!pattern) {
        throw new Error(`hrefFor: there is no route named "${name}".`);
    }

    return buildPath(pattern, params, query);
};

/**
 * Where an unknown address goes.
 *
 * The dashboard rather than a "not found" screen: every address the panel
 * itself produces is built from `PATTERNS`, so a miss is a stale bookmark or a
 * hand-typed URL, and the useful answer to both is the way in.
 */
export const FALLBACK = Object.freeze({
    name: 'dashboard',
    params: Object.freeze({}),
    query: Object.freeze({}),
});
