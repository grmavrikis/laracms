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
 */
export const errorSummary = (err, fallback = 'Something went wrong.') => {
    if (!err?.response) {
        return ['Could not reach the server. Check your connection and try again.'];
    }

    const { status, data } = err.response;

    if (status === 422) {
        const errors = data?.errors;

        if (errors && Object.keys(errors).length > 0) {
            return Object.values(errors).flat();
        }

        return [data?.message || fallback];
    }

    if (status === 401) return ['Your session has ended. Please sign in again.'];
    if (status === 419) return ['Your session has expired. Please reload the page and retry.'];
    if (status === 403) return ['You do not have permission to do that.'];
    if (status === 404) return ['That item no longer exists. It may have been deleted.'];
    if (status >= 500) return ['The server could not complete the request. Please try again.'];

    return [fallback];
};

/**
 * Messages belonging to one schema field, covering both the plain key
 * ('data.title') and the per-language ones ('data.title.en').
 */
export const messagesForField = (errors, fieldName) => {
    const prefix = `data.${fieldName}`;

    return Object.entries(errors)
        .filter(([key]) => key === prefix || key.startsWith(`${prefix}.`))
        .flatMap(([, messages]) => (Array.isArray(messages) ? messages : [messages]));
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
