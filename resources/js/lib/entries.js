// The structural parts of an Entry: the ones that are columns rather than
// schema fields, and mean the same thing for every Module.
//
// The status values come from the PHP constant that defines them, via
// `php artisan schema:sync-field-types`. They are not restated here.
import fieldTypes from './fieldTypes.json';

export const STATUSES = fieldTypes.entryStatuses;

export const STATUS_DRAFT = STATUSES[0];
export const STATUS_PUBLISHED = STATUSES[1];

export const isPublished = (entry) => entry?.status === STATUS_PUBLISHED;

/**
 * The slugs an entry came back with, as a map this form can edit.
 *
 * The API sends them as rows - `[{language_code, slug}]` - because that is what
 * they are; a form wants them keyed by language.
 */
export const slugsToMap = (slugs) => {
    if (!Array.isArray(slugs)) return {};

    return slugs.reduce((map, row) => {
        if (row?.language_code) map[row.language_code] = row.slug ?? '';
        return map;
    }, {});
};

/**
 * Only the languages that actually have one.
 *
 * Sending the key at all replaces the whole set, so an empty string has to be
 * dropped rather than sent - otherwise "I cleared this box" and "this language
 * has no URL" would arrive as different things and one of them would fail
 * validation.
 */
export const slugsForPayload = (map) =>
    Object.fromEntries(
        Object.entries(map ?? {})
            .map(([language, slug]) => [language, typeof slug === 'string' ? slug.trim() : ''])
            .filter(([, slug]) => slug !== '')
    );

/**
 * Move one entry up or down the module's order, returning the ids in their
 * new order.
 *
 * It takes ids rather than the rows the table is showing, because the table
 * only ever holds one page of fifteen. Reordering a page renumbered it over
 * everything above it (TASKS.md #75), and the endpoint now refuses anything
 * that is not the module's whole set - so the panel fetches that set and
 * moves within it. A row can therefore swap with a neighbour on another page,
 * which a page-local list could not express at all.
 */
export const reorderedIds = (ids, entryId, direction) => {
    const order = Array.isArray(ids) ? [...ids] : [];
    const index = order.indexOf(entryId);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= order.length) {
        return order;
    }

    [order[index], order[target]] = [order[target], order[index]];

    return order;
};

/**
 * Where an entry sits in the module's order, or -1 if the order has not
 * arrived yet. The arrows use it to know they are at an end - which is a
 * question about the module, not about the page on screen.
 */
export const positionInOrder = (ids, entryId) =>
    Array.isArray(ids) ? ids.indexOf(entryId) : -1;
