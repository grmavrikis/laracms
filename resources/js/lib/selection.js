/**
 * Which rows of a listing are ticked (#117 item 19).
 *
 * Pure functions rather than component state, for the reason every other `lib/`
 * helper here is one: `moduleFields.js` records three defects shipping in a
 * single commit while that logic lived inside a component. This decides what a
 * bulk **delete** acts on, which is the least forgiving thing in the panel to
 * get wrong.
 *
 * **Ids are compared as strings.** They arrive as numbers from JSON and as
 * strings from the DOM, and `[7]` failing to contain `'7'` is how a tick goes
 * missing and the wrong row is removed.
 */
const key = (id) => String(id);

const has = (selected, id) => (selected ?? []).some((one) => key(one) === key(id));

export const toggle = (selected, id) => (
    has(selected, id)
        ? (selected ?? []).filter((one) => key(one) !== key(id))
        : [...(selected ?? []), id]
);

/**
 * The header box: every row **on this page**, or none of them.
 *
 * A listing holds fifteen rows and a module may hold four hundred, so "select
 * all" reaches only what the reader can see. A selection made elsewhere is left
 * alone rather than cleared, because this control speaks for the page.
 */
export const toggleAll = (selected, ids) => {
    const page = ids ?? [];

    if (allSelected(selected, page)) {
        return (selected ?? []).filter((one) => !page.some((id) => key(id) === key(one)));
    }

    const missing = page.filter((id) => !has(selected, id));

    return [...(selected ?? []), ...missing];
};

/** Every row on the page is ticked. An empty page has no "all". */
export const allSelected = (selected, ids) =>
    (ids ?? []).length > 0 && (ids ?? []).every((id) => has(selected, id));

/** Some but not all - which is what makes the header box indeterminate. */
export const someSelected = (selected, ids) =>
    (ids ?? []).some((id) => has(selected, id)) && !allSelected(selected, ids);

/**
 * The selection narrowed to the page now on show.
 *
 * A selection is **per page**. Turning to page two with fifteen rows still
 * ticked would let a bulk delete act on rows the reader is no longer looking
 * at, and the confirmation would say *delete 15* over fifteen different
 * entries.
 */
export const onlyPresent = (selected, ids) =>
    (selected ?? []).filter((one) => (ids ?? []).some((id) => key(id) === key(one)));
