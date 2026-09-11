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

export function Input({ className = '', ...rest }) {
    return <input className={`${INPUT_CLASSES} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
    return (
        <select className={`${INPUT_CLASSES} cursor-pointer ${className}`} {...rest}>
            {children}
        </select>
    );
}
