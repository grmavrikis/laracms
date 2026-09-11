// resources/js/components/EntryForm.jsx
import { useState } from 'react';
import api from '../lib/api';
import { Loader2 } from 'lucide-react';
import StaticFields from './entry/StaticFields';
import TranslatableFields from './entry/TranslatableFields';
import PublicationPanel from './entry/PublicationPanel';
import { isRichTextField, emptyDoc } from '../lib/richText';
import { isGalleryField, emptyGallery, fromStored } from '../lib/gallery';
import { validationErrors, errorSummary, messagesNotForFields, languagesWithErrors } from '../lib/apiErrors';
import { getLangCode, contentLangCode } from '../lib/languages';
import { STATUS_DRAFT, slugsToMap, entryPayload } from '../lib/entries';
import { t, locale } from '../lib/i18n';

const coerce = (type, raw) => {
    if (type === 'integer') return raw === '' || raw === null ? null : Number(raw);
    if (type === 'boolean') return !!raw;
    return raw;
};

// Rich-text fields hold a document object and gallery fields a list, not a
// string, so neither starts as ''.
const emptyValueFor = (field) => {
    if (field.type === 'boolean') return false;
    if (isRichTextField(field)) return emptyDoc();
    if (isGalleryField(field)) return emptyGallery();
    return '';
};

const emptyValues = (fields) =>
    Object.fromEntries(fields.map((f) => [f.name, emptyValueFor(f)]));

const isTranslatable = (f) =>
    f.translatable === true || f.translatable === 1 || f.translatable === '1' || f.translatable === 'true';


export default function EntryForm({ moduleSlug, schema, languages, onSaved, onCancel, initialData = null }) {
    const isEdit = !!initialData;
    const entryData = initialData?.data || {};

    const staticFields = schema.filter((f) => !isTranslatable(f));
    const translatableFields = schema.filter((f) => isTranslatable(f));

    const [staticValues, setStaticValues] = useState(() => {
        if (!isEdit) return emptyValues(staticFields);
        const obj = {};
        staticFields.forEach(f => {
            const stored = entryData[f.name] ?? emptyValueFor(f);

            // A gallery has to enter state as a list, not just be *drawn* as
            // one. A field whose type was changed from `image` still holds a
            // bare URL: leaving it here showed an empty editor over a
            // photograph that was still there, and saving posted the string
            // back to fail validation with nothing on screen to explain it.
            obj[f.name] = isGalleryField(f) ? fromStored(stored) : stored;
        });
        return obj;
    });

    const [translations, setTranslations] = useState(() => {
        const state = {};
        languages.forEach((l) => {
            state[l.id] = emptyValues(translatableFields);
            if (isEdit) {
                translatableFields.forEach(f => {
                    const val = entryData[f.name]?.[getLangCode(l)];
                    if (val !== undefined) {
                        state[l.id][f.name] = val;
                    }
                });
            }
        });
        return state;
    });

    // Opens on the same language the table does: the panel's own when the
    // site has it, the default otherwise. The form opening on Greek while the
    // listing behind it reads English would be the same complaint one screen
    // along.
    const [activeLangId, setActiveLangId] = useState(() => {
        const code = contentLangCode(languages, locale);

        return languages.find((language) => getLangCode(language) === code)?.id ?? null;
    });
    const [submitting, setSubmitting] = useState(false);

    // Structural, not part of the Module's schema: they mean the same thing
    // for every Module, so they live beside `data` rather than inside it.
    const [status, setStatus] = useState(initialData?.status ?? STATUS_DRAFT);

    // What the entry's status was when this form opened. Saving must not
    // write it back unless the author changed it here (TASKS.md #86).
    const initialStatus = initialData?.status ?? STATUS_DRAFT;
    const [slugs, setSlugs] = useState(() => slugsToMap(initialData?.slugs));

    // What the entry's URLs were when this form opened. Saving must not
    // replace the set unless the author edited one of the boxes.
    //
    // Captured once, like the `slugs` state above it rather than like
    // `initialStatus` below - that one is a primitive and rebuilding it costs
    // nothing, while this walks an array on every keystroke.
    const [initialSlugs] = useState(() => slugsToMap(initialData?.slugs));

    // Field errors keyed by attribute path, plus the messages that belong to
    // no field and would otherwise never be shown.
    const [fieldErrors, setFieldErrors] = useState({});
    const [summary, setSummary] = useState([]);

    // A function is applied to the value as it stands rather than replacing
    // it. The gallery editor needs that: it appends uploads after an await,
    // and anything the author did while the files were in flight - removing an
    // image, typing alt text - would otherwise be overwritten by the list as
    // it was when the upload started.
    const setStaticField = (name, value) => setStaticValues((prev) => ({
        ...prev,
        [name]: typeof value === 'function' ? value(prev[name]) : value,
    }));
    const setTranslatedField = (langId, name, value) => {
        setTranslations((prev) => ({
            ...prev,
            [langId]: { ...prev[langId], [name]: value }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFieldErrors({});
        setSummary([]);

        const payloadData = {};

        staticFields.forEach(f => {
            payloadData[f.name] = coerce(f.type, staticValues[f.name]);
        });

        translatableFields.forEach(f => {
            payloadData[f.name] = {};
            languages.forEach(l => {
                const vals = translations[l.id] || {};
                payloadData[f.name][getLangCode(l)] = coerce(f.type, vals[f.name]);
            });
        });

        const payload = entryPayload({
            data: payloadData,
            slugs,
            initialSlugs,
            status,
            initialStatus,
            isEdit,
        });

        try {
            const url = isEdit ? `/modules/${moduleSlug}/entries/${initialData.id}` : `/modules/${moduleSlug}/entries`;
            const method = isEdit ? 'put' : 'post';
            const { data: saved } = await api[method](url, payload);

            // Handed back, because a create has to know where it landed: since
            // #117 item 12 the form lives at its own address, so saving a new
            // entry navigates to that entry rather than to a list. All three
            // entry endpoints answer with the row read back from the database
            // (ARCHITECTURE §5), so this is the whole entry and not an echo.
            onSaved?.(saved);
        } catch (err) {
            console.error('API Error:', err);

            const errors = validationErrors(err);
            setFieldErrors(errors);

            // A required translation that is missing fails on a tab the author
            // may not have open, and until this the message was rendered under
            // whichever language *was* open - so the Greek box was marked wrong
            // because the French one was empty. Go to the first language that
            // actually failed; the tabs mark the rest.
            const failed = languagesWithErrors(errors, languages.map(getLangCode));

            if (failed.length > 0 && !failed.includes(getLangCode(languages.find((l) => l.id === activeLangId)))) {
                const target = languages.find((l) => getLangCode(l) === failed[0]);

                if (target) setActiveLangId(target.id);
            }

            // On a 422 the per-field messages are rendered beside their inputs,
            // so only what belongs to no field goes in the banner. Anything
            // else has no field to attach to and goes there in full.
            setSummary(
                Object.keys(errors).length > 0
                    ? messagesNotForFields(errors, schema.map((f) => f.name))
                    : errorSummary(err, t('Could not save the entry.'))
            );
        } finally {
            setSubmitting(false);
        }
    };

    /**
     * @param langCode the translation being edited, so a complaint about
     *        another language is not rendered against this input. Null for a
     *        field that is not translatable - a gallery's keys nest deeper
     *        than one segment and must not be filtered.
     */
    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {summary.length > 0 && (
                <div
                    role="alert"
                    className="space-y-1 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-text"
                >
                    {summary.map((message, i) => <div key={i}>{message}</div>)}
                </div>
            )}

            {/* Two columns from `xl`, not from `lg`. The rail already takes
                256px at `lg`, so splitting there left both columns too narrow
                to be worth the split - and a form squeezed into half a laptop
                is worse than one honest column. */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0 space-y-8">
                    <StaticFields
                        fields={staticFields}
                        values={staticValues}
                        onChange={setStaticField}
                        languages={languages}
                        errors={fieldErrors}
                        onError={setSummary}
                    />

                    {staticFields.length > 0 && translatableFields.length > 0 && (
                        <hr className="border-line" />
                    )}

                    <TranslatableFields
                        fields={translatableFields}
                        languages={languages}
                        activeLangId={activeLangId}
                        onLanguageChange={setActiveLangId}
                        translations={translations}
                        onChange={setTranslatedField}
                        errors={fieldErrors}
                        onError={setSummary}
                    />
                </div>

                {/* Sticky, because the form is as long as the Module's schema
                    and the reader should not have to scroll back to the top to
                    publish what they have just written. */}
                <aside className="xl:sticky xl:top-0 xl:self-start">
                    <PublicationPanel
                        status={status}
                        onStatusChange={setStatus}
                        publishedAt={initialData?.published_at}
                        languages={languages}
                        slugs={slugs}
                        onSlugChange={(code, value) => setSlugs((prev) => ({ ...prev, [code]: value }))}
                    />
                </aside>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:opacity-50"
                    >
                        {t('Cancel')}
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {submitting ? t('Saving…') : t('Save entry')}
                </button>
            </div>
        </form>
    );
}