import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, ImageOff, Loader2 } from 'lucide-react';
import { uploadImage } from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { Input, INPUT_LABEL_CLASSES } from '../ui/Input';
import FileInput from '../ui/FileInput';
import IconButton from '../ui/IconButton';
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
 *
 * **Every box is labelled by position and language** (#117 item 15). Two
 * photographs in two languages is four identical boxes, and a reader who cannot
 * see the thumbnail beside them had nothing to tell them apart - the language
 * code was a `span` sitting next to an input, which associates with nothing.
 * The position is what identifies an image here: the URL is a generated
 * filename and the alt text is the thing being written.
 */
export default function GalleryEditor({ value, onChange, languages = [], onError })
{
    const items = toGallery(value);
    const [uploading, setUploading] = useState(false);

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
        // Wrapped rather than passed by reference: `map` hands its callback
        // the index and the whole array too, so the day uploadImage takes a
        // second argument every call here would quietly supply the index.
        const results = await Promise.allSettled(files.map((file) => uploadImage(file)));

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
                t(':failed of :total images could not be uploaded.', {
                    failed: failed.length,
                    total: files.length,
                })
            ));
        }

        setUploading(false);
    };

    return (
        <div className="mt-2 space-y-3">
            <FileInput
                id="gallery-upload"
                label={t('Add images')}
                hideLabel
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={handleFiles}
            />

            {uploading && (
                <p className="flex items-center gap-2 text-xs text-fg-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {t('Uploading…')}
                </p>
            )}

            {items.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-4 text-sm text-fg-muted">
                    <ImageOff className="h-4 w-4" aria-hidden="true" />
                    {t('No images yet.')}
                </p>
            ) : (
                <ul className="space-y-3">
                    {items.map((item, index) => {
                        const position = index + 1;

                        return (
                            <li
                                // Keyed by URL alone. With the index in the key,
                                // moving an image changed the key of every one
                                // below it, so React discarded and rebuilt those
                                // rows - losing focus in an alt box mid-edit -
                                // instead of moving them. Each upload is stored
                                // under its own generated name, so two images in
                                // one gallery cannot share a URL.
                                key={item.url}
                                role="group"
                                aria-label={t('Image :position', { position })}
                                className="flex gap-4 rounded-xl border border-line bg-surface-muted/50 p-3 transition-colors hover:border-line-strong"
                            >
                                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                                    <img
                                        src={item.url}
                                        // Decorative: the box beside it holds
                                        // the description, and announcing a
                                        // generated filename twice is noise.
                                        alt=""
                                        className="h-full w-full object-cover"
                                        onError={(e) => { e.target.style.visibility = 'hidden'; }}
                                    />
                                    <span className="absolute left-0 top-0 rounded-br-lg bg-surface/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-muted">
                                        {position}
                                    </span>
                                </div>

                                <div className="min-w-0 flex-1 space-y-2">
                                    {languages.map((language) => {
                                        const code = getLangCode(language);
                                        const id = `alt-${position}-${code}`;

                                        return (
                                            <div key={language.id} className="flex items-center gap-2">
                                                <label htmlFor={id} className={`${INPUT_LABEL_CLASSES} mb-0 w-8 shrink-0`}>
                                                    {code}
                                                </label>
                                                <Input
                                                    id={id}
                                                    type="text"
                                                    value={altFor(item, code)}
                                                    onChange={(e) => onChange(withAlt(items, index, code, e.target.value))}
                                                    placeholder={t('Alt text — what the photo shows')}
                                                    className="py-1.5 text-sm"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex shrink-0 flex-col gap-1">
                                    {/* Named by position, not just "Move up":
                                        a list of identical controls tells a
                                        reader nothing about which row they are
                                        standing in. */}
                                    <IconButton
                                        icon={ChevronUp}
                                        label={t('Move image :position up', { position })}
                                        onClick={() => onChange(moveItem(items, index, index - 1))}
                                        disabled={index === 0}
                                        className="h-7 w-7 disabled:cursor-not-allowed disabled:opacity-30"
                                    />
                                    <IconButton
                                        icon={ChevronDown}
                                        label={t('Move image :position down', { position })}
                                        onClick={() => onChange(moveItem(items, index, index + 1))}
                                        disabled={index === items.length - 1}
                                        className="h-7 w-7 disabled:cursor-not-allowed disabled:opacity-30"
                                    />
                                    <IconButton
                                        icon={Trash2}
                                        label={t('Remove image :position', { position })}
                                        onClick={() => onChange(withoutItem(items, index))}
                                        tone="danger"
                                        className="h-7 w-7"
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
