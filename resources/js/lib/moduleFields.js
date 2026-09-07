/**
 * The rows of a module's field editor, and the payload they become
 * (TASKS.md #115).
 *
 * Pure functions rather than component state, for the reason every other
 * `lib/` helper is: three defects in this logic shipped in one commit and none
 * of them was reachable by a test while it lived inside a component.
 */

/** A row nobody has filled in yet. */
export const emptyField = (id) => ({
    _id: id,
    // **Identity, not a name.** Whether a row may be renamed, retyped,
    // translated or removed depends on whether it existed in the database when
    // the screen opened - not on what its name currently says. Keying that on
    // the name locked a *new* field the moment somebody typed a name that
    // already existed, and the disabled input could then never be corrected.
    locked: false,
    name: '',
    type: 'string',
    translatable: false,
    required: false,
    validation: '',
    options: '',
    // The list as it was stored, kept beside the text so an option containing
    // a comma survives a round trip. See `schemaPayload`.
    storedOptions: null,
});

/**
 * The rows for a schema that is already in the database.
 *
 * Ids are the position at load and the counter continues past them, so nothing
 * a later `addField` produces can collide.
 */
export const fieldsFromSchema = (schema = []) =>
    (schema ?? []).map((field, index) => ({
        ...emptyField(index),
        locked: true,
        name: field.name,
        type: field.type,
        translatable: !!field.translatable,
        required: !!field.required,
        validation: field.validation ?? '',
        options: Array.isArray(field.options) ? field.options.join(', ') : (field.options ?? ''),
        storedOptions: Array.isArray(field.options) ? field.options : null,
    }));

/** Where a counter must start so it cannot repeat an id already in use. */
export const nextFieldId = (fields = []) =>
    fields.reduce((highest, field) => Math.max(highest, field._id), -1) + 1;

/**
 * One field changed.
 *
 * A gallery cannot be translatable: the photographs are one set for every
 * language and only their alt text differs. `SchemaRuleBuilder` refuses the
 * combination, so it is cleared here rather than assembling a schema the API
 * will reject.
 */
export const applyFieldChange = (fields, id, key, value, isGallery = () => false) =>
    fields.map((field) => {
        if (field._id !== id) {
            return field;
        }

        const next = { ...field, [key]: value };

        if (key === 'type' && isGallery(next)) {
            next.translatable = false;
        }

        return next;
    });

/**
 * The rows, as the API takes them.
 *
 * **Options are only re-split when somebody edited them.** They are held as
 * comma-separated text, so `Half board, breakfast` splits into two - which is
 * a limit of typing them but must not be a way of *corrupting* a value that
 * was already stored. When the text still matches what was loaded, the stored
 * list is sent back untouched.
 */
export const schemaPayload = (fields) =>
    fields.map(({ _id, locked, storedOptions, ...field }) => ({
        ...field,
        validation: (field.validation ?? '').trim(),
        options: field.type === 'select'
            ? optionsOf(field.options, storedOptions)
            : undefined,
    }));

const optionsOf = (text, stored) => {
    if (Array.isArray(stored) && text === stored.join(', ')) {
        return stored;
    }

    return (text || '').split(',').map((option) => option.trim()).filter(Boolean);
};
