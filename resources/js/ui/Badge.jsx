/**
 * A small label that states a fact about the row it sits in.
 *
 * Extracted at its second use: the module list marks a section as a single page
 * or a list, and marks each language it has no page in. `EntriesTable` draws a
 * third by hand for draft and published, which item 11 folds in here.
 *
 * **A badge is never the only carrier of its meaning.** Every one of these
 * repeats in words what its colour suggests, because a tone alone is unusable
 * to anybody who cannot separate the two - and `warning` against `neutral` is
 * exactly the pair that fails first.
 */
const TONES = {
    neutral: 'bg-surface-muted text-fg-muted ring-line',
    accent: 'bg-accent-soft text-accent-soft-fg ring-accent/30',
    success: 'bg-success-soft text-success-text ring-success/30',
    warning: 'bg-warning-soft text-warning-text ring-warning/30',
    danger: 'bg-danger-soft text-danger-text ring-danger/30',
};

export default function Badge({ tone = 'neutral', className = '', children, ...rest }) {
    return (
        <span
            className={
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium '
                + `ring-1 ring-inset ${TONES[tone] ?? TONES.neutral} ${className}`
            }
            {...rest}
        >
            {children}
        </span>
    );
}
