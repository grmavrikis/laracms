/**
 * A file picker, styled through the `file:` variant.
 *
 * Extracted on its **third** copy, not its first: the string was written out by
 * hand in `FieldInput`'s image branch, in `GalleryEditor` and in
 * `SettingsManager`, and it had already drifted - two of them painted the button
 * text `accent-text`, which is the colour for text on the *page*, while the
 * third used `accent-soft-fg`, which is the one that belongs on `accent-soft`.
 * That is the same drift `ui/Input` exists to have ended.
 *
 * `label` is required. A bare file input is announced as "button" and nothing
 * else, and the field name above it - where there is one - names the group
 * rather than this control.
 */
import { INPUT_LABEL_CLASSES } from './Input';

/**
 * The picker's own styling, for the two callers that are already labelled from
 * outside: `FieldInput`, where `FieldLabel` renders the schema field's name
 * above it, and `SettingsManager`, which draws its own. They take the string
 * rather than the component so they do not end up with two labels on one
 * control - the defect #117's review round found in the boolean field.
 */
export const FILE_CLASSES =
    'block w-full cursor-pointer text-sm text-fg-muted '
    + 'file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent-soft '
    + 'file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent-soft-fg '
    + 'focus-visible:outline-2 focus-visible:outline-offset-2 '
    + 'focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50';

export default function FileInput({ id, label, hideLabel = false, className = '', ...rest }) {
    return (
        <div className={className}>
            <label htmlFor={id} className={hideLabel ? 'sr-only' : INPUT_LABEL_CLASSES}>
                {label}
            </label>
            <input id={id} type="file" className={FILE_CLASSES} {...rest} />
        </div>
    );
}
