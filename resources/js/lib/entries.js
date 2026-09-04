// The structural parts of an Entry: the ones that are columns rather than
// schema fields, and mean the same thing for every Module.
//
// The status values come from the PHP constant that defines them, via
// `php artisan schema:sync-field-types`. They are not restated here.
import fieldTypes from './fieldTypes.json';

// Looked up by name, never by position. `STATUSES[0]` and `STATUSES[1]`
// read a generated array positionally, which is the drift `fieldTypes.json`
// exists to prevent doing it silently: insert a third state at the obvious
// place and STATUS_PUBLISHED becomes the new one, with the build green and
// every badge mislabelled (TASKS.md #79).
export const STATUSES = fieldTypes.entryStatuses;

export const STATUS_DRAFT = STATUSES.draft;
export const STATUS_PUBLISHED = STATUSES.published;

/** The statuses as a list, for anything that iterates them. */
export const STATUS_VALUES = Object.values(STATUSES);

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

/** Two slug maps that say the same thing, whatever order the keys are in. */
const sameSlugs = (a, b) => {
    const keys = Object.keys(a);

    return keys.length === Object.keys(b).length
        && keys.every((language) => a[language] === b[language]);
};

/**
 * What the form sends, carrying only the structural fields the author touched.
 *
 * Both of them replace what is on the server, and the form holds whatever it
 * loaded when it opened - so resending an untouched field silently reverts
 * whatever happened to it meanwhile.
 *
 * - **`status`** (TASKS.md #86): an author opens a draft to fix a typo, the
 *   entry is published from elsewhere, the author saves, and the form writes
 *   `status: 'draft'` over it. The live page disappears with nothing said.
 * - **`slugs`**: sending the key replaces the *whole set*, so the same author
 *   saving the same typo deletes a language somebody else added. That is the
 *   same defect one field along, and it was missed when #86 was fixed.
 *
 * Both rules are `sometimes` and `syncSlugs` returns early when the key is
 * absent, so omitting them is already how "I did not change this" is said. On
 * create there is nothing to revert and the author has just chosen both, so
 * both are always sent.
 */
export const entryPayload = ({ data, slugs, initialSlugs, status, initialStatus, isEdit }) => {
    const payload = { data };

    if (!isEdit || status !== initialStatus) {
        payload.status = status;
    }

    // Compared after normalising, so whitespace and a cleared box are judged
    // as what they will actually be written as, not as what was typed.
    const next = slugsForPayload(slugs);

    if (!isEdit || !sameSlugs(next, slugsForPayload(initialSlugs))) {
        payload.slugs = next;
    }

    return payload;
};

/**
 * The rows of one page, in the module's order.
 *
 * The table renders whatever the listing returned, and a reorder is applied
 * locally before the server confirms it - so without this the row would not
 * move until the refetch landed, and three quick presses of the arrow would
 * look like nothing happening at all.
 *
 * A row the order does not mention keeps its place at the end rather than
 * disappearing: somebody else may have created an entry that is on this page
 * but not in the id list this client is holding.
 */
export const sortByOrder = (entries, ids) => {
    const rows = Array.isArray(entries) ? [...entries] : [];

    if (!Array.isArray(ids) || ids.length === 0) return rows;

    const position = new Map(ids.map((id, index) => [id, index]));
    const at = (entry) => position.get(entry?.id) ?? Number.MAX_SAFE_INTEGER;

    return rows.sort((a, b) => at(a) - at(b));
};

