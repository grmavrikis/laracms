import { useState, useEffect, useCallback } from 'react';
// One named import per icon. A namespace import (`import * as icons`) defeats
// tree-shaking and pulls the whole set - about 1,400 components - into the
// bundle.
import { Boxes, ChevronRight, Pencil, Plus, RefreshCw, FileText, List } from 'lucide-react';
import { t, locale } from '../lib/i18n';
import { contentLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { loadModules, forgetModules, onModulesChanged } from '../lib/moduleStore';
import { moduleNameIn, missingTranslations } from '../lib/modules';
import PageHeader from '../ui/PageHeader';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';

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
            // visit flashed the untranslated names and then flipped.
            //
            // Through `loadModules` rather than a second `api.get('/modules')`:
            // the rail is built from the same list, so opening this screen used
            // to ask for it twice. The store is also what tells the rail when a
            // module here is renamed.
            const [list, langs] = await Promise.all([
                loadModules(),
                // The languages may fail on their own: `contentLangCode` over
                // an empty list answers null and `moduleNameIn` falls back to
                // the module's own name, which is the list exactly as it was
                // before #114. Losing the modules is the failure worth
                // reporting.
                loadLanguages().catch((err) => {
                    console.error(err);

                    return [];
                }),
            ]);

            setModules(list);
            setLanguages(langs);
        } catch (err) {
            setError(t('Could not load the modules.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModules();

        // A rename from the edit screen changes what belongs here, and the rail
        // and this table have to agree about it.
        return onModulesChanged(fetchModules);
    }, [fetchModules]);

    const header = (
        <PageHeader
            icon={Boxes}
            title={t('Modules')}
            description={t('The sections your site is built from.')}
            actions={(
                <>
                    <IconButton
                        icon={RefreshCw}
                        label={t('Refresh')}
                        // Drop the shared copy, or this asks for a list it is
                        // already holding and nothing changes.
                        onClick={() => forgetModules()}
                    />
                    <button
                        type="button"
                        onClick={onCreateModule}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {t('Add module')}
                    </button>
                </>
            )}
        />
    );

    if (loading) {
        return (
            <div className="space-y-6">
                {header}
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading modules…')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                {header}
                <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-text">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={fetchModules}
                        className="mt-2 cursor-pointer font-medium underline-offset-2 hover:underline"
                    >
                        {t('Try again')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}

            {modules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong p-12 text-center">
                    <p className="text-sm font-medium text-fg">{t('No modules yet.')}</p>
                    <p className="mt-1 text-sm text-fg-muted">
                        {t('A module is one section of the site — rooms, offers, a page.')}
                    </p>
                </div>
            ) : (
                // The table scrolls inside its own box rather than pushing the
                // page sideways, which is what `min-w-0` on the Shell's main
                // region is there to allow.
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                    <table className="min-w-full divide-y divide-line text-sm">
                        <thead className="bg-surface-muted">
                            <tr>
                                <th scope="col" className="py-3 pl-4 pr-3 text-left font-semibold text-fg sm:pl-6">
                                    {t('Module name')}
                                </th>
                                <th scope="col" className="hidden px-3 py-3 text-left font-semibold text-fg sm:table-cell">
                                    {t('Slug')}
                                </th>
                                <th scope="col" className="hidden px-3 py-3 text-left font-semibold text-fg md:table-cell">
                                    {t('Languages')}
                                </th>
                                <th scope="col" className="py-3 pl-3 pr-4 text-right font-semibold text-fg sm:pr-6">
                                    {t('Actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {modules.map((mod) => {
                                const missing = missingTranslations(mod, languages);

                                return (
                                    <tr key={mod.id ?? mod.slug} className="transition-colors hover:bg-surface-muted/60">
                                        <td className="py-3 pl-4 pr-3 sm:pl-6">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-fg">
                                                    {moduleNameIn(mod, viewLangCode)}
                                                </span>
                                                {/* Whether this is one page or
                                                    many decides what opening it
                                                    does, so it belongs on the
                                                    row rather than being
                                                    discovered by clicking. */}
                                                <Badge tone="neutral">
                                                    {mod.is_singleton
                                                        ? <><FileText className="h-3 w-3" aria-hidden="true" />{t('Single page')}</>
                                                        : <><List className="h-3 w-3" aria-hidden="true" />{t('List')}</>}
                                                </Badge>
                                            </div>
                                            {/* The slug has no column of its own
                                                on a narrow screen, so it rides
                                                under the name instead of being
                                                lost. */}
                                            <span className="mt-0.5 block font-mono text-xs text-fg-subtle sm:hidden">
                                                {mod.slug}
                                            </span>
                                        </td>

                                        <td className="hidden px-3 py-3 font-mono text-xs text-fg-muted sm:table-cell">
                                            {mod.slug}
                                        </td>

                                        <td className="hidden px-3 py-3 md:table-cell">
                                            {missing.length === 0 ? (
                                                <Badge tone="success">{t('All languages')}</Badge>
                                            ) : (
                                                <span className="flex flex-wrap gap-1">
                                                    {/* Named, not counted. "2
                                                        missing" makes somebody
                                                        open the module to find
                                                        out which - and since
                                                        #114 a module with no
                                                        translation has no page
                                                        in that language at all. */}
                                                    {missing.map((code) => (
                                                        <Badge key={code} tone="warning">
                                                            {t('No :language page', { language: code.toUpperCase() })}
                                                        </Badge>
                                                    ))}
                                                </span>
                                            )}
                                        </td>

                                        <td className="py-3 pl-3 pr-4 text-right sm:pr-6">
                                            <div className="flex items-center justify-end gap-1">
                                                <IconButton
                                                    icon={Pencil}
                                                    label={t('Edit this module')}
                                                    onClick={() => onTranslateModule(mod)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectModule(mod)}
                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                                >
                                                    {/* A singleton opens straight
                                                        into its one entry, so
                                                        calling that "Entries"
                                                        promises a list that is
                                                        never shown. */}
                                                    {mod.is_singleton ? t('Open') : t('Entries')}
                                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
