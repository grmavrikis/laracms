import { useRef, useState } from 'react';
import { uploadImage } from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { getLangCode } from '../lib/languages';
import {
    toGallery,
    galleryItem,
    altFor,
    withAlt,
    withoutItem,
    appendItems,
    moveItem,
} from '../lib/gallery';

/**
 * Several images on one entry, in an order the author controls.
 *
 * Alt text is edited per language here rather than under the form's language
 * tabs, because a gallery is not a translatable field: the photographs are one
 * set and only their description differs. Each image therefore shows one alt
 * box per active language, side by side.
 */
export default function GalleryEditor({ value, onChange, languages = [], onError })
{
    const items = toGallery(value);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef(null);

    const handleFiles = async (event) => {
        const files = Array.from(event.target.files ?? []);

        // Cleared immediately so choosing the same file twice in a row still
        // fires a change event the second time.
        event.target.value = '';

        if (files.length === 0) return;

        setUploading(true);

        // allSettled, not all: one rejected upload would otherwise discard
        // every file that did succeed alongside it. The successes are kept and
        // the failures reported.
        const results = await Promise.allSettled(files.map(uploadImage));

        const uploaded = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => galleryItem(r.value));

        if (uploaded.length > 0) {
            // Appended to the list *as it stands*, not to `items`, which was
            // captured when this handler was created. Uploading fifteen photos
            // is the intended use, so there is a wide window in which the
            // author removes an image or types alt text - and computing from
            // the captured list would quietly undo all of it.
            onChange((current) => appendItems(toGallery(current), uploaded));
        }

        const failed = results.filter((r) => r.status === 'rejected');

        if (failed.length > 0) {
            console.error('Upload Error:', failed[0].reason);
            // The endpoint refuses by type and by size, and those reasons are
            // worth showing rather than replacing with "failed".
            onError?.(errorSummary(
                failed[0].reason,
                `${failed.length} of ${files.length} images could not be uploaded.`
            ));
        }

        setUploading(false);
    };

    const buttonClass = 'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium '
        + 'text-gray-600 ring-1 ring-inset ring-gray-300 bg-white hover:bg-gray-50 '
        + 'disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

    return (
        <div className="mt-2 space-y-3">
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={handleFiles}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer transition-all disabled:opacity-50"
            />

            {uploading && (
                <p className="text-xs text-gray-500">Uploading…</p>
            )}

            {items.length === 0 ? (
                <p className="text-sm text-gray-400">No images yet.</p>
            ) : (
                <ul className="space-y-3">
                    {items.map((item, index) => (
                        <li
                            // Keyed by URL alone. With the index in the key,
                            // moving an image changed the key of every one
                            // below it, so React discarded and rebuilt those
                            // rows - losing focus in an alt box mid-edit -
                            // instead of moving them. Each upload is stored
                            // under its own generated name, so two images in
                            // one gallery cannot share a URL.
                            key={item.url}
                            className="flex gap-4 rounded-lg border border-gray-200 bg-gray-50/50 p-3"
                        >
                            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                                <img
                                    src={item.url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    onError={(e) => { e.target.style.visibility = 'hidden'; }}
                                />
                            </div>

                            <div className="min-w-0 flex-1 space-y-2">
                                {languages.map((language) => {
                                    const code = getLangCode(language);

                                    return (
                                        <div key={language.id} className="flex items-center gap-2">
                                            <span className="w-8 shrink-0 text-xs font-semibold uppercase text-gray-500">
                                                {code}
                                            </span>
                                            <input
                                                type="text"
                                                value={altFor(item, code)}
                                                onChange={(e) => onChange(withAlt(items, index, code, e.target.value))}
                                                placeholder="Alt text — what the photo shows"
                                                className="block w-full rounded-md border-0 py-1.5 px-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 outline-none bg-white"
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex shrink-0 flex-col gap-1">
                                <button
                                    type="button"
                                    onClick={() => onChange(moveItem(items, index, index - 1))}
                                    disabled={index === 0}
                                    className={buttonClass}
                                    title="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange(moveItem(items, index, index + 1))}
                                    disabled={index === items.length - 1}
                                    className={buttonClass}
                                    title="Move down"
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange(withoutItem(items, index))}
                                    className={`${buttonClass} hover:text-red-600 hover:ring-red-300`}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
