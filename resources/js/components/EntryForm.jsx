// resources/js/components/EntryForm.jsx
import { useState } from 'react';
import api, { uploadImage } from '../lib/api';
import RichTextEditor from './RichTextEditor';
import GalleryEditor from './GalleryEditor';
import { isRichTextField, emptyDoc } from '../lib/richText';
import { isGalleryField, emptyGallery, fromStored } from '../lib/gallery';
import { validationErrors, errorSummary, messagesForField, messagesNotForFields } from '../lib/apiErrors';
import { getLangCode, defaultLanguage } from '../lib/languages';

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

    // Opens on the language flagged is_default, matching the entries table.
    const [activeLangId, setActiveLangId] = useState(defaultLanguage(languages)?.id ?? null);
    const [submitting, setSubmitting] = useState(false);

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

        const payload = { data: payloadData };

        try {
            const url = isEdit ? `/modules/${moduleSlug}/entries/${initialData.id}` : `/modules/${moduleSlug}/entries`;
            const method = isEdit ? 'put' : 'post';
            await api[method](url, payload);
            onSaved?.();
        } catch (err) {
            console.error('API Error:', err);

            const errors = validationErrors(err);
            setFieldErrors(errors);

            // On a 422 the per-field messages are rendered beside their inputs,
            // so only what belongs to no field goes in the banner. Anything
            // else has no field to attach to and goes there in full.
            setSummary(
                Object.keys(errors).length > 0
                    ? messagesNotForFields(errors, schema.map((f) => f.name))
                    : errorSummary(err, 'Failed to save the entry.')
            );
        } finally {
            setSubmitting(false);
        }
    };

    const fieldErrorList = (field) => {
        const messages = messagesForField(fieldErrors, field.name);

        if (messages.length === 0) {
            return null;
        }

        return (
            <ul className="mt-1.5 space-y-0.5 text-xs text-red-600">
                {messages.map((message, i) => <li key={i}>{message}</li>)}
            </ul>
        );
    };

    const inputClasses = "block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm transition-all duration-200 outline-none bg-white";

    const renderInput = (field, value, onChange) => {
        if (isRichTextField(field)) {
            return (
                <div className="mt-2 rounded-md shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600 transition-all duration-200 overflow-hidden bg-white">
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
                        className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 transition-all cursor-pointer"
                    />
                    <span className="ml-3 text-sm text-gray-700 cursor-default">Enable this field</span>
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
                    setSummary(errorSummary(err, 'Failed to upload the image.'));
                }
            };

            return (
                <div className="mt-2 space-y-3">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-150 cursor-pointer transition-all"
                    />
                    {value && (
                        <div className="relative w-32 h-32 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shadow-sm">
                            <img
                                src={value}
                                alt="Preview"
                                className="object-cover w-full h-full"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <button
                                type="button"
                                onClick={() => onChange('')}
                                className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
                                title="Remove image"
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
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:col-span-2">
            <div className="px-6 py-8">
                {summary.length > 0 && (
                    <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 space-y-1">
                        {summary.map((message, i) => <div key={i}>{message}</div>)}
                    </div>
                )}

                <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                    {staticFields.map((field) => (
                        <div key={field.name} className="sm:col-span-full">
                            <label className="block text-sm font-semibold text-gray-900 capitalize">
                                {field.name}
                            </label>
                            {renderInput(field, staticValues[field.name], (v) => setStaticField(field.name, v))}
                            {fieldErrorList(field)}
                        </div>
                    ))}
                </div>

                {translatableFields.length > 0 && (
                    <div className="mt-10 pt-8 border-t border-gray-100">
                        <div className="flex p-1 mb-8 space-x-1 bg-gray-100/80 rounded-lg w-max border border-gray-200/50">
                            {languages.map((l) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => setActiveLangId(l.id)}
                                    className={`px-5 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${activeLangId === l.id
                                        ? 'bg-white text-indigo-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                                        }`}
                                >
                                    {getLangCode(l).toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                            {translatableFields.map((field) => (
                                <div key={field.name} className="sm:col-span-full">
                                    <label className="flex items-center text-sm font-semibold text-gray-900 capitalize">
                                        {field.name}
                                        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                            {getLangCode(languages.find(l => l.id === activeLangId))}
                                        </span>
                                    </label>
                                    {renderInput(field, translations[activeLangId]?.[field.name], (v) => setTranslatedField(activeLangId, field.name, v))}
                                    {/* Messages for every language, not just the
                                        visible tab - otherwise an error on a tab
                                        the user is not looking at is invisible. */}
                                    {fieldErrorList(field)}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-x-4 border-t border-gray-100 bg-gray-50 px-6 py-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                        </>
                    ) : (
                        'Save Entry'
                    )}
                </button>
            </div>
        </form>
    );
}