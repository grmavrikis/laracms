// resources/js/components/EntryForm.jsx
import { useState } from 'react';
import api, { uploadImage } from '../lib/api';
import RichTextEditor from './RichTextEditor';
import GalleryEditor from './GalleryEditor';
import { isRichTextField, emptyDoc } from '../lib/richText';
import { isGalleryField, emptyGallery, fromStored } from '../lib/gallery';
import { validationErrors, errorSummary, messagesForField, messagesNotForFields, languagesWithErrors } from '../lib/apiErrors';
import { getLangCode, contentLangCode } from '../lib/languages';
import { STATUS_DRAFT, STATUS_PUBLISHED, slugsToMap, entryPayload } from '../lib/entries';
import { t, locale } from '../lib/i18n';
import { formatDate } from '../lib/format';

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
    const failedLanguages = languagesWithErrors(fieldErrors, languages.map(getLangCode));

    const fieldErrorList = (field, langCode = null) => {
        const messages = messagesForField(fieldErrors, field.name, langCode);

        if (messages.length === 0) {
            return null;
        }

        return (
            <ul className="mt-1.5 space-y-0.5 text-xs text-danger-text">
                {messages.map((message, i) => <li key={i}>{message}</li>)}
            </ul>
        );
    };

    const inputClasses = "block w-full rounded-md border-0 py-2 px-3 text-fg shadow-sm ring-1 ring-inset ring-line-strong placeholder:text-fg-subtle focus:ring-2 focus:ring-inset focus:ring-accent sm:text-sm transition-all duration-200 outline-none bg-surface";

    const renderInput = (field, value, onChange) => {
        if (isRichTextField(field)) {
            return (
                <div className="mt-2 rounded-md shadow-sm ring-1 ring-inset ring-line-strong focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent transition-all duration-200 overflow-hidden bg-surface">
                    <RichTextEditor
                        value={value}
                        onChange={(content) => onChange(content)}
                    />
                </div>
            );
        }

        if (isGalleryField(field)) {
            return (
                <GalleryEditor
                    value={value}
                    onChange={onChange}
                    languages={languages}
                    onError={setSummary}
                />
            );
        }

        if (field.type === 'boolean') {
            return (
                <div className="mt-2 flex items-center h-10">
                    <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                        className="h-5 w-5 rounded border-line-strong text-accent-text focus:ring-accent transition-all cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-fg cursor-default">{t('Enable this field')}</span>
                </div>
            );
        }

        if (field.type === 'date') {
            return (
                <div className="mt-2">
                    <input
                        type="date"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClasses}
                    />
                </div>
            );
        }

        if (field.type === 'select') {
            const options = Array.isArray(field.options) ? field.options : [];
            return (
                <div className="mt-2">
                    <select
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClasses}
                    >
                        <option value="">-- Select Option --</option>
                        {options.map((opt, idx) => {
                            const val = typeof opt === 'object' ? opt.value : opt;
                            const label = typeof opt === 'object' ? opt.label : opt;
                            return <option key={idx} value={val}>{label}</option>;
                        })}
                    </select>
                </div>
            );
        }

        if (field.type === 'image') {
            const handleFileChange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    // The endpoint, its field name and the multipart header
                    // live in lib/api.js, shared with the gallery editor.
                    onChange(await uploadImage(file));
                } catch (err) {
                    console.error('Upload Error:', err);
                    // The upload endpoint rejects by type and size, and those
                    // reasons are worth showing rather than replacing with
                    // "failed".
                    setSummary(errorSummary(err, t('Could not upload the image.')));
                }
            };

            return (
                <div className="mt-2 space-y-3">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-fg-muted file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent-soft file:text-accent-text hover:file:bg-accent-soft cursor-pointer transition-all"
                    />
                    {value && (
                        <div className="relative w-32 h-32 rounded-lg border border-line overflow-hidden bg-surface-muted flex items-center justify-center shadow-sm">
                            <img
                                src={value}
                                alt={t('Preview')}
                                className="object-cover w-full h-full"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                className="absolute top-1 right-1 bg-danger/80 hover:bg-danger text-danger-fg rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
                                title={t('Remove image')}
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="mt-2">
                <input
                    type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputClasses}
                    placeholder={`Enter ${field.name.toLowerCase()}...`}
                />
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm md:col-span-2">
            <div className="px-6 py-8">
                {summary.length > 0 && (
                    <div className="mb-8 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-text space-y-1">
                        {summary.map((message, i) => <div key={i}>{message}</div>)}
                    </div>
                )}

                <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                    {staticFields.map((field) => (
                        <div key={field.name} className="sm:col-span-full">
                            <label className="block text-sm font-semibold text-fg capitalize">
                                {field.name}
                            </label>
                            {renderInput(field, staticValues[field.name], (v) => setStaticField(field.name, v))}
                            {fieldErrorList(field)}
                        </div>
                    ))}
                </div>

                {translatableFields.length > 0 && (
                    <div className="mt-10 pt-8 border-t border-line">
                        <div className="flex p-1 mb-8 space-x-1 bg-surface-muted/80 rounded-lg w-max border border-line/50">
                            {languages.map((l) => {
                                // A tab carries a dot when that translation
                                // failed. Messages are filed under their own
                                // language now, so this is what keeps one on a
                                // tab the author cannot see from being silent.
                                const failed = failedLanguages.includes(getLangCode(l));

                                return (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => setActiveLangId(l.id)}
                                        title={failed ? t('This translation has errors') : undefined}
                                        className={`flex items-center gap-1.5 px-5 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${activeLangId === l.id
                                            ? 'bg-surface text-accent-text shadow-sm'
                                            : failed
                                                ? 'text-danger-text hover:bg-surface-muted/50'
                                                : 'text-fg-muted hover:text-fg hover:bg-surface-muted/50'
                                            }`}
                                    >
                                        {getLangCode(l).toUpperCase()}
                                        {failed && (
                                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
                                        )}
                                        {failed && <span className="sr-only">has errors</span>}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                            {translatableFields.map((field) => (
                                <div key={field.name} className="sm:col-span-full">
                                    <label className="flex items-center text-sm font-semibold text-fg capitalize">
                                        {field.name}
                                        <span className="ml-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">
                                            {getLangCode(languages.find(l => l.id === activeLangId))}
                                        </span>
                                    </label>
                                    {renderInput(field, translations[activeLangId]?.[field.name], (v) => setTranslatedField(activeLangId, field.name, v))}
                                    {/* Only this language's messages. They used
                                        to be shown for every language at once so
                                        an error on a hidden tab was not silent -
                                        which marked the Greek box wrong because
                                        the French one was empty. The tabs above
                                        carry that job now, and the form opens on
                                        the language that failed. */}
                                    {fieldErrorList(field, getLangCode(languages.find((l) => l.id === activeLangId)))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-10 pt-8 border-t border-line space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-fg">{t('Publication')}</h3>
                        <p className="text-sm text-fg-muted">
                            {t('A draft is saved but never shown on the site.')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {[
                            { value: STATUS_DRAFT, label: t('Draft') },
                            { value: STATUS_PUBLISHED, label: t('Published') },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setStatus(option.value)}
                                aria-pressed={status === option.value}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${status === option.value
                                    ? 'bg-accent text-accent-fg shadow-sm'
                                    : 'bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-muted'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}

                        {initialData?.published_at && (
                            <span className="ml-2 text-xs text-fg-muted">
                                {/* Both halves were wrong: the label was a bare
                                    English string outside `t()`, so no test
                                    demanded it and a Greek reader saw English,
                                    and the date asked the browser rather than
                                    the panel for its language. */}
                                {t('First published :date', { date: formatDate(initialData.published_at) })}
                            </span>
                        )}
                    </div>

                    {languages.length > 0 && (
                        <div className="space-y-2">
                            <div>
                                <h3 className="text-sm font-semibold text-fg">{t('Address')}</h3>
                                <p className="text-sm text-fg-muted">
                                    {t('The last part of the URL, per language. Leave a language empty and it has no page in it.')}
                                </p>
                            </div>

                            {languages.map((language) => {
                                const code = getLangCode(language);

                                return (
                                    <div key={language.id} className="flex items-center gap-2">
                                        <span className="w-8 shrink-0 text-xs font-semibold uppercase text-fg-muted">
                                            {code}
                                        </span>
                                        <input
                                            type="text"
                                            value={slugs[code] ?? ''}
                                            onChange={(e) => setSlugs((prev) => ({ ...prev, [code]: e.target.value }))}
                                            placeholder={t('thea-sti-thalassa')}
                                            className={`${inputClasses} font-mono text-xs`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-x-4 border-t border-line bg-surface-muted px-6 py-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        className="rounded-md px-4 py-2 text-sm font-medium text-fg hover:bg-surface-muted transition-colors focus:outline-none focus:ring-2 focus:ring-line-strong disabled:opacity-50"
                    >
                        {t('Cancel')}
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:bg-accent-hover transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-accent-fg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('Saving…')}
                        </>
                    ) : (
                        t('Save entry')
                    )}
                </button>
            </div>
        </form>
    );
}