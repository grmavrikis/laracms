import { getLangCode } from './languages';

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

/**
 * The **active** languages this module has no page in.
 *
 * `GET /api/modules` carries every module's translations for exactly this -
 * the comment on `ModuleController::index` says so - and until now nothing
 * read them, so a section missing from German looked identical to one that was
 * complete. Since #114 that is not cosmetic: a module untranslated into a
 * language has no address there, is absent from that menu, and is absent from
 * the sitemap. It is the one thing about a module worth seeing at a glance.
 *
 * Inactive languages are excluded. They are offered in the panel so a section
 * can be translated *before* going live, which is not the same as owing a
 * translation - listing them would mark every module incomplete for a language
 * no visitor can reach.
 */
export const missingTranslations = (module, languages) =>
    (languages ?? [])
        // `!== false`, matching `languagesFrom` in `languages.js`: a row that
        // says nothing about being active is treated as active there, and two
        // helpers disagreeing about what "published" means is how a module
        // shows as complete in one place and missing in another.
        .filter((language) => language?.is_active !== false)
        // Through `getLangCode`, which is the one answer to what a language is
        // keyed by - `locale`, then `code`, then `short_code`. Reading `.code`
        // directly would mark every module incomplete on a site whose rows use
        // `locale`.
        .map(getLangCode)
        .filter((code) => code && !moduleTranslation(module, code));
