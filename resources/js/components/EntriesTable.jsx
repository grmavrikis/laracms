import { isRichTextField, docToText } from '../lib/richText';
import { isGalleryField, galleryPreview } from '../lib/gallery';
import { getLangCode } from '../lib/languages';
import { isPublished, reorderedIds, positionInOrder, sortByOrder } from '../lib/entries';

export default function EntriesTable({
    schema,
    entries,
    onEdit,
    onReorder,
    orderIds = [],
    languages = [],
    currentLangCode = 'en',
    onLanguageChange,
    pagination = null,
    onPageChange,
}) {
    // Fall back to the row count only when the response was not paginated;
    // otherwise this counted one page and labelled it the total.
    const total = pagination?.total ?? entries?.length ?? 0;
    const hasPages = (pagination?.lastPage ?? 1) > 1;

    // A reorder is applied to the id list before the server confirms it, so
    // the rows follow that rather than waiting for the refetch - otherwise
    // pressing the arrow three times looks like nothing happening.
    const rows = sortByOrder(entries, orderIds);

    return (
        <div className="mt-6 flex flex-col">
            {/* Header section with title/actions and unified language switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">Entries List</h3>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        {total} total
                    </span>
                </div>

                {languages && languages.length > 0 && (
                    <div className="flex p-1 space-x-1 bg-gray-100/80 rounded-lg w-max border border-gray-200/50">
                        {languages.map((l) => {
                            const code = getLangCode(l);
                            const isActive = code === currentLangCode;
                            return (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => onLanguageChange?.(code)}
                                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${isActive
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                                        }`}
                                >
                                    {code.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {!entries || entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 px-4 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="mt-4 text-sm font-semibold text-gray-900">No entries yet</h3>
                    <p className="mt-1 text-sm text-gray-500">There is no data available for this module.</p>
                </div>
            ) : (
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-4 font-semibold text-gray-900">ID</th>
                                        <th scope="col" className="px-4 py-4 font-semibold text-gray-900 uppercase tracking-wide text-xs">
                                            Status
                                        </th>
                                        {schema.map(field => (
                                            <th key={field.name} scope="col" className="px-4 py-4 font-semibold text-gray-900 uppercase tracking-wide text-xs">
                                                {field.name}
                                            </th>
                                        ))}
                                        <th scope="col" className="px-4 py-4 font-semibold text-gray-900 uppercase tracking-wide text-xs">
                                            Created At
                                        </th>
                                        <th scope="col" className="relative px-6 py-4">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {rows.map((entry) => (
                                        <tr key={entry.id} className="group hover:bg-gray-50/50 transition-colors duration-150">
                                            <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                                                #{entry.id}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isPublished(entry)
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                    {isPublished(entry) ? 'Published' : 'Draft'}
                                                </span>
                                            </td>
                                            {schema.map(field => {
                                                let rawValue = (entry.data && entry.data[field.name] !== undefined)
                                                    ? entry.data[field.name]
                                                    : entry[field.name];

                                                let value = rawValue;
                                                if (field.translatable && typeof rawValue === 'object' && rawValue !== null) {
                                                    value = rawValue[currentLangCode] || Object.values(rawValue)[0] || '';
                                                }

                                                // Rich text is a document object, not markup: render a plain
                                                // text excerpt, which React escapes on its own. Nothing here
                                                // injects HTML into the page.
                                                if (isRichTextField(field)) {
                                                    const excerpt = docToText(value);
                                                    return (
                                                        <td key={field.name} className="px-4 py-4 text-gray-600 max-w-xs">
                                                            <div className="line-clamp-2">
                                                                {excerpt || <span className="text-gray-300">-</span>}
                                                            </div>
                                                        </td>
                                                    );
                                                }

                                                // A gallery is a list of objects. Without its own
                                                // branch it fell through to String() below and the
                                                // column read "[object Object],[object Object]".
                                                if (isGalleryField(field)) {
                                                    const preview = galleryPreview(value);
                                                    return (
                                                        <td key={field.name} className="whitespace-nowrap px-4 py-4 text-gray-600">
                                                            {preview || <span className="text-gray-300">-</span>}
                                                        </td>
                                                    );
                                                }

                                                if (typeof value === 'boolean') {
                                                    return (
                                                        <td key={field.name} className="whitespace-nowrap px-4 py-4 text-gray-500">
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                                {value ? 'Yes' : 'No'}
                                                            </span>
                                                        </td>
                                                    );
                                                }

                                                if (value === null || value === undefined) value = '';
                                                let displayValue = String(value);

                                                if (displayValue.length > 50) {
                                                    displayValue = displayValue.substring(0, 50) + '...';
                                                }

                                                return (
                                                    <td key={field.name} className="whitespace-nowrap px-4 py-4 text-gray-600">
                                                        {displayValue || <span className="text-gray-300">-</span>}
                                                    </td>
                                                );
                                            })}
                                            <td className="whitespace-nowrap px-4 py-4 text-gray-500">
                                                {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                                {/* The whole order goes in one
                                                    request, so a move is one
                                                    round trip rather than two
                                                    writes that could half-fail. */}
                                                {onReorder && (() => {
                                                    // Position in the module,
                                                    // not on the page: the row
                                                    // above the first one here
                                                    // may be on the page before
                                                    // (TASKS.md #75). Until the
                                                    // order arrives, -1 leaves
                                                    // both arrows disabled.
                                                    const at = positionInOrder(orderIds, entry.id);

                                                    return (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => onReorder(reorderedIds(orderIds, entry.id, -1))}
                                                                disabled={at <= 0}
                                                                title="Move up"
                                                                className="inline-flex items-center rounded-md px-2 py-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ↑
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => onReorder(reorderedIds(orderIds, entry.id, 1))}
                                                                disabled={at < 0 || at === orderIds.length - 1}
                                                                title="Move down"
                                                                className="inline-flex items-center rounded-md px-2 py-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ↓
                                                            </button>
                                                        </>
                                                    );
                                                })()}
                                                <button
                                                    onClick={() => onEdit(entry)}
                                                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {hasPages && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-gray-500">
                        Showing <span className="font-medium text-gray-900">{pagination.from}</span>
                        {' '}to <span className="font-medium text-gray-900">{pagination.to}</span>
                        {' '}of <span className="font-medium text-gray-900">{pagination.total}</span>
                    </p>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage - 1)}
                            disabled={pagination.currentPage <= 1}
                            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            &larr; Previous
                        </button>

                        <span className="text-sm text-gray-600 px-1">
                            Page {pagination.currentPage} of {pagination.lastPage}
                        </span>

                        <button
                            type="button"
                            onClick={() => onPageChange?.(pagination.currentPage + 1)}
                            disabled={pagination.currentPage >= pagination.lastPage}
                            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Next &rarr;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}