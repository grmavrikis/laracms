// resources/js/components/ModuleBuilder.jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { defaultLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import ModuleTranslations, { translationsPayload } from './ModuleTranslations';
import ModuleFields from './ModuleFields';
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
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-500/15 shadow-sm shrink-0">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('New module')}</h2>
                        <p className="text-sm text-gray-500">{t('Give it a name in each language, and the fields its entries hold.')}</p>
                    </div>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl space-y-1">
                    {errors.map((msg, i) => <div key={i}>{msg}</div>)}
                </div>
            )}

            {languagesError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{languagesError}</div>
            )}

            <ModuleTranslations
                languages={languages}
                value={translations}
                onChange={setTranslation}
            />

            {/* "About" is one entry; "Blog" is many (TASKS.md #60). Worded as
                what the client will see rather than as a flag, because that is
                the decision being made. */}
            <div className="pt-4 border-t border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={isSingleton}
                        onChange={(e) => setIsSingleton(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                        <span className="block text-sm font-semibold text-gray-900">
                            {t('This module is a single page')}
                        </span>
                        <span className="block text-xs text-gray-500">
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

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                    >
                        {t('Cancel')}
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 transition-all"
                >
                    {submitting ? t('Saving…') : t('Create module')}
                </button>
            </div>
        </form>
    );
}