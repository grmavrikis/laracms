import { X } from 'lucide-react';
import { uploadImage } from '../../lib/api';
import { errorSummary } from '../../lib/apiErrors';
import { isRichTextField } from '../../lib/richText';
import { isGalleryField } from '../../lib/gallery';
import { t } from '../../lib/i18n';
import RichTextEditor from '../RichTextEditor';
import GalleryEditor from '../GalleryEditor';
import { Input, Select } from '../../ui/Input';

/**
 * Whether this field's control is something a `<label for>` can point at.
 *
 * Rich text is a contenteditable inside a `div` and a gallery is a list of
 * images with their own inputs - neither is a labelable element, so a `for`
 * aimed at them resolved to nothing. A label claiming an association it does
 * not have is worse than no label: the control still has no accessible name,
 * clicking does nothing, and the markup says otherwise. Those two are given a
 * `role="group"` named by the same text instead, which is what a composite
 * control is supposed to carry.
 */
export const isLabelable = (field) => !isRichTextField(field) && !isGalleryField(field);

/** The id a labelable control carries, and a label points at. */
export const controlId = (field) => `field-${field.name}`;

/**
 * One schema field's control, chosen by its type (#117 item 13).
 *
 * Lifted out of `EntryForm`, where it was a `renderInput` closure inside a
 * 530-line component - so the branch that decides between nine field types
 * could not be tested without mounting the whole form, its language tabs and
 * its error plumbing. It takes everything it needs as props and holds no state,
 * which is what makes that possible.
 *
 * `onError` reports what the *field* could not do - an upload the endpoint
 * refused - rather than throwing: those reasons are worth showing, and the form
 * owns where a message appears.
 */
export default function FieldInput({ field, value, onChange, languages = [], onError, labelledBy }) {
    if (isRichTextField(field)) {
        return (
            <div
                role="group"
                aria-labelledby={labelledBy}
                className="mt-2 overflow-hidden rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring-accent"
            >
                <RichTextEditor value={value} onChange={onChange} />
            </div>
        );
    }

    if (isGalleryField(field)) {
        return (
            <div role="group" aria-labelledby={labelledBy}>
                <GalleryEditor
                    value={value}
                    onChange={onChange}
                    languages={languages}
                    onError={onError}
                />
            </div>
        );
    }

    if (field.type === 'boolean') {
        return (
            <div className="mt-2 flex h-10 items-center">
                <input
                    id={controlId(field)}
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => onChange(e.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded border-line-strong text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                />
                {/* A `span`, not a second `label`. The field's name above is
                    already the checkbox's label, and two labels on one control
                    are announced differently by every reader - some join them,
                    some take the first. */}
                <span className="ml-3 text-sm text-fg">{t('Enable this field')}</span>
            </div>
        );
    }

    if (field.type === 'date') {
        return (
            <div className="mt-2">
                <Input
                    id={controlId(field)}
                    type="date"
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        );
    }

    if (field.type === 'select') {
        const options = Array.isArray(field.options) ? field.options : [];

        return (
            <div className="mt-2">
                <Select
                    id={controlId(field)}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                >
                    {/* Was the literal `-- Select Option --`, outside `t()` - so
                        no test demanded it and a Greek panel read English in
                        every select. */}
                    <option value="">{t('Choose an option')}</option>
                    {options.map((option, index) => {
                        const optionValue = typeof option === 'object' ? option.value : option;
                        const label = typeof option === 'object' ? option.label : option;

                        return <option key={index} value={optionValue}>{label}</option>;
                    })}
                </Select>
            </div>
        );
    }

    if (field.type === 'image') {
        const handleFileChange = async (e) => {
            const file = e.target.files[0];

            if (!file) return;

            try {
                // The endpoint, its field name and the multipart header live in
                // lib/api.js, shared with the gallery editor.
                onChange(await uploadImage(file));
            } catch (err) {
                console.error('Upload Error:', err);
                // The upload endpoint rejects by type and size, and those
                // reasons are worth showing rather than replacing with "failed".
                onError?.(errorSummary(err, t('Could not upload the image.')));
            }
        };

        return (
            <div className="mt-2 space-y-3">
                <input
                    id={controlId(field)}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full cursor-pointer text-sm text-fg-muted file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-soft-fg"
                />
                {value && (
                    <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-muted">
                        <img
                            src={value}
                            alt={t('Preview')}
                            className="h-full w-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            title={t('Remove image')}
                            aria-label={t('Remove image')}
                            className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-danger/80 text-danger-fg transition-colors hover:bg-danger"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="mt-2">
            {/* No placeholder. It read `Enter title...` directly beneath a label
                that already said "title" - noise, and an untranslatable string
                built from a schema key at that. */}
            <Input
                id={controlId(field)}
                type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
