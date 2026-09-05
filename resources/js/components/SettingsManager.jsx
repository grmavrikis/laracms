import { useState, useEffect } from 'react';
import api, { uploadImage } from '../lib/api';
import { errorSummary, validationErrors } from '../lib/apiErrors';
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';

/**
 * What the site says about itself (TASKS.md #67).
 *
 * **The form is built from what the server declares.** `GET /api/settings`
 * hands over the schema as well as the values, so adding a field is one edit
 * in `SiteSettings` and none here - the same reason the field types are
 * generated rather than listed twice. The labels arrive **already
 * translated** - the API answers in the reader's language (#96) - so the
 * server owns the wording and nothing here has to know a field name.
 *
 * The whole form is sent on save, because clearing a value has to actually
 * clear it. A merge would make "remove my phone number" impossible.
 */
export default function SettingsManager({ onBack }) {
    const [schema, setSchema] = useState([]);
    const [data, setData] = useState({});
    const [languages, setLanguages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [errors, setErrors] = useState([]);
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        Promise.all([api.get('/settings'), api.get('/languages')])
            .then(([settings, langs]) => {
                setSchema(settings.data.schema);
                setData(settings.data.data ?? {});
                setLanguages(Array.isArray(langs.data) ? langs.data : (langs.data?.data ?? []));
            })
            .catch((err) => {
                console.error(err);
                setErrors(errorSummary(err, t('Could not load the settings.')));
            })
            .finally(() => setLoading(false));
    }, []);

    const setValue = (name, value) => {
        setSaved(false);
        setData((current) => ({ ...current, [name]: value }));
    };

    const setTranslation = (name, code, value) => {
        setSaved(false);
        setData((current) => ({
            ...current,
            [name]: { ...(typeof current[name] === 'object' && current[name] !== null ? current[name] : {}), [code]: value },
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setErrors([]);
        setFieldErrors({});

        try {
            const { data: body } = await api.put('/settings', { data });

            setData(body.data ?? {});
            setSaved(true);
        } catch (err) {
            console.error(err);
            setErrors(errorSummary(err, t('Could not save the settings.')));
            setFieldErrors(validationErrors(err));
        } finally {
            setSaving(false);
        }
    };

    const inputClasses = 'block w-full rounded-lg border border-gray-300 px-3.5 py-2 text-sm text-gray-900 '
        + 'shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

    // Messages are filed under `data.<name>` and, for a translatable field,
    // `data.<name>.<code>` - so a complaint about the English address is
    // shown under the English box rather than under the Greek one (#96, and
    // the lesson in EntryForm).
    const messagesFor = (name) =>
        Object.entries(fieldErrors)
            .filter(([key]) => key === `data.${name}` || key.startsWith(`data.${name}.`))
            .flatMap(([, messages]) => messages);

    const renderField = (field) => {
        const value = data[field.name];

        if (field.type === 'select') {
            return (
                <select
                    value={value ?? ''}
                    onChange={(e) => setValue(field.name, e.target.value || null)}
                    className={inputClasses}
                >
                    <option value="">{t('Not set')}</option>
                    {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>{option.toUpperCase()}</option>
                    ))}
                </select>
            );
        }

        if (field.type === 'image') {
            return (
                <div className="space-y-2">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            try {
                                // The endpoint and its field name live in
                                // lib/api.js, shared with both editors.
                                setValue(field.name, await uploadImage(file));
                            } catch (err) {
                                console.error(err);
                                setErrors(errorSummary(err, t('Could not upload the image.')));
                            }
                        }}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                    {value && (
                        <div className="flex items-center gap-3">
                            <img src={value} alt={t('Preview')} className="h-12 w-auto rounded border border-gray-200" />
                            <button
                                type="button"
                                onClick={() => setValue(field.name, null)}
                                className="text-xs text-gray-500 hover:text-red-600"
                            >
                                {t('Remove image')}
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (field.translatable) {
            const map = (typeof value === 'object' && value !== null) ? value : {};

            return (
                <div className="space-y-2">
                    {languages.map((language) => {
                        const code = getLangCode(language);

                        return (
                            <div key={language.id ?? code} className="flex items-center gap-2">
                                <span className="w-8 shrink-0 text-xs font-semibold uppercase text-gray-500">{code}</span>
                                <input
                                    type="text"
                                    value={map[code] ?? ''}
                                    onChange={(e) => setTranslation(field.name, code, e.target.value)}
                                    className={inputClasses}
                                />
                            </div>
                        );
                    })}
                </div>
            );
        }

        return (
            <input
                type="text"
                value={value ?? ''}
                onChange={(e) => setValue(field.name, e.target.value)}
                className={inputClasses}
            />
        );
    };

    if (loading) {
        return <div className="py-12 text-center text-sm text-gray-500">{t('Loading settings…')}</div>;
    }

    const groups = [...new Set(schema.map((field) => field.group))];

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">{t('Settings')}</h2>
                    <p className="text-sm text-gray-500">{t('What this site says about itself.')}</p>
                </div>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                    >
                        &larr; {t('Back to modules')}
                    </button>
                )}
            </div>

            {errors.length > 0 && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                    {errors.map((message, i) => <div key={i}>{message}</div>)}
                </div>
            )}

            {groups.map((group) => (
                <div key={group} className="space-y-4">
                    <h3 className="text-base font-semibold text-gray-900">
                        {group === 'core' ? t('This installation') : t('Contact details')}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {schema.filter((field) => field.group === group).map((field) => (
                            <div key={field.name}>
                                <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                                    {field.label}
                                </label>
                                {renderField(field)}
                                {messagesFor(field.name).map((message, i) => (
                                    <p key={i} className="mt-1 text-xs text-red-600">{message}</p>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
                {saved && <span className="text-sm text-green-700">{t('Saved.')}</span>}
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                    {saving ? t('Saving…') : t('Save settings')}
                </button>
            </div>
        </form>
    );
}
