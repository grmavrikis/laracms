// Language helpers shared by the entries table, the entry form and the manager
// that fetches them. getLangCode used to be declared twice, identically.

/**
 * The code a language is keyed by inside an entry's translatable field.
 */
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
