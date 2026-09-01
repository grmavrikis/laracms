import { describe, it, expect } from 'vitest';
import {
    FIELD_TYPES,
    isGalleryField,
    emptyGallery,
    toGallery,
    fromStored,
    galleryPreview,
    galleryItem,
    altFor,
    withAlt,
    withoutItem,
    appendItems,
    moveItem,
} from './gallery';

const img = (url, alt = {}) => ({ url, alt });
const urls = (items) => items.map((i) => i.url);

describe('isGalleryField', () => {
    it.each(FIELD_TYPES)('recognises %s', (type) => {
        expect(isGalleryField({ type })).toBe(true);
    });

    it('does not claim other types', () => {
        expect(isGalleryField({ type: 'image' })).toBe(false);
        expect(isGalleryField({ type: 'text' })).toBe(false);
        expect(isGalleryField(null)).toBe(false);
        expect(isGalleryField({})).toBe(false);
    });
});

describe('toGallery', () => {
    it('passes a list of images through', () => {
        const items = [img('a.jpg'), img('b.jpg')];

        expect(toGallery(items)).toEqual(items);
    });

    it('returns an empty list for anything that is not one', () => {
        // A schema can be edited straight in the database, so a field that
        // used to be an `image` still holds a bare string. Spreading that
        // into characters would render one thumbnail per letter.
        expect(toGallery('/storage/uploads/sea.jpg')).toEqual([]);
        expect(toGallery(null)).toEqual([]);
        expect(toGallery(undefined)).toEqual([]);
        expect(toGallery({ url: 'a.jpg' })).toEqual([]);
    });

    it('drops entries that are not objects', () => {
        expect(toGallery([img('a.jpg'), 'b.jpg', null, ['c.jpg']])).toEqual([img('a.jpg')]);
    });
});

describe('fromStored', () => {
    it('keeps a list that is already a gallery', () => {
        const items = [img('a.jpg'), img('b.jpg')];

        expect(fromStored(items)).toEqual(items);
    });

    it('carries a bare URL over as the first image', () => {
        // Changing a field from `image` to `gallery` is the obvious reason to
        // want this type, and the photograph is still wanted. Filtering it
        // away would show an empty editor over data that is still there, and
        // saving would then wipe it.
        expect(fromStored('/storage/uploads/sea.jpg')).toEqual([
            { url: '/storage/uploads/sea.jpg', alt: {} },
        ]);
    });

    it('treats an empty string as no images', () => {
        expect(fromStored('')).toEqual([]);
    });

    it('gives an empty list for anything else', () => {
        expect(fromStored(null)).toEqual([]);
        expect(fromStored(undefined)).toEqual([]);
        expect(fromStored(42)).toEqual([]);
        expect(fromStored({ url: 'a.jpg' })).toEqual([]);
    });
});

describe('galleryPreview', () => {
    // The entries table renders whatever a helper gives it, the way it renders
    // docToText() for rich text. Without one, a gallery reached String() on an
    // array of objects and the column read "[object Object],[object Object]".
    it('counts the images', () => {
        expect(galleryPreview([img('a.jpg'), img('b.jpg'), img('c.jpg')])).toBe('3 images');
    });

    it('uses the singular for one', () => {
        expect(galleryPreview([img('a.jpg')])).toBe('1 image');
    });

    it('is empty for none, so the table shows its own dash', () => {
        expect(galleryPreview([])).toBe('');
        expect(galleryPreview(null)).toBe('');
        expect(galleryPreview(undefined)).toBe('');
    });

    it('counts only what is really an image', () => {
        expect(galleryPreview([img('a.jpg'), 'b.jpg', null])).toBe('1 image');
    });

    it('never returns an object, whatever it is handed', () => {
        // The bug being fixed: anything that reaches String() in the table has
        // to be a string already.
        expect(typeof galleryPreview('/storage/uploads/sea.jpg')).toBe('string');
        expect(typeof galleryPreview({ url: 'a.jpg' })).toBe('string');
    });
});

describe('altFor', () => {
    it('reads the alt text for one language', () => {
        expect(altFor(img('a.jpg', { el: 'Θάλασσα', en: 'Sea' }), 'en')).toBe('Sea');
    });

    it('is empty when that language has none, rather than undefined', () => {
        // The value goes straight into a controlled input, and undefined would
        // make React switch it to uncontrolled halfway through typing.
        expect(altFor(img('a.jpg', { el: 'Θάλασσα' }), 'en')).toBe('');
        expect(altFor(img('a.jpg'), 'en')).toBe('');
        expect(altFor(undefined, 'en')).toBe('');
    });
});

describe('withAlt', () => {
    it('sets the alt text of one image in one language', () => {
        const items = [img('a.jpg'), img('b.jpg')];

        expect(withAlt(items, 1, 'en', 'Sea view')[1].alt).toEqual({ en: 'Sea view' });
    });

    it('leaves the other languages of that image alone', () => {
        const items = [img('a.jpg', { el: 'Θάλασσα' })];

        expect(withAlt(items, 0, 'en', 'Sea')[0].alt).toEqual({ el: 'Θάλασσα', en: 'Sea' });
    });

    it('leaves the other images alone', () => {
        const items = [img('a.jpg', { el: 'Ένα' }), img('b.jpg')];

        expect(withAlt(items, 1, 'el', 'Δύο')[0].alt).toEqual({ el: 'Ένα' });
    });

    it('does not mutate the list it was given', () => {
        const items = [img('a.jpg')];

        withAlt(items, 0, 'en', 'Sea');

        expect(items[0].alt).toEqual({});
    });
});

describe('withoutItem', () => {
    it('removes one image and keeps the order of the rest', () => {
        const items = [img('a.jpg'), img('b.jpg'), img('c.jpg')];

        expect(urls(withoutItem(items, 1))).toEqual(['a.jpg', 'c.jpg']);
    });

    it('does not mutate the list it was given', () => {
        const items = [img('a.jpg'), img('b.jpg')];

        withoutItem(items, 0);

        expect(items).toHaveLength(2);
    });
});

describe('appendItems', () => {
    it('adds uploads to the end, so the order on screen is the order sent', () => {
        const items = [img('a.jpg')];

        expect(urls(appendItems(items, [galleryItem('b.jpg'), galleryItem('c.jpg')])))
            .toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });
});

describe('moveItem', () => {
    const items = [img('a.jpg'), img('b.jpg'), img('c.jpg')];

    it('moves an image earlier', () => {
        expect(urls(moveItem(items, 2, 1))).toEqual(['a.jpg', 'c.jpg', 'b.jpg']);
    });

    it('moves an image later', () => {
        expect(urls(moveItem(items, 0, 2))).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
    });

    it('returns the same list when the move is a no-op or out of range', () => {
        expect(moveItem(items, 1, 1)).toBe(items);
        expect(moveItem(items, -1, 0)).toBe(items);
        expect(moveItem(items, 0, 3)).toBe(items);
        expect(moveItem(items, 3, 0)).toBe(items);
    });

    it('does not mutate the list it was given', () => {
        moveItem(items, 0, 2);

        expect(urls(items)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    });
});

describe('emptyGallery', () => {
    it('is an empty list, not null - the form always sends what it holds', () => {
        expect(emptyGallery()).toEqual([]);
    });

    it('is a fresh list each time, so two fields cannot share one', () => {
        expect(emptyGallery()).not.toBe(emptyGallery());
    });
});
