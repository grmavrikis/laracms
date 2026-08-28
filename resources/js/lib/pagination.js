// The entries index is paginated, but only `data` used to be read. The table
// therefore counted the rows it had been handed and called that the total, and
// nothing could reach past the first page.

/**
 * Reduce Laravel's paginator payload to what the table needs, in camelCase.
 *
 * Returns null when the payload is not paginated - a plain array, or an object
 * without the paginator's shape - so callers can fall back rather than render
 * controls built from undefined.
 */
export const paginationFrom = (payload) => {
    if (!payload || Array.isArray(payload) || typeof payload.current_page !== 'number') {
        return null;
    }

    return {
        currentPage: payload.current_page,
        lastPage: payload.last_page ?? 1,
        perPage: payload.per_page ?? 0,
        total: payload.total ?? 0,
        from: payload.from ?? 0,
        to: payload.to ?? 0,
    };
};

/**
 * The rows of a response, paginated or not.
 */
export const rowsFrom = (payload) =>
    Array.isArray(payload) ? payload : (payload?.data ?? []);

/**
 * Whether the page that was asked for no longer exists - which happens after
 * entries are removed, or when switching to a module with fewer of them.
 */
export const isPastLastPage = (pagination) =>
    !!pagination && pagination.currentPage > pagination.lastPage;
