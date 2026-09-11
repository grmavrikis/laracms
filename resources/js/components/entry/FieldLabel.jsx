import { isLabelable, controlId } from './FieldInput';

/**
 * A schema field's name, above its control.
 *
 * **`htmlFor` only when there is something to point at.** Rich text and gallery
 * render composite controls that no `for` can address, and a label claiming an
 * association it does not have is worse than none: the control still has no
 * accessible name, clicking does nothing, and the markup asserts otherwise.
 * Those two get a `<span>` carrying an id instead, which `FieldInput` names its
 * group with through `aria-labelledby` - the standard shape for a control made
 * of several elements.
 */
export const labelId = (field) => `field-${field.name}-label`;

export default function FieldLabel({ field, children }) {
    const className = 'flex items-center gap-2 text-sm font-semibold capitalize text-fg';

    if (!isLabelable(field)) {
        return (
            <span id={labelId(field)} className={className}>
                {field.name}
                {children}
            </span>
        );
    }

    return (
        <label htmlFor={controlId(field)} className={className}>
            {field.name}
            {children}
        </label>
    );
}
