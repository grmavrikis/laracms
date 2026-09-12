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
 * `delete` and `copy` are here; `publish`/`unpublish` are not, and
 * deliberately: `DELETE` needs no body and `copy` only ever *creates*, while
 * `PUT { status }` answers 422 because `SchemaRuleBuilder::build()` hard-codes
 * `data` as required. Adding a key for one of those is what enabling it looks
 * like.
 *
 * **`copy` reads `entries`, the other two do not need to.** A duplicate is a
 * new row carrying an existing one's `data` - `POST` builds it the same way
 * the create form does - so it is the one bulk action that has to look the
 * id up in what the screen already has in memory rather than sending the id
 * on its own. `status` and `slugs` are both left out of the body on purpose:
 * `status` then takes the column's own default (`draft`), so a copy is never
 * live the moment it is made, and no `slugs` key means the copy has no
 * address in any language - `EntryController::syncSlugs` only ever writes
 * rows when the key is present, so two entries never fight over one slug the
 * client never chose for either of them.
 */
const BULK_REQUESTS = {
    delete: (api, module) => (id) => api.delete(`/modules/${module}/entries/${id}`),
    copy: (api, module, entries) => (id) => {
        const entry = (entries ?? []).find((one) => String(one.id) === String(id));

        return api.post(`/modules/${module}/entries`, { data: entry?.data ?? {} });
    },
};

export const bulkRequest = (action, api, module, entries) => {
    const build = BULK_REQUESTS[action];

    if (!build) {
        throw new Error(`bulkRequest: there is no bulk action named "${action}".`);
    }

    return build(api, module, entries);
};
