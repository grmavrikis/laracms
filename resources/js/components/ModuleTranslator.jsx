// resources/js/components/ModuleTranslator.jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { languagesFrom } from '../lib/languages';
import { t } from '../lib/i18n';
import ModuleTranslations, { translationsPayload, translationsFrom } from './ModuleTranslations';

/**
 * Rename a section, per language (TASKS.md #114).
 *
 * **This screen is the half that was missing.** `PUT /api/modules/{module}`
 * shipped without anything that could reach it, so a module created with one
 * language left blank stayed that way - there was no edit anywhere in the
 * panel. An endpoint nothing can reach is not a feature.
 *
 * Names and addresses only. The schema is not editable here, and that is the
 * endpoint's decision rather than this screen's: what editing a schema means
 * for the entries already written against it is an open question (TASKS.md,
 * *To discuss*), and a rename screen is the wrong place to answer it.
 */
export default function ModuleTranslator({ module, onSaved, onCancel }) {
    const [languages, setLanguages] = useState([]);
    const [translations, setTranslations] = useState(() => translationsFrom(module.slugs));
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        // Every language, published or not: the agency adds one and the client
        // translates into it before it goes live.
        api.get('/languages')
            .then(({ data }) => setLanguages(languagesFrom(data)))
            .catch((err) => {
                console.error(err);
                setErrors(errorSummary(err, t('Could not load the languages.')));
            });
    }, []);

    const setTranslation = (code, key, value) =>
        setTranslations((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);
        setSubmitting(true);

        try {
            const { data: body } = await api.put(`/modules/${module.slug}`, {
                translations: translationsPayload(translations),
            });

            onSaved?.(body.data);
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
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('Rename this module')}</h2>
                    <p className="text-sm text-gray-500">
                        {t('Changing an address changes every page under it. The old one stops working.')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-sm text-gray-600 hover:text-gray-900"
                >
                    {t('Back to modules')}
                </button>
            </div>

            {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl space-y-1">
                    {errors.map((msg, i) => <div key={i}>{msg}</div>)}
                </div>
            )}

            <ModuleTranslations
                languages={languages}
                value={translations}
                onChange={setTranslation}
            />

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-5">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                    {t('Cancel')}
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                    {submitting ? t('Saving…') : t('Save module')}
                </button>
            </div>
        </form>
    );
}
