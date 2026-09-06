// resources/js/components/ModuleFields.jsx
import fieldTypes from '../lib/fieldTypes.json';
import { isGalleryField } from '../lib/gallery';
import { t } from '../lib/i18n';

// Which types exist is the backend's decision, so the values come from the
// generated file rather than being listed again here.
const FIELD_TYPES = fieldTypes.supported.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
}));

/**
 * The fields a module's entries hold (TASKS.md #115).
 *
 * Shared by the create and edit screens, with one difference between them:
 * **a field that already exists cannot be renamed, retyped, made translatable
 * or removed.** Those four change the shape of values already stored in
 * `entries.data`, and nothing migrates them - so the API refuses them and this
 * disables them rather than letting somebody fill in a form that will be
 * rejected. Everything else is editable after the fact: adding a field,
 * reordering, `required`, `validation` and a select's options.
 *
 * @param {Array<object>} fields       each with a client-side `_id`
 * @param {Function} onChange          `(id, key, value) => void`
 * @param {Function} onAdd
 * @param {Function} onRemove          `(id) => void`
 * @param {Set<string>} lockedNames    fields that already exist in the database
 */
export default function ModuleFields({ fields, onChange, onAdd, onRemove, lockedNames = new Set() }) {
    const locked = (field) => lockedNames.has(field.name);
    const lockedReason = t('Entries have already been written against this field. Renaming, retyping or removing it needs a migration.');

    return (
            <div className="space-y-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">{t('Fields')}</h3>
                        <p className="text-sm text-gray-500">{t('What each entry in this module holds.')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onAdd}
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
                                        onChange={(e) => onChange(field._id, 'name', e.target.value)}
                                        disabled={locked(field)}
                                        title={locked(field) ? lockedReason : undefined}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                        required
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-medium text-gray-500 mb-1 sm:hidden">{t('Type')}</label>
                                    <select
                                        value={field.type}
                                        onChange={(e) => onChange(field._id, 'type', e.target.value)}
                                        disabled={locked(field)}
                                        title={locked(field) ? lockedReason : undefined}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-100 disabled:text-gray-500"
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
                                        onChange={(e) => onChange(field._id, 'validation', e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono text-xs"
                                    />
                                </div>
                                <div className="sm:col-span-1 flex items-center justify-center sm:justify-start pt-2 sm:pt-0 gap-3">
                                    <label
                                        className={`flex items-center gap-1.5 text-sm select-none ${isGalleryField(field) || locked(field)
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-gray-700 cursor-pointer'
                                            }`}
                                        title={locked(field)
                                            ? lockedReason
                                            : isGalleryField(field)
                                                ? t('A gallery is one set of images for every language; only the alt text is translated.')
                                                : undefined}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={field.translatable}
                                            disabled={isGalleryField(field) || locked(field)}
                                            onChange={(e) => onChange(field._id, 'translatable', e.target.checked)}
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
                                            onChange={(e) => onChange(field._id, 'required', e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-medium">{t('Req')}</span>
                                    </label>
                                </div>
                                <div className="sm:col-span-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => onRemove(field._id)}
                                        disabled={fields.length === 1 || locked(field)}
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
                                        onChange={(e) => onChange(field._id, 'options', e.target.value)}
                                        className="w-full rounded-lg border border-indigo-200 bg-indigo-50/30 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
    );
}
