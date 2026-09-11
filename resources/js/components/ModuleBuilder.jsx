// resources/js/components/ModuleBuilder.jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { defaultLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import ModuleTranslations, { translationsPayload } from './ModuleTranslations';
import ModuleFields from './ModuleFields';
import Alert from '../ui/Alert';
import { Checkbox } from '../ui/Input';
import PageHeader from '../ui/PageHeader';
import { Loader2, FolderPlus } from 'lucide-react';
import { isGalleryField } from '../lib/gallery';
import { emptyField, nextFieldId, applyFieldChange, schemaPayload } from '../lib/moduleFields';
import { t } from '../lib/i18n';

// There is deliberately no slugify here. This component used to transliterate
// the name itself and send the result, which meant the stored slug came from a
// Greek-only character map that disagreed with the backend's Str::slug:
// 'Ψυχαγωγία' became psychagogia instead of psikhaghoghia, and 'Café Münchén'
// collapsed to caf-m-nch-n. The backend is the authority - leave the slug field
// empty and it derives one from the name.
export default function ModuleBuilder({ onCreated, onCancel }) {
    // A name and an address per language (#114). `Str::slug` transliterates
    // rather than translates, so one name cannot produce three addresses -
    // the person types each name and the server derives each slug from it.
    const [languages, setLanguages] = useState([]);
    const [languagesError, setLanguagesError] = useState(null);
    const [translations, setTranslations] = useState({});
    const [isSingleton, setIsSingleton] = useState(false);
    const [fields, setFields] = useState([emptyField(0)]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        // Every language, including ones not published yet: the agency adds
        // a language and the client translates into it before it goes live.
        loadLanguages()
            .then(setLanguages)
            .catch((err) => {
                console.error(err);
                setLanguagesError(errorSummary(err, t('Could not load the languages.')));
            });
    }, []);

    const setTranslation = (code, key, value) =>
        setTranslations((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));

    // The three of these, and the payload below, live in `lib/moduleFields`
     // so this screen and the edit screen cannot come to disagree about what a
     // field is - which they already had, in the commit that created the
     // second one.
    const addField = () => setFields((prev) => [...prev, emptyField(nextFieldId(prev))]);

    const removeField = (id) => setFields((prev) => prev.filter((f) => f._id !== id));

    const updateField = (id, key, value) =>
        setFields((prev) => applyFieldChange(prev, id, key, value, isGalleryField));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);
        setSubmitting(true);

        const filled = translationsPayload(translations);

        const payload = {
            // The panel's own key, which never moves again once created. It
            // comes from the default language so the module reads sensibly in
            // the admin list; what a visitor sees comes from `translations`.
            name: (translations[defaultLangCode(languages)]?.name ?? Object.values(filled)[0]?.name ?? '').trim(),
            is_singleton: isSingleton,
            translations: filled,
            schema: schemaPayload(fields),
        };

        try {
            const { data: body } = await api.post('/modules', payload);
            onCreated?.(body.data);
            setTranslations({});
            setIsSingleton(false);
            setFields([emptyField(0)]);
        } catch (err) {
            console.error(err);
            setErrors(errorSummary(err, t('Could not save the module.')));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8 rounded-xl border border-line bg-surface p-6">
            <PageHeader
                icon={FolderPlus}
                title={t('New module')}
                description={t('Give it a name in each language, and the fields its entries hold.')}
            />

            <Alert messages={errors} />
            <Alert messages={languagesError} />

            <ModuleTranslations
                languages={languages}
                value={translations}
                onChange={setTranslation}
            />

            {/* "About" is one entry; "Blog" is many (TASKS.md #60). Worded as
                what the client will see rather than as a flag, because that is
                the decision being made. */}
            <div className="border-t border-line pt-4">
                <label htmlFor="module-singleton" className="flex cursor-pointer select-none items-start gap-3">
                    <Checkbox
                        id="module-singleton"
                        checked={isSingleton}
                        onChange={(e) => setIsSingleton(e.target.checked)}
                        className="mt-0.5"
                    />
                    <span>
                        <span className="block text-sm font-semibold text-fg">
                            {t('This module is a single page')}
                        </span>
                        <span className="block text-xs text-fg-muted">
                            {t('One entry rather than a list of them — About, Contact. Opens straight into its content, with no list to manage.')}
                        </span>
                    </span>
                </label>
            </div>

            <ModuleFields
                fields={fields}
                onChange={updateField}
                onAdd={addField}
                onRemove={removeField}
            />

            <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                    >
                        {t('Cancel')}
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {submitting ? t('Saving…') : t('Create module')}
                </button>
            </div>
        </form>
    );
}