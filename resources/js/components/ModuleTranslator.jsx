// resources/js/components/ModuleTranslator.jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { loadLanguages } from '../lib/languageStore';
import { t } from '../lib/i18n';
import { isGalleryField } from '../lib/gallery';
import { emptyField, fieldsFromSchema, nextFieldId, applyFieldChange, schemaPayload } from '../lib/moduleFields';
import ModuleTranslations, { translationsPayload, translationsFrom } from './ModuleTranslations';
import ModuleFields from './ModuleFields';
import Alert from '../ui/Alert';
import PageHeader from '../ui/PageHeader';
import { Loader2, Pencil } from 'lucide-react';

/**
 * Rename a section, per language (TASKS.md #114).
 *
 * **This screen is the half that was missing.** `PUT /api/modules/{module}`
 * shipped without anything that could reach it, so a module created with one
 * language left blank stayed that way - there was no edit anywhere in the
 * panel. An endpoint nothing can reach is not a feature.
 *
 * **The schema is editable too, up to the point where it would reshape data
 * already stored** (#115). Add a field, reorder, change `required`,
 * `validation` or a select's options. What a field already in the database
 * cannot do is be renamed, retyped, made translatable or removed - those four
 * change the shape of values in `entries.data` and nothing migrates them, so
 * the API refuses them and `ModuleFields` disables them rather than letting
 * somebody fill in a form that will be rejected.
 */
export default function ModuleTranslator({ module, onSaved, onCancel }) {
    const [languages, setLanguages] = useState([]);
    const [translations, setTranslations] = useState(() => translationsFrom(module.slugs));

    // Rows carry their own `locked`, set once from what was in the database
    // when this opened. A field added now stays editable however it is named.
    const [fields, setFields] = useState(() => fieldsFromSchema(module.schema));
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        // Every language, published or not: the agency adds one and the client
        // translates into it before it goes live.
        loadLanguages()
            .then(setLanguages)
            .catch((err) => {
                console.error(err);
                setErrors(errorSummary(err, t('Could not load the languages.')));
            });
    }, []);

    const setTranslation = (code, key, value) =>
        setTranslations((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));

    const addField = () => setFields((prev) => [...prev, emptyField(nextFieldId(prev))]);

    const removeField = (id) => setFields((prev) => prev.filter((f) => f._id !== id));

    const updateField = (id, key, value) =>
        setFields((prev) => applyFieldChange(prev, id, key, value, isGalleryField));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);
        setSubmitting(true);

        try {
            const { data: body } = await api.put(`/modules/${module.slug}`, {
                translations: translationsPayload(translations),
                schema: schemaPayload(fields),
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
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8 rounded-xl border border-line bg-surface p-6">
            {/* The warning is the point of the screen, not decoration: #69
                writes the 301s for a rename, but only the person pressing save
                knows whether they meant to move every page under it. */}
            <PageHeader
                icon={Pencil}
                title={t('Edit this module')}
                description={t('Changing an address changes every page under it. The old one stops working.')}
            />

            <Alert messages={errors} />

            <ModuleTranslations
                languages={languages}
                value={translations}
                onChange={setTranslation}
            />

            <ModuleFields
                fields={fields}
                onChange={updateField}
                onAdd={addField}
                onRemove={removeField}
            />

            <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
                <button
                    type="button"
                    onClick={onCancel}
                    className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                >
                    {t('Cancel')}
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {submitting ? t('Saving…') : t('Save module')}
                </button>
            </div>
        </form>
    );
}
