import { describe, it, expect } from 'vitest';
import {
    FIELD_TYPES,
    LEGACY_FIELD_TYPES,
    isRichTextField,
    emptyDoc,
    isEmptyDoc,
    docToText,
} from './richText';

const doc = (...content) => ({ type: 'doc', content });
const paragraph = (...content) => ({ type: 'paragraph', content });
const text = (value, marks) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });

describe('isRichTextField', () => {
    it('recognises the current type', () => {
        expect(isRichTextField({ type: 'text' })).toBe(true);
    });

    it.each(LEGACY_FIELD_TYPES)('still recognises the legacy type %s', (type) => {
        // These are no longer creatable, but a schema written before they were
        // collapsed into `text` can still declare one, and rendering it as a
        // plain input would put a document object in a text box.
        expect(isRichTextField({ type })).toBe(true);
    });

    it('rejects a plain field type', () => {
        expect(isRichTextField({ type: 'string' })).toBe(false);
    });

    it('survives a field with no type, and no field at all', () => {
        expect(isRichTextField({})).toBe(false);
        expect(isRichTextField(undefined)).toBe(false);
    });

    it('offers exactly one type for new fields', () => {
        expect(FIELD_TYPES).toEqual(['text']);
    });
});

describe('emptyDoc / isEmptyDoc', () => {
    it('builds a document the editor accepts as empty', () => {
        expect(isEmptyDoc(emptyDoc())).toBe(true);
    });

    it('returns a fresh object each time, so two fields cannot share one', () => {
        expect(emptyDoc()).not.toBe(emptyDoc());
    });

    it('does not call a document with text empty', () => {
        expect(isEmptyDoc(doc(paragraph(text('hello'))))).toBe(false);
    });

    it('treats whitespace-only content as empty', () => {
        expect(isEmptyDoc(doc(paragraph(text('   '))))).toBe(true);
    });
});

describe('docToText', () => {
    it('joins the text of a paragraph', () => {
        expect(docToText(doc(paragraph(text('hello world'))))).toBe('hello world');
    });

    it('keeps the spacing around a marked run', () => {
        // Marks split a sentence into separate nodes and the spaces live at
        // their edges; losing them glues the words together.
        const document = doc(paragraph(
            text('Κάτι '),
            text('έντονο', [{ type: 'bold' }]),
            text(' εδώ'),
        ));

        expect(docToText(document)).toBe('Κάτι έντονο εδώ');
    });

    it('separates blocks with a single space', () => {
        expect(docToText(doc(paragraph(text('one')), paragraph(text('two'))))).toBe('one two');
    });

    it('turns a hard break into a space', () => {
        expect(docToText(doc(paragraph(text('one'), { type: 'hardBreak' }, text('two')))))
            .toBe('one two');
    });

    it('collapses runs of whitespace', () => {
        expect(docToText(doc(paragraph(text('one   \n  two'))))).toBe('one two');
    });

    it('reads text out of nested nodes such as list items', () => {
        const list = {
            type: 'bulletList',
            content: [
                { type: 'listItem', content: [paragraph(text('first'))] },
                { type: 'listItem', content: [paragraph(text('second'))] },
            ],
        };

        expect(docToText(doc(list))).toBe('first second');
    });

    it('returns nothing for an empty document', () => {
        expect(docToText(emptyDoc())).toBe('');
    });

    it('returns nothing rather than throwing for junk', () => {
        expect(docToText(null)).toBe('');
        expect(docToText(undefined)).toBe('');
        expect(docToText('a string')).toBe('');
    });
});
