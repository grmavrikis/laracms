import api from './api';
import { languagesFrom } from './languages';

/**
 * One fetch of `/api/languages` per page load, shared by every screen.
 *
 * Five components each held their own copy of this request, so moving between
 * the module list, a module's entries and back re-asked for a table that
 * changes when the agency runs an INSERT by hand — adding a language is a
 * billable service and there is deliberately no endpoint for it (TASKS.md
 * #52). It was also five places that had to agree on what the list means,
 * which is the duplication `languagesFrom` was extracted to end, one level up.
 *
 * **Per page load, not forever.** Changing the panel's language reloads the
 * page, and so does signing in, so there is no state here that outlives the
 * thing it describes.
 */
let pending = null;

/** @returns {Promise<Array<object>>} */
export const loadLanguages = () => {
    if (pending === null) {
        pending = api.get('/languages')
            .then(({ data }) => languagesFrom(data))
            .catch((error) => {
                // Not cached: a failed request is not an answer, and the next
                // screen deserves its own attempt rather than inheriting a
                // rejection somebody else caused.
                pending = null;

                throw error;
            });
    }

    return pending;
};

/** Forget it, so the next caller asks again. For tests. */
export const forgetLanguages = () => {
    pending = null;
};
