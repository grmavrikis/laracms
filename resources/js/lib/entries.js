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
 * Move one entry up or down a list, returning the ids in their new order.
 *
 * The whole order goes to the server in one request, so this works out what
 * the list should look like rather than what changed - which is also what
 * makes the move a no-op at either end instead of an error.
 */
export const reorderedIds = (entries, index, direction) => {
    const ids = (entries ?? []).map((entry) => entry.id);
    const target = index + direction;

    if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) {
        return ids;
    }

    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];

    return next;
};
