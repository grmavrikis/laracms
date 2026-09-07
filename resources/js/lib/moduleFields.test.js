import { describe, expect, test } from 'vitest';
import {
    emptyField,
    fieldsFromSchema,
    nextFieldId,
    applyFieldChange,
    schemaPayload,
} from './moduleFields';

const schema = [
    { name: 'title', type: 'string', translatable: true },
    { name: 'board', type: 'select', translatable: false, options: ['Half board, breakfast', 'Room only'] },
];

describe('which rows may be changed', () => {
    /**
     * **Identity, not the name.** Keying the lock on `lockedNames.has(name)`
     * meant a new field locked itself the moment somebody typed a name that
     * already existed - the input disabled itself mid-word and could not be
     * corrected or removed.
     */
    test('a row that came from the database is locked', () => {
        expect(fieldsFromSchema(schema).map((f) => f.locked)).toEqual([true, true]);
    });

    test('a row added afterwards is not, whatever it is called', () => {
        const added = { ...emptyField(9), name: 'title' };

        expect(added.locked).toBe(false);
    });

    test('renaming a locked row does not unlock it, and vice versa', () => {
        const [title] = fieldsFromSchema(schema);
        const renamed = applyFieldChange([title], title._id, 'name', 'headline')[0];

        expect(renamed.locked).toBe(true);
    });
});

describe('row ids', () => {
    /**
     * The counter used to be `(nextId += 1) + fields.length + schema.length`,
     * which repeats: add three, remove two, add again and the new row takes an
     * id a surviving row already has. Two rows with one React key means text
     * typed into one appears in the other.
     */
    test('the next id is past every id in use', () => {
        expect(nextFieldId(fieldsFromSchema(schema))).toBe(2);
        expect(nextFieldId([{ _id: 0 }, { _id: 7 }, { _id: 3 }])).toBe(8);
        expect(nextFieldId([])).toBe(0);
    });

    test('adding and removing never repeats one', () => {
        let fields = fieldsFromSchema(schema);
        const add = () => { fields = [...fields, emptyField(nextFieldId(fields))]; };
        const remove = (id) => { fields = fields.filter((f) => f._id !== id); };

        add();
        add();
        add();

        const added = fields.slice(2).map((f) => f._id);

        remove(added[0]);
        remove(added[1]);

        add();

        const ids = fields.map((f) => f._id);

        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('what is sent to the API', () => {
    /**
     * Options are typed as comma-separated text, so an option containing a
     * comma cannot be *written* that way - but it must not be **corrupted**
     * when it was already stored and nobody touched it. Saving a translation
     * used to tear `Half board, breakfast` into two options and strand every
     * entry holding the original.
     */
    test('an untouched option keeps its comma', () => {
        const [, board] = schemaPayload(fieldsFromSchema(schema));

        expect(board.options).toEqual(['Half board, breakfast', 'Room only']);
    });

    test('an edited one is split, which is how they are typed', () => {
        let fields = fieldsFromSchema(schema);
        const board = fields[1];

        fields = applyFieldChange(fields, board._id, 'options', 'bb, hb, ai');

        expect(schemaPayload(fields)[1].options).toEqual(['bb', 'hb', 'ai']);
    });

    test('options are left out entirely for a field that is not a select', () => {
        expect(schemaPayload(fieldsFromSchema(schema))[0].options).toBeUndefined();
    });

    test('the editor bookkeeping does not reach the API', () => {
        const sent = schemaPayload(fieldsFromSchema(schema))[0];

        expect(sent._id).toBeUndefined();
        expect(sent.locked).toBeUndefined();
        expect(sent.storedOptions).toBeUndefined();
    });

    test('validation is trimmed', () => {
        let fields = [emptyField(0)];
        fields = applyFieldChange(fields, 0, 'validation', '  max:60  ');

        expect(schemaPayload(fields)[0].validation).toBe('max:60');
    });
});

describe('a gallery cannot be translatable', () => {
    const isGallery = (field) => field.type === 'gallery';

    test('choosing gallery clears the flag', () => {
        let fields = [{ ...emptyField(0), translatable: true }];
        fields = applyFieldChange(fields, 0, 'type', 'gallery', isGallery);

        expect(fields[0].translatable).toBe(false);
    });

    test('and choosing something else leaves it alone', () => {
        let fields = [{ ...emptyField(0), translatable: true }];
        fields = applyFieldChange(fields, 0, 'type', 'text', isGallery);

        expect(fields[0].translatable).toBe(true);
    });
});
