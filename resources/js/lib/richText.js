// Rich-text fields hold the editor's document as JSON (a Tiptap/ProseMirror
// document), not an HTML string. Nothing in the app ever renders that document
// as raw HTML, so there is no markup to sanitize on the way out.
//
// The lists come from the PHP constants that define them, via
// `php artisan schema:sync-field-types`. They are not restated here.
import fieldTypes from './fieldTypes.json';

export const FIELD_TYPES = fieldTypes.richText;

// No longer offered when building a Module, but a schema written before these
// were collapsed into 'text' can still declare one. Rendering such a field as a
// plain input would show a document object in a text box, so they are
// recognised here too.
export const LEGACY_FIELD_TYPES = fieldTypes.legacyRichText;

export const isRichTextField = (field) =>
    FIELD_TYPES.includes(field?.type) || LEGACY_FIELD_TYPES.includes(field?.type);

export const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export const isEmptyDoc = (doc) => docToText(doc) === '';

/**
 * Flatten a document to plain text, for table previews and excerpts.
 * Text inside one block is joined as-is (the editor already keeps the spaces
 * between marks); block boundaries become a single space.
 */
export function docToText(doc) {
    if (!doc || typeof doc !== 'object') return '';

    const parts = [];

    const collect = (node) => {
        if (!node || typeof node !== 'object') return;

        if (typeof node.text === 'string') {
            parts.push(node.text);
            return;
        }

        if (node.type === 'hardBreak') {
            parts.push(' ');
            return;
        }

        if (Array.isArray(node.content)) {
            node.content.forEach(collect);
            parts.push(' ');
        }
    };

    collect(doc);

    return parts.join('').replace(/\s+/g, ' ').trim();
}
