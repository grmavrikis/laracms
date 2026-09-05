// resources/js/components/ModuleBuilder.jsx
import { useState, useRef } from 'react';
import api from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import fieldTypes from '../lib/fieldTypes.json';
import { isGalleryField } from '../lib/gallery';
import { t } from '../lib/i18n';

// Which types exist is the backend's decision, so the values come from the
// generated file rather than being listed again here. Labels are UI wording and
// stay put; a type with no label shown gets its own name capitalised, so adding
// one on the backend surfaces in this form without a second edit.
const TYPE_LABELS = {
    string: t('String'),
    text: t('Text'),
    integer: t('Integer'),
    boolean: t('Boolean'),
    date: t('Date'),
    datetime: t('Datetime'),
    select: t('Select'),
    image: t('Image'),
    gallery: t('Gallery'),
};

const FIELD_TYPES = fieldTypes.supported.map((value) => ({
    value,
    label: TYPE_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1),
}));

// There is deliberately no slugify here. This component used to transliterate
// the name itself and send the result, which meant the stored slug came from a
// Greek-only character map that disagreed with the backend's Str::slug:
// 'Ψυχαγωγία' became psychagogia instead of psikhaghoghia, and 'Café Münchén'
// collapsed to caf-m-nch-n. The backend is the authority - leave the slug field
// empty and it derives one from the name.
const emptyField = () => ({ name: '', type: 'string', translatable: false, required: false, validation: '', options: '' });

export default function ModuleBuilder({ onCreated, onCancel }) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [isSingleton, setIsSingleton] = useState(false);
    const [fields, setFields] = useState([{ _id: 0, ...emptyField() }]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState([]);
    const nextId = useRef(1);

    const addField = () =>
        setFields((prev) => [...prev, { _id: nextId.current++, ...emptyField() }]);

    const removeField = (id) =>
        setFields((prev) => prev.filter((f) => f._id !== id));

    const updateField = (id, key, value) =>
        setFields((prev) => prev.map((f) => {
            if (f._id !== id) return f;

            const next = { ...f, [key]: value };

            // A gallery cannot be translatable: that would store a different
            // set of photographs for each language, when the photographs are
            // one set and only their alt text differs. SchemaRuleBuilder
            // refuses the combination, so the flag is cleared here rather than
            // letting the form assemble a schema the API will reject.
            if (key === 'type' && isGalleryField(next)) next.translatable = false;

            return next;
        }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);
        setSubmitting(true);

        const trimmedSlug = slug.trim();

        const payload = {
            name,
            is_singleton: isSingleton,
            // Omitted when blank, so the backend derives it. Sending one means
            // "I want exactly this", and a duplicate is then a 422 rather than
            // being silently renamed.
            ...(trimmedSlug === '' ? {} : { slug: trimmedSlug }),
            schema: fields.map(({ _id, ...rest }) => ({
                ...rest,
                validation: rest.validation.trim(),
                options: rest.type === 'select'
                    ? (rest.options || '').split(',').map(s => s.trim()).filter(Boolean)
                    : undefined
            })),
        };

        try {
            const { data: body } = await api.post('/modules', payload);
            onCreated?.(body.data);
            setName('');
            setSlug('');
            setIsSingleton(false);
            setFields([{ _id: nextId.current++, ...emptyField() }]);
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
                        <p className="text-sm text-gray-500">{t('Give it a name, a slug and the fields its entries hold.')}</p>
                    </div>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl space-y-1">
                    {errors.map((msg, i) => <div key={i}>{msg}</div>)}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">{t('Module name')}</label>
                    <input
                        type="text"
                        placeholder={t('e.g. Rooms')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                        {t('Slug')} <span className="font-normal text-gray-500">{t('(optional)')}</span>
                    </label>
                    <input
                        type="text"
                        placeholder={t('generated from the name')}
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-mono text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                        {t('Leave blank to let the server build it from the name.')}
                    </p>
                </div>
            </div>

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

            <div className="space-y-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">{t('Fields')}</h3>
                        <p className="text-sm text-gray-500">{t('What each entry in this module holds.')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={addField}
                        className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-all"
                    >
                        + {t('Add field')}
                    </button>
                </div>

                <div className="space-y-3">
                    {fields.map((field) => (
                        <div key={field._id} className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 space-y-3 transition-all hover:border-gray-300">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1 sm:hidden">{t('Field name')}</label>
                                    <input
                                        type="text"
                                        placeholder={t('field_name')}
                                        value={field.name}
                                        onChange={(e) => updateField(field._id, 'name', e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono text-xs"
                                        required
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1 sm:hidden">{t('Type')}</label>
                                    <select
                                        value={field.type}
                                        onChange={(e) => updateField(field._id, 'type', e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    >
                                        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-4">
                                    <label className="block text-xs font-medium text-gray-500 mb-1 sm:hidden">{t('Validation')}</label>
                                    <input
                                        type="text"
                                        placeholder="required|max:60"
                                        value={field.validation}
                                        onChange={(e) => updateField(field._id, 'validation', e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono text-xs"
                                    />
                                </div>
                                <div className="sm:col-span-1 flex items-center justify-center sm:justify-start pt-2 sm:pt-0 gap-3">
                                    <label
                                        className={`flex items-center gap-1.5 text-sm select-none ${isGalleryField(field)
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-gray-700 cursor-pointer'
                                            }`}
                                        title={isGalleryField(field)
                                            ? t('A gallery is one set of images for every language; only the alt text is translated.')
                                            : undefined}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={field.translatable}
                                            disabled={isGalleryField(field)}
                                            onChange={(e) => updateField(field._id, 'translatable', e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                                        />
                                        <span className="text-xs font-medium">{t('Lang')}</span>
                                    </label>
                                    {/* Beats asking someone to type "required" into the
                                        validation box, which no field ever did. */}
                                    <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={field.required}
                                            onChange={(e) => updateField(field._id, 'required', e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-medium">{t('Req')}</span>
                                    </label>
                                </div>
                                <div className="sm:col-span-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => removeField(field._id)}
                                        disabled={fields.length === 1}
                                        className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-gray-400"
                                        title={t('Remove field')}
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {field.type === 'select' && (
                                <div className="pt-2">
                                    <input
                                        type="text"
                                        placeholder={t('Comma separated options (e.g. Option 1, Option 2, Option 3)')}
                                        value={field.options || ''}
                                        onChange={(e) => updateField(field._id, 'options', e.target.value)}
                                        className="w-full rounded-lg border border-indigo-200 bg-indigo-50/30 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

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