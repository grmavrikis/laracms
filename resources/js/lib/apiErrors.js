import { t } from './i18n';

// Turning an axios rejection into something worth showing a person.
//
// Every failure used to collapse into one string ("Failed to save."), which
// hid the field-level messages the API actually returns - including the
// "unsupported type" message the schema validator was changed to produce.

/**
 * The field errors from a 422, keyed by attribute path ('data.title',
 * 'data.title.en'). Empty for every other kind of failure.
 */
export const validationErrors = (err) =>
    err?.response?.status === 422 ? (err.response.data?.errors ?? {}) : {};

/**
 * Messages to show when a failure is not attributable to a single field.
 *
 * Different failures need different words: a 403 is not a network problem and
 * "please try again" is useless advice for it.
 *
 * `overrides` maps a status to wording for callers where the default reading is
 * wrong. The sign-in form is the case that matters: a 401 there means the
 * credentials were wrong, not that a session expired.
 */
export const errorSummary = (err, fallback = t('Something went wrong.'), overrides = {}) => {
    if (!err?.response) {
        return [t('Could not reach the server. Check your connection and try again.')];
    }

    const { status, data } = err.response;

    if (overrides[status]) {
        return [overrides[status]];
    }

    if (status === 422) {
        const errors = data?.errors;

        if (errors && Object.keys(errors).length > 0) {
            return Object.values(errors).flat();
        }

        return [data?.message || fallback];
    }

    if (status === 401) return [t('Your session has ended. Please sign in again.')];
    if (status === 419) return [t('Your session has expired. Please reload the page and retry.')];
    if (status === 403) return [t('You do not have permission to do that.')];
    if (status === 404) return [t('That item no longer exists. It may have been deleted.')];
    if (status >= 500) return [t('The server could not complete the request. Please try again.')];

    return [fallback];
};

/**
 * Messages belonging to one schema field.
 *
 * `langCode` narrows them to the translation being edited. Without it, a
 * complaint about French was rendered under the Greek input - telling the
 * author the Greek box was wrong when it was not, and giving no hint that the
 * problem was on a tab they could not see.
 *
 * A key naming no language ('data.title') is about the map itself - "you sent
 * no translations at all" - so it belongs under whichever language is open and
 * is always returned. Pass no `langCode` for a field that is not translatable:
 * a gallery's keys nest deeper than one segment and must not be filtered.
 */
export const messagesForField = (errors, fieldName, langCode = null) => {
    const prefix = `data.${fieldName}`;

    return Object.entries(errors ?? {})
        .filter(([key]) => {
            if (key === prefix) return true;
            if (!key.startsWith(`${prefix}.`)) return false;

            return langCode === null || key.slice(prefix.length + 1) === langCode;
        })
        .flatMap(([, messages]) => (Array.isArray(messages) ? messages : [messages]));
};

/**
 * Which languages a 422 complained about, in the order the API reported them.
 *
 * What the form needs to answer "the field you cannot see is the one that
 * failed" - it switches to the first of these and marks the rest.
 *
 * The known codes are passed in rather than inferred: `data.photos.0` has the
 * same three-segment shape and its middle value is an index, not a language.
 */
export const languagesWithErrors = (errors, languageCodes) => {
    const known = new Set(languageCodes ?? []);
    const found = [];

    for (const key of Object.keys(errors ?? {})) {
        const parts = key.split('.');

        if (parts.length === 3 && parts[0] === 'data' && known.has(parts[2]) && !found.includes(parts[2])) {
            found.push(parts[2]);
        }
    }

    return found;
};

/**
 * Messages that do not belong to any of the given field names - a schema-level
 * complaint such as an unsupported field type, which is keyed under 'data'
 * alone and would otherwise be shown nowhere.
 */
export const messagesNotForFields = (errors, fieldNames) => {
    const known = new Set(fieldNames.map((name) => `data.${name}`));

    return Object.entries(errors)
        .filter(([key]) => {
            const [root, field] = key.split('.');
            return !(field && known.has(`${root}.${field}`));
        })
        .flatMap(([, messages]) => (Array.isArray(messages) ? messages : [messages]));
};
