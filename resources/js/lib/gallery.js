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

/**
 * The stored value as a gallery, migrating what another type left behind.
 *
 * `toGallery` filters for rendering and is right to drop what it cannot draw.
 * This is for the value going *into* the form, where dropping is destructive:
 * a field changed from `image` to `gallery` - the obvious reason to want this
 * type - still holds a bare URL, and filtering it away would show an empty
 * editor over a photograph that is still there, then save the emptiness over
 * it. The URL becomes the first image instead.
 */
export const fromStored = (value) => {
    if (typeof value === 'string') {
        return value === '' ? [] : [galleryItem(value)];
    }

    return toGallery(value);
};

/**
 * What the entries table shows in a gallery column.
 *
 * The table renders this the way it renders `docToText()` for rich text.
 * Without it a gallery reached `String()` on an array of objects and the
 * column read "[object Object],[object Object]".
 *
 * A count rather than thumbnails, deliberately: nothing generates derivative
 * images, so the stored file is the full upload - fifteen rows of those would
 * be tens of megabytes to render a list. Thumbnails belong with the media
 * library, where the derivatives will exist.
 */
export const galleryPreview = (value) => {
    const count = toGallery(value).length;

    if (count === 0) return '';

    return count === 1 ? '1 image' : `${count} images`;
};

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
