import { useState, useEffect } from 'react';
import { Pencil, Plus } from 'lucide-react';
import api from '../lib/api';
import EntryForm from '../components/EntryForm';
import { t, locale } from '../lib/i18n';
import { loadLanguages } from '../lib/languageStore';
import { moduleNameForReader } from '../lib/modules';
import useRoute from '../hooks/useRoute';
import PageHeader from '../ui/PageHeader';
import Badge from '../ui/Badge';

/**
 * One entry, at its own address (#117 item 12).
 *
 * **Nothing renders `EntryForm` until everything it needs is here**, and that
 * is the whole reason this screen has three loading branches rather than one.
 * The form seeds its state in `useState` initialisers from `initialData` and
 * `languages` - so mounting it early does not merely show a blank form, it
 * captures blank as the entry's content, and the first save writes that over
 * whatever was there. A deep link is exactly the case that would do it.
 */
export default function EntryEditScreen({ module, entryId }) {
    const [route, navigate] = useRoute();

    const [entry, setEntry] = useState(null);
    const [languages, setLanguages] = useState(null);

    // Two failures rather than one. They were sharing a variable, and the entry
    // effect cleared it on every run - so re-reading an entry discarded a
    // languages error that was still true, leaving the loading guard for ever.
    // Exactly the shape the old `EntriesManager` carried a comment about.
    const [languagesError, setLanguagesError] = useState(null);
    const [entryError, setEntryError] = useState(null);
    const error = entryError || languagesError;

    const creating = entryId === null || entryId === undefined;

    useEffect(() => {
        let current = true;

        loadLanguages()
            .then((list) => current && setLanguages(list))
            .catch((err) => {
                console.error(err);

                if (current) setLanguagesError(t('Could not load the languages.'));
            });

        return () => { current = false; };
    }, []);

    useEffect(() => {
        if (creating) {
            setEntry(null);

            return undefined;
        }

        let current = true;

        setEntryError(null);

        api.get(`/modules/${module.slug}/entries/${entryId}`)
            .then(({ data }) => current && setEntry(data))
            .catch((err) => {
                console.error(err);

                if (current) setEntryError(t('Could not open that entry.'));
            });

        return () => { current = false; };
    }, [module.slug, entryId, creating]);

    /**
     * Back to the listing, on the page it was opened from.
     *
     * The page rides along in the query string of this screen's own address,
     * because the form is otherwise the one place that does not know where the
     * reader came from - and returning always landed on page one, which is the
     * regression putting the page in the address was meant to end.
     */
    const backToList = () => navigate('entries', { module: module.slug }, {
        query: route.query.page ? { page: route.query.page } : null,
    });

    const handleSaved = (saved) => {
        // A singleton has no list behind the form, so closing it cannot mean
        // "go back to the list". Saving keeps the author on the content they
        // just wrote - throwing them out meant they could not see the result,
        // and a correction needed navigating back in, on the screen a client
        // edits most.
        if (creating && saved?.id) {
            // Now that it exists it has an address of its own. `replace`, or
            // Back returns to a create form for an entry that has been created.
            navigate('entryEdit', { module: module.slug, entry: saved.id }, {
                replace: true,
                query: route.query.page ? { page: route.query.page } : null,
            });

            return;
        }

        if (module.is_singleton) {
            setEntry(saved ?? entry);

            return;
        }

        backToList();
    };

    const handleCancel = () => {
        if (module.is_singleton) {
            navigate('modules');

            return;
        }

        backToList();
    };

    const moduleName = moduleNameForReader(module, languages, locale);

    const header = (
        <PageHeader
            icon={creating ? Plus : Pencil}
            title={creating ? t('New entry') : t('Edit entry')}
            description={moduleName}
            actions={!creating && entry?.id ? <Badge tone="accent">#{entry.id}</Badge> : null}
        />
    );

    if (error) {
        return (
            <div className="space-y-6">
                {header}
                <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-text">
                    <p role="alert">{error}</p>
                    <button
                        type="button"
                        onClick={backToList}
                        className="mt-2 cursor-pointer font-medium underline-offset-2 hover:underline"
                    >
                        {t('Back to modules')}
                    </button>
                </div>
            </div>
        );
    }

    // The guard. `languages` is null until its request answers, and `entry` is
    // null until an existing one arrives - and an empty array of languages is a
    // real answer, so the check is on null rather than on length.
    if (languages === null || (!creating && entry === null)) {
        return (
            <div className="space-y-6">
                {header}
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading…')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {header}

            <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
                <EntryForm
                    // Keyed by the entry, so switching from one to another
                    // rebuilds the form rather than leaving the first entry's
                    // values seeded in a form now labelled with the second's.
                    key={entry?.id ?? 'new'}
                    moduleSlug={module.slug}
                    schema={module.schema ?? []}
                    languages={languages}
                    initialData={entry}
                    onSaved={handleSaved}
                    onCancel={handleCancel}
                />
            </div>
        </div>
    );
}
