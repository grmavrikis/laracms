import { errorSummary } from '../lib/apiErrors';
import { t } from '../lib/i18n';

/**
 * One action applied to several entries (#117 item 19).
 *
 * There is no bulk endpoint - `EntryController` deletes and updates one entry
 * at a time - so this is n requests, and the interesting part is what happens
 * when some of them fail.
 *
 * **`allSettled`, not `all`.** `GalleryEditor` records the reasoning for
 * uploads and it is sharper here: a delete that half-succeeded cannot be undone
 * by retrying the set, so the screen has to be told exactly which rows went and
 * which did not. `all` would reject on the first refusal and leave the panel
 * unable to say either.
 */
export const applyToEach = async (ids, action) => {
    const results = await Promise.allSettled((ids ?? []).map((id) => action(id)));

    const done = [];
    const failed = [];
    let reason = null;

    results.forEach((result, at) => {
        if (result.status === 'fulfilled') {
            done.push(ids[at]);
            return;
        }

        failed.push(ids[at]);
        reason ??= result.reason;
    });

    return { done, failed, reason };
};

/**
 * What to tell the reader afterwards, or `null` when there is nothing to say.
 *
 * The **count** is the information. "Some could not be deleted" leaves somebody
 * counting rows to work out what to try again; *2 of 3 could not be deleted*
 * does not. The endpoint's own reason is appended when it gave one, for the
 * same reason the upload errors are shown rather than replaced with "failed".
 */
export const bulkSummary = ({ done, failed, reason }) => {
    if (failed.length === 0) {
        return null;
    }

    const count = t(':failed of :total could not be done.', {
        failed: failed.length,
        total: failed.length + done.length,
    });

    const why = reason ? errorSummary(reason, '')[0] : '';

    return why ? `${count} ${why}` : count;
};

/**
 * The request one bulk action sends for one entry.
 *
 * **A lookup that throws, not a silent `return`.** `app.jsx` settled this shape
 * for the route table - a name it does not know is a throw, because "loud is
 * affordable" - and the screen was answering an unknown action by doing
 * nothing. The day the two publish controls are enabled, which is one line of
 * PHP away, pressing them would have produced no request, no console message
 * and no banner.
 *
 * Only `delete` is here, and deliberately: `DELETE` needs no body, while
 * `PUT { status }` answers 422 because `SchemaRuleBuilder::build()` hard-codes
 * `data` as required. Adding a key here is what enabling one looks like.
 */
const BULK_REQUESTS = {
    delete: (api, module) => (id) => api.delete(`/modules/${module}/entries/${id}`),
};

export const bulkRequest = (action, api, module) => {
    const build = BULK_REQUESTS[action];

    if (!build) {
        throw new Error(`bulkRequest: there is no bulk action named "${action}".`);
    }

    return build(api, module);
};
