import { useState, useEffect, useCallback } from 'react';
// One named import per icon. A namespace import (`import * as icons`) defeats
// tree-shaking and pulls the whole set - about 1,400 components - into the
// bundle.
import { Boxes, ChevronRight, Pencil, Plus, RefreshCw, FileText, List, LayoutGrid } from 'lucide-react';
import { t, locale } from '../lib/i18n';
import { contentLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { loadModules, forgetModules, onModulesChanged } from '../lib/moduleStore';
import { moduleNameIn, missingTranslations } from '../lib/modules';
import PageHeader from '../ui/PageHeader';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';
import Alert from '../ui/Alert';

/**
 * One module, as a card rather than a table row (#130 - the row-and-column
 * treatment read as a spreadsheet for something that is never more than a
 * handful of items; see `TASKS.md` → Deferred, "module grouping - no problem
 * to solve at six modules"; six is also exactly what makes a grid work).
 *
 * **`data-module` is a hook for tests, not styling.** Nothing here reads it;
 * it exists so a test can scope a query to *this* card - "the missing-language
 * badge" is meaningless as a page-wide query once two modules can carry one.
 *
 * The card is not one giant click target. Edit and the primary action are
 * separate controls with separate names, the same rule the rest of this panel
 * follows for a row of buttons that all say "Delete" - a `<div onClick>`
 * around everything would answer neither "what does clicking the icon do" nor
 * "what does clicking the name do" correctly.
 */
function ModuleCard({ module: mod, name, missing, onOpen, onTranslate }) {
    const fieldCount = mod.schema?.length ?? 0;

    return (
        <div
            data-module={mod.slug}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
        >
            <div className="flex items-start gap-3">
                {/* The same icon-tile `PageHeader` opens every screen with, so a
                    module reads as a peer of the screens that manage it rather
                    than a smaller, different kind of thing. */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/20">
                    {mod.is_singleton
                        ? <FileText className="h-5 w-5" aria-hidden="true" />
                        : <List className="h-5 w-5" aria-hidden="true" />}
                </span>

                <div className="min-w-0 flex-1">
                    {/* `h2`, not `h3` - `PageHeader` above already spends `h1`
                        on "Modules" and nothing on this screen sits between
                        the two, so `h3` would skip a level a screen reader's
                        heading list depends on being sequential. */}
                    <h2 className="truncate text-base font-semibold text-fg">{name}</h2>
                    {/* Always on screen, not folded away below `sm`. A table
                        cell had to choose between a column and hiding it under
                        the name; a card has room for both at every width. */}
                    <p className="mt-0.5 truncate font-mono text-xs text-fg-subtle">{mod.slug}</p>
                </div>

                <IconButton
                    icon={Pencil}
                    label={t('Edit this module')}
                    onClick={() => onTranslate(mod)}
                />
            </div>

            {/* Whether this is one page or many decides what opening it does,
                so it stays named in words beside the count of fields - a
                second fact about the module already sitting in memory, not a
                second request to draw it. */}
            <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">
                    {mod.is_singleton
                        ? <><FileText className="h-3 w-3" aria-hidden="true" />{t('Single page')}</>
                        : <><List className="h-3 w-3" aria-hidden="true" />{t('List')}</>}
                </Badge>
                {fieldCount > 0 && (
                    <Badge tone="neutral">{t(':count fields', { count: fieldCount })}</Badge>
                )}
            </div>

            {/* Named, not counted. "2 missing" makes somebody open the module
                to find out which - and since #114 a module with no translation
                has no page in that language at all. */}
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
                {missing.length === 0 ? (
                    <Badge tone="success">{t('All languages')}</Badge>
                ) : (
                    missing.map((code) => (
                        <Badge key={code} tone="warning">
                            {t('No :language page', { language: code.toUpperCase() })}
                        </Badge>
                    ))
                )}
            </div>

            <button
                type="button"
                onClick={() => onOpen(mod)}
                className="mt-auto inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-fg transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
            >
                {/* A singleton opens straight into its one entry, so calling
                    that "Entries" promises a list that is never shown. */}
                {mod.is_singleton ? t('Open') : t('Entries')}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    );
}

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
                <Alert>
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={fetchModules}
                        className="mt-2 cursor-pointer font-medium underline-offset-2 hover:underline"
                    >
                        {t('Try again')}
                    </button>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}

            {modules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong p-12 text-center">
                    <LayoutGrid className="mx-auto h-8 w-8 text-fg-subtle" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-fg">{t('No modules yet.')}</p>
                    <p className="mt-1 text-sm text-fg-muted">
                        {t('A module is one section of the site — rooms, offers, a page.')}
                    </p>
                </div>
            ) : (
                // A grid rather than a table: six items is the whole of a
                // typical site (`TASKS.md` → Deferred), and six rows of a
                // table is mostly empty space next to a few words each. A card
                // per module gives it room to be looked at rather than merely
                // scanned.
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {modules.map((mod) => (
                        <ModuleCard
                            key={mod.id ?? mod.slug}
                            module={mod}
                            name={moduleNameIn(mod, viewLangCode)}
                            missing={missingTranslations(mod, languages)}
                            onOpen={onSelectModule}
                            onTranslate={onTranslateModule}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
