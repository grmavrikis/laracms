import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { t, locale } from '../lib/i18n';
import { contentLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { moduleNameIn } from '../lib/modules';

export default function ModulesList({ onSelectModule, onCreateModule, onTranslateModule }) {
    const [modules, setModules] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Which language this list reads in: the panel's own when the site has it,
    // the site's default otherwise (#114, #116).
    const viewLangCode = contentLangCode(languages, locale);

    const fetchModules = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // **Both, before anything renders.** The names come from the
            // modules and the language to read them in comes from the other
            // request, so showing the table on the first of the two meant every
            // visit flashed the untranslated names and then flipped - on the
            // panel's landing screen, which is the first thing an
            // English-speaking owner sees.
            //
            // The languages are allowed to fail on their own: `contentLangCode`
            // over an empty list answers null and `moduleNameIn` falls back to
            // the module's own name, which is the list exactly as it was before
            // #114. Losing the modules is the failure worth reporting.
            const [{ data }, list] = await Promise.all([
                api.get('/modules'),
                loadLanguages().catch((err) => {
                    console.error(err);

                    return [];
                }),
            ]);

            setModules(Array.isArray(data) ? data : data?.data ?? []);
            setLanguages(list);
        } catch (err) {
            setError(t('Could not load the modules.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModules();
    }, [fetchModules]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('Modules')}</h2>
                        </div>
                    </div>
                </div>
                <div className="py-12 text-center text-sm text-gray-500">{t('Loading modules…')}</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('Modules')}</h2>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-red-600">{error}</p>
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
                        <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('Modules')}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCreateModule}
                        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                    >
                        + {t('Add module')}
                    </button>
                    <button
                        onClick={fetchModules}
                        className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                    >
                        ↻ {t('Refresh')}
                    </button>
                </div>
            </div>

            {modules.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                    <p className="text-sm text-gray-500">{t('No modules yet.')}</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-6 pr-3 text-left font-semibold text-gray-900">{t('Module name')}</th>
                                <th scope="col" className="py-3.5 px-3 text-left font-semibold text-gray-900">{t('Slug')}</th>
                                <th scope="col" className="relative py-3.5 pl-3 pr-6 text-right font-semibold text-gray-900">{t('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {modules.map((mod) => (
                                <tr key={mod.id ?? mod.slug} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 pl-6 pr-3 font-medium text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <span>{moduleNameIn(mod, viewLangCode)}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-3 font-mono text-xs text-gray-500">{mod.slug}</td>
                                    <td className="py-4 pl-3 pr-6 text-right font-medium">
                                        <button
                                            onClick={() => onTranslateModule(mod)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            title={t('Edit this module')}
                                        >
                                            {t('Edit')}
                                        </button>
                                        <button
                                            onClick={() => onSelectModule(mod)}
                                            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-900 font-semibold text-sm transition-colors"
                                        >
                                            {t('Entries')}
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}