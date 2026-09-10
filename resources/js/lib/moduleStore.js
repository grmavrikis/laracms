import api from './api';

/**
 * One fetch of `/api/modules` per page load, shared by the sidebar and the
 * module list - with **invalidation**, which is where this differs from
 * `languageStore`.
 *
 * Languages change only when the agency runs an INSERT by hand (#52), so that
 * store caches for the life of the page and never looks again. Modules are
 * created and renamed *from the panel*, and since #117 they are also the
 * navigation - so a create that left the rail stale would be a section the
 * client just made and cannot reach.
 *
 * Hence `forgetModules`, and hence the subscription: two consumers have to
 * agree, and the one that changed a module is not the one showing the menu.
 */
let pending = null;

const listeners = new Set();

/** @returns {Promise<Array<object>>} */
export const loadModules = () => {
    if (pending === null) {
        pending = api.get('/modules')
            // The endpoint answers a bare array; the `data` envelope is
            // tolerated because `ModulesList` has always tolerated it.
            .then(({ data }) => (Array.isArray(data) ? data : data?.data ?? []))
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

/**
 * Drop the copy and tell everyone showing it.
 *
 * Called after anything that changes what modules exist or what they are
 * called - creating one, renaming one, editing its schema.
 */
export const forgetModules = () => {
    pending = null;

    // A copy, because a listener is allowed to unsubscribe while being told.
    for (const listener of [...listeners]) {
        listener();
    }
};

/** @returns {() => void} an unsubscribe function */
export const onModulesChanged = (listener) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};
