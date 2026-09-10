import { useState, useEffect, useCallback } from 'react';
// One named import per icon. A namespace import (`import * as icons`) defeats
// tree-shaking and pulls the whole set - about 1,400 components - into the
// bundle.
import { ChevronRight } from 'lucide-react';
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5 gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-fg">{t('Modules')}</h2>
                        </div>
                    </div>
                </div>
                <div className="py-12 text-center text-sm text-fg-muted">{t('Loading modules…')}</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5 gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/10 shadow-sm shrink-0">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-fg">{t('Modules')}</h2>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-danger-text">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5 gap-4">
                <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/10 shadow-sm shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-fg">{t('Modules')}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCreateModule}
                        className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent transition-all"
                    >
                        + {t('Add module')}
                    </button>
                    <button
                        onClick={fetchModules}
                        className="inline-flex items-center justify-center rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm ring-1 ring-inset ring-line-strong hover:bg-surface-muted transition-all"
                    >
                        ↻ {t('Refresh')}
                    </button>
                </div>
            </div>

            {modules.length === 0 ? (
                <div className="bg-surface rounded-xl border border-line shadow-sm p-12 text-center">
                    <p className="text-sm text-fg-muted">{t('No modules yet.')}</p>
                </div>
            ) : (
                <div className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-line text-sm">
                        <thead className="bg-surface-muted">
                            <tr>
                                <th scope="col" className="py-3.5 pl-6 pr-3 text-left font-semibold text-fg">{t('Module name')}</th>
                                <th scope="col" className="py-3.5 px-3 text-left font-semibold text-fg">{t('Slug')}</th>
                                <th scope="col" className="relative py-3.5 pl-3 pr-6 text-right font-semibold text-fg">{t('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line bg-surface">
                            {modules.map((mod) => (
                                <tr key={mod.id ?? mod.slug} className="hover:bg-surface-muted/50 transition-colors">
                                    <td className="py-4 pl-6 pr-3 font-medium text-fg">
                                        <div className="flex items-center gap-2">
                                            <span>{moduleNameIn(mod, viewLangCode)}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-3 font-mono text-xs text-fg-muted">{mod.slug}</td>
                                    <td className="py-4 pl-3 pr-6 text-right font-medium">
                                        <button
                                            onClick={() => onTranslateModule(mod)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted"
                                            title={t('Edit this module')}
                                        >
                                            {t('Edit')}
                                        </button>
                                        <button
                                            onClick={() => onSelectModule(mod)}
                                            className="inline-flex items-center gap-1.5 text-accent-text hover:text-accent-text font-semibold text-sm transition-colors"
                                        >
                                            {t('Entries')}
                                            {/* Decorative: the button already
                                                says "Entries", so announcing
                                                the arrow as well is noise. */}
                                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
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
