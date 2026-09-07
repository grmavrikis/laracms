/**
 * Reading a Module in one language (TASKS.md #114, #116).
 *
 * `modules.name` and `modules.slug` are the **panel's**: the admin API
 * resolves `/api/modules/{module}` by that slug, and it cannot depend on a
 * content language because the panel does not have one. What a person reads
 * comes from `slugs`, one row per language.
 *
 * Pure and here rather than inside a component, because two screens make this
 * decision and neither could test it: the heading of the entries screen went
 * on showing the panel's own name through the whole of #116 and was caught by
 * opening the panel, not by the suite.
 */

/**
 * A module's row for `code`, or null when it has no page in that language.
 *
 * One lookup, so a caller reading both the name and the address does not scan
 * the list twice.
 */
export const moduleTranslation = (module, code) =>
    (module?.slugs ?? []).find((row) => row?.language_code === code) ?? null;

/**
 * What to call a module in `code`.
 *
 * Falls back to the panel's own name, which is what a module untranslated into
 * that language has - and all any module had before #114. It is also what the
 * list shows in the moment before the languages have loaded, when there is no
 * code to read in yet.
 */
export const moduleNameIn = (module, code) =>
    moduleTranslation(module, code)?.name ?? module?.name ?? null;
