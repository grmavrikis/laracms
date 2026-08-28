import { useState, useEffect } from 'react';
import api from '../lib/api';
import EntryForm from './EntryForm';
import EntriesTable from './EntriesTable';
import { paginationFrom, rowsFrom, isPastLastPage } from '../lib/pagination';

export default function EntriesManager({ module, onBack }) {
    const [languages, setLanguages] = useState([]);
    const [languagesError, setLanguagesError] = useState(null);
    const [viewLangCode, setViewLangCode] = useState(null);
    const [entries, setEntries] = useState([]);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [view, setView] = useState('list');
    const [editingEntry, setEditingEntry] = useState(null);

    useEffect(() => {
        api.get('/languages')
            .then(({ data }) => {
                const list = Array.isArray(data) ? data : data?.data ?? [];
                setLanguages(list);
                if (list.length > 0) {
                    setViewLangCode(list[0].code);
                } else {
                    setLoading(false);
                    setLanguagesError('No active languages found in the database. Please add a language.');
                }
            })
            .catch((err) => {
                console.error(err);
                setLanguagesError('Failed to fetch /api/languages.');
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!viewLangCode || view !== 'list') return;
        setLoading(true);
        setError(null);
        api.get(`/modules/${module.slug}/entries`, { params: { lang: viewLangCode, page } })
            .then(({ data }) => {
                const meta = paginationFrom(data);

                if (isPastLastPage(meta)) {
                    setPage(meta.lastPage);
                    return;
                }

                setEntries(rowsFrom(data));
                setPagination(meta);
            })
            .catch((err) => {
                console.error(err);
                setError('Failed to load entries.');
            })
            .finally(() => setLoading(false));
    }, [viewLangCode, module.slug, refreshKey, view, page]);

    const handleEdit = async (entry) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/modules/${module.slug}/entries/${entry.id}`);
            setEditingEntry(data);
            setView('edit');
        } catch (err) {
            console.error(err);
            setError('Failed to load entry for editing.');
        } finally {
            setLoading(false);
        }
    };

    const handleFormClose = (saved = false) => {
        const wasCreating = view === 'create';

        setView('list');
        setEditingEntry(null);

        if (saved) {
            // Entries are listed newest first, so a new one is on page one.
            // After an edit the entry stays where it was, so does the reader.
            if (wasCreating) {
                setPage(1);
            }

            setRefreshKey((n) => n + 1);
        }
    };

    if (view === 'create' || view === 'edit') {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                    <div className="flex items-center space-x-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={view === 'edit' ? "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" : "M12 4.5v15m7.5-7.5h-15"} />
                            </svg>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <h2 className="text-xl font-bold tracking-tight text-gray-900">
                                {view === 'edit' ? 'Edit Entry' : 'New Entry'}
                            </h2>
                            <span className="text-gray-300 font-light">/</span>
                            <span className="text-lg font-medium text-gray-600">
                                {module.name}
                            </span>
                            {view === 'edit' && editingEntry?.id && (
                                <>
                                    <span className="text-gray-300 font-light">/</span>
                                    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 font-mono">
                                        #{editingEntry.id}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <EntryForm
                        moduleSlug={module.slug}
                        schema={module.schema ?? []}
                        languages={languages}
                        initialData={editingEntry}
                        onSaved={() => handleFormClose(true)}
                        onCancel={() => handleFormClose(false)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-gray-900">{module.name}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {languages.length > 0 && (
                        <button
                            onClick={() => {
                                setEditingEntry(null);
                                setView('create');
                            }}
                            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                        >
                            + Add Entry
                        </button>
                    )}
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                        >
                            &larr; Back to Modules
                        </button>
                    )}
                </div>
            </div>

            {languagesError && <p className="text-sm text-red-600">{languagesError}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading entries...</div>
            ) : (
                <EntriesTable
                    schema={module.schema ?? []}
                    entries={entries}
                    onEdit={handleEdit}
                    languages={languages}
                    currentLangCode={viewLangCode}
                    onLanguageChange={setViewLangCode}
                    pagination={pagination}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
}