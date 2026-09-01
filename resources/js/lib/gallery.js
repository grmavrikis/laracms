// A gallery field holds an ordered list of images. Each image is an object,
// not a bare URL, because it carries its own alt text keyed by language:
//
//     [ { url: '/storage/uploads/sea.jpg', alt: { el: 'Θάλασσα', en: 'Sea' } } ]
//
// The gallery itself is never translatable - that would mean a different set
// of photographs per language, when the photographs are one set and only their
// description differs. SchemaRuleBuilder refuses the flag outright.
//
// The type list comes from the PHP constant that defines it, via
// `php artisan schema:sync-field-types`. It is not restated here.
import fieldTypes from './fieldTypes.json';

export const FIELD_TYPES = fieldTypes.gallery;

export const isGalleryField = (field) => FIELD_TYPES.includes(field?.type);

/**
 * The value a gallery field starts on. A field that has never been filled is
 * an empty list, not null - the form always sends the list it is holding.
 */
export const emptyGallery = () => [];

/**
 * Whatever is stored, as a list this code can iterate.
 *
 * A schema can be edited straight in the database, and a field that used to be
 * an `image` holds a bare string - rendering that as a gallery would spread it
 * into characters.
 */
export const toGallery = (value) => (Array.isArray(value) ? value.filter(isImage) : []);

const isImage = (item) => !!item && typeof item === 'object' && !Array.isArray(item);

export const galleryItem = (url) => ({ url, alt: {} });

export const altFor = (item, langCode) => item?.alt?.[langCode] ?? '';

/**
 * All of these return a new list rather than mutating: React compares by
 * identity, and an in-place splice would not re-render.
 */
export const withAlt = (items, index, langCode, text) =>
    items.map((item, i) => (i === index ? { ...item, alt: { ...item.alt, [langCode]: text } } : item));

export const withoutItem = (items, index) => items.filter((_, i) => i !== index);

export const appendItems = (items, added) => [...items, ...added];

/**
 * Move one image to another position, keeping every other image in order.
 *
 * Out-of-range moves return the list unchanged rather than throwing: the
 * buttons that call this are disabled at the ends, and a no-op is the right
 * answer if one ever is not.
 */
export const moveItem = (items, from, to) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
        return items;
    }

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    return next;
};
