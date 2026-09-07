// Language helpers shared by the entries table, the entry form and the manager
// that fetches them. getLangCode used to be declared twice, identically.

/**
 * The code a language is keyed by inside an entry's translatable field.
 */
/**
 * The list out of whatever `/api/languages` answered with.
 *
 * The endpoint returns a bare array today, but two components were each
 * guessing at a paginator envelope in case it ever does not - so the shape of
 * one endpoint was being decided in two places. It is decided here.
 *
 * @param {unknown} payload the axios `data` from `/languages`
 * @returns {Array<object>}
 */
export const languagesFrom = (payload) =>
    Array.isArray(payload) ? payload : (payload?.data ?? []);

export const getLangCode = (language) =>
    language?.locale || language?.code || language?.short_code || null;

/**
 * The language the admin panel should open on.
 *
 * `is_default` is the column that decides this. It existed and was set long
 * before anything read it, so the panel simply showed whichever language came
 * back first. Falls back to the first entry when no language is flagged, which
 * is what the panel did for all of them before.
 */
export const defaultLanguage = (languages = []) =>
    languages.find((language) => language?.is_default) ?? languages[0] ?? null;

/**
 * The code of that language, or null when there are no languages at all.
 */
export const defaultLangCode = (languages = []) => {
    const language = defaultLanguage(languages);

    return language ? getLangCode(language) : null;
};

/**
 * The content language a listing should open on, given the panel's own.
 *
 * **The two are different axes** (#96): the panel's language is a file in
 * `lang/`, the content's is a row in `languages`, and neither implies the
 * other - a German owner may well run a Greek and English site. But somebody
 * who has switched the panel to English is reading in English, and if the site
 * *has* English they want the listings in it too. Leaving the interface
 * translated and the content on the default is the half of the job nobody
 * asked for: the owner reported exactly that, with a panel in el/en over a
 * site in el/en/fr.
 *
 * So: follow the panel when the site has that language, and otherwise open on
 * whatever the site itself opens on. A panel in German over a site with no
 * German has nothing to follow.
 *
 * **Only a published language**, and that applies to the fallback as well.
 * An inactive one is offered in the panel so it can be translated ahead of
 * going live (#114), which is not a reason for a listing to open on it — and
 * since #114 this list contains unpublished languages, so a fallback that went
 * straight to `is_default` could hand a listing a language with no public
 * pages at all.
 *
 * Three steps, narrowing: the panel's own language if the site publishes it,
 * then the published language the site opens on, then — only when nothing is
 * published — whatever default there is, because a site still being set up has
 * to be editable.
 *
 * This decides the *initial* language only. The selector still switches it,
 * and switching the panel's language reloads the page, so the two never drift
 * apart while somebody is looking at them.
 */
export const contentLangCode = (languages = [], panelLocale = null) => {
    const all = languages ?? [];
    const published = all.filter((language) => language?.is_active !== false);

    // A row carrying no code answers `null` from `getLangCode`, which used to
    // compare equal to a null panel locale and make this return null instead
    // of falling back.
    const wanted = typeof panelLocale === 'string' && panelLocale !== '' ? panelLocale : null;

    const matching = wanted === null
        ? null
        : published.find((language) => getLangCode(language) === wanted);

    if (matching) {
        return getLangCode(matching);
    }

    return published.length > 0 ? defaultLangCode(published) : defaultLangCode(all);
};
