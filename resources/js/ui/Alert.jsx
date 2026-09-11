/**
 * A banner carrying what went wrong, or what went right.
 *
 * Extracted on its **sixth** copy (#117 item 16), which is five too late: the
 * same markup was written out by hand in `EntryForm`, `ModuleBuilder` twice,
 * `ModuleTranslator`, `ModulesList`, `SettingsManager`, `EnquiriesManager` and
 * `EntryEditScreen`.
 *
 * **Only the first of those announced itself.** A banner that appears after a
 * failed save is the one thing on a screen that has to interrupt - it arrives
 * after the press, often below the fold, and without a live role a reader is
 * simply left on a form that did nothing. That is not a styling detail, which
 * is why it lives in the component rather than in a class string.
 *
 * `alert` is assertive and cuts across whatever is being read. That is right
 * for a refused save and wrong for "saved", so anything that is not a failure
 * is `status` instead.
 */
const TONES = {
    danger: 'border-danger/30 bg-danger-soft text-danger-text',
    warning: 'border-warning/30 bg-warning-soft text-warning-text',
    success: 'border-success/30 bg-success-soft text-success-text',
};

export default function Alert({ tone = 'danger', messages, className = '', children }) {
    const lines = messages === null || messages === undefined
        ? []
        : [].concat(messages).filter((line) => line !== null && line !== undefined && line !== '');

    if (lines.length === 0 && !children) {
        return null;
    }

    return (
        <div
            role={tone === 'danger' ? 'alert' : 'status'}
            className={`space-y-1 rounded-xl border p-4 text-sm ${TONES[tone] ?? TONES.danger} ${className}`}
        >
            {lines.map((line, i) => <div key={i}>{line}</div>)}
            {children}
        </div>
    );
}
