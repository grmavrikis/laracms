/**
 * The panel's form controls.
 *
 * The class string lived as a `const` inside `EntryForm` and was reproduced by
 * hand in `Login`, `ModuleBuilder` and `SettingsManager` - four copies of the
 * same ring, padding and focus outline, already drifting in their vertical
 * padding. It is one string here, and the components around it exist so a
 * caller writes `<Input type="date" …>` rather than remembering to spread it.
 */
export const INPUT_CLASSES =
    'block w-full rounded-lg border border-line bg-surface px-3 py-2 text-fg '
    + 'placeholder:text-fg-subtle transition-colors focus-visible:outline-2 '
    + 'focus-visible:outline-offset-2 focus-visible:outline-ring-accent '
    + 'disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The small caps label that sits over a box.
 *
 * Written out by hand in `PublicationPanel`, and wanted again by the gallery's
 * alt boxes and the file picker - the third copy of a string is where this
 * repo has twice decided to stop copying.
 */
export const INPUT_LABEL_CLASSES = 'mb-1 block text-xs font-semibold uppercase text-fg-muted';

export function Input({ className = '', ...rest }) {
    return <input className={`${INPUT_CLASSES} ${className}`} {...rest} />;
}

/**
 * A checkbox, tinted by the panel's accent.
 *
 * **`text-*` does not do that.** It sets `color`, which a native control
 * ignores; `accent-color` is the property that paints the box and its tick, and
 * `accent-accent` is the utility for it. Every checkbox in the panel carried
 * `text-accent` or `text-accent-text` and rendered the browser default blue -
 * measured live with the emerald palette active, `accent-color` read `auto`
 * while `--ui-accent` was `#34d399`. Six controls in five files, in all six
 * palettes and both themes: the one place item 3's token layer never reached.
 *
 * The size is here too, because a checkbox that is 16px on one screen and 20px
 * on another is the drift `INPUT_CLASSES` exists to have ended.
 */
export const CHECKBOX_CLASSES =
    'h-4 w-4 cursor-pointer rounded border-line-strong accent-accent '
    + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent '
    + 'disabled:cursor-not-allowed disabled:opacity-40';

export function Checkbox({ className = '', ...rest }) {
    return <input type="checkbox" className={`${CHECKBOX_CLASSES} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
    return (
        <select className={`${INPUT_CLASSES} cursor-pointer ${className}`} {...rest}>
            {children}
        </select>
    );
}
