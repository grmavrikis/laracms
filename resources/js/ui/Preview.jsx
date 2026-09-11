import { FlaskConical } from 'lucide-react';
import { t } from '../lib/i18n';

/**
 * A block drawn from invented figures, marked as such on the screen.
 *
 * **This is the phase rule of #117 made visible.** Anything that would need PHP
 * is drawn with static data so the shape of the screen can be judged - and
 * anything drawn that way has to *say so*, because a dashboard showing "47 room
 * views last week" convincingly is worse than one showing nothing: the owner
 * makes a decision on it. CHANGELOG §27 is the same lesson one layer down,
 * where a green test described a world that did not exist.
 *
 * The warning is a `region` named by its own heading, so it is reachable by
 * somebody who cannot see the border and the tint - the marker must not be
 * carried by colour alone.
 *
 * **Every use must leave a TODO naming the endpoint it wants**, which is the
 * item's definition of done and what `screens/preview-markers.test.js` checks.
 * "Make this real later" is not a task; `GET /api/stats/entries` is.
 */
export default function Preview({ note, className = '', children }) {
    const warning = t('Sample data');

    // One sentence, read once: the visible note and the announced one are the
    // same string. They were two, and they drifted the moment a caller passed a
    // note - the dashboard showed "only the counts are examples" and announced
    // "these figures are examples", which reverses the meaning for the reader
    // who most needs it.
    const sentence = note ?? t('These figures are examples, not from your site.');

    return (
        <section
            aria-label={`${warning}. ${sentence}`}
            className={`rounded-xl border border-dashed border-warning/50 bg-warning-soft/40 p-4 ${className}`}
        >
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-0.5 font-semibold text-warning-text ring-1 ring-inset ring-warning/30">
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    {warning}
                </span>
                <span className="text-fg-muted">{sentence}</span>
            </p>

            {children}
        </section>
    );
}
