/**
 * A button whose whole content is an icon.
 *
 * Extracted at its **second** use, not before it: `ThemeMenu`'s trigger and the
 * sidebar's collapse toggle are the same shape, and a third is coming in the
 * entries table. Written earlier it would have been designed for a screen that
 * did not exist yet - the mistake TASKS.md → Decisions already names about the
 * module generator.
 *
 * `label` is required and does two jobs, because an icon on its own has neither:
 * `aria-label` gives it a name in the accessibility tree, and `title` gives a
 * sighted pointer user a tooltip. Dropping the second one is a real regression
 * and has happened here once already.
 */
const TONES = {
    // On a normal page surface.
    surface: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
    // On the dark rail, which keeps its own tokens in both themes.
    sidebar: 'text-sidebar-fg-muted hover:bg-sidebar-hover hover:text-sidebar-fg',
    // A control that destroys something. Resting colour is the same as
    // `surface` - a row of icons should not be a row of red - and only the
    // hover turns.
    danger: 'text-fg-muted hover:bg-danger-soft hover:text-danger-text',
};

/**
 * **A tone replaces; it never stacks.** `hover:text-danger-text` appended to a
 * caller's `className` reads as though it wins and does not: `surface` already
 * emits `hover:text-fg` at identical specificity, and Tailwind orders utilities
 * in the compiled stylesheet alphabetically rather than by the order they
 * appear in the class attribute. Measured in the built CSS,
 * `.hover\:text-danger-text:hover` is rule 658 and `.hover\:text-fg:hover` is
 * 659, so the base colour won and the remove controls in `ModuleFields` and
 * `GalleryEditor` had no destructive hover at all. Anything that needs
 * different hover colours needs a tone here, not an override there.
 */

export default function IconButton({
    icon: Icon,
    label,
    tone = 'surface',
    className = '',
    ...rest
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={
                'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg '
                + 'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 '
                + `focus-visible:outline-ring-accent ${TONES[tone] ?? TONES.surface} ${className}`
            }
            {...rest}
        >
            {/* Decorative: the button already has an accessible name, so
                announcing the glyph as well is noise. */}
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
    );
}
