import { useState, useEffect } from 'react';
import api, { uploadImage } from '../lib/api';
import { errorSummary, validationErrors } from '../lib/apiErrors';
import { getLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { t } from '../lib/i18n';
import { FILE_CLASSES } from '../ui/FileInput';

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
        Promise.all([api.get('/settings'), loadLanguages()])
            .then(([settings, langs]) => {
                setSchema(settings.data.schema);
                setData(settings.data.data ?? {});
                setLanguages(langs);
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

    const inputClasses = 'block w-full rounded-lg border border-line-strong px-3.5 py-2 text-sm text-fg '
        + 'shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

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

        // A switch, not a text box. Without this branch a `boolean` field fell
        // through to the plain input at the bottom: the owner saw the word
        // "true" in a text box, and typing into it made the value a string -
        // which Laravel's `boolean` rule refuses for anything but "1" and "0".
        if (field.type === 'boolean') {
            return (
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={value === true || value === 1 || value === '1'}
                        onChange={(e) => setValue(field.name, e.target.checked)}
                        className="h-4 w-4 rounded border-line-strong text-accent-text focus:ring-accent"
                    />
                    <span className="text-sm text-fg-muted">{field.label}</span>
                </label>
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
                        className={FILE_CLASSES}
                    />
                    {value && (
                        <div className="flex items-center gap-3">
                            <img src={value} alt={t('Preview')} className="h-12 w-auto rounded border border-line" />
                            <button
                                type="button"
                                onClick={() => setValue(field.name, null)}
                                className="text-xs text-fg-muted hover:text-danger-text"
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
                                <span className="w-8 shrink-0 text-xs font-semibold uppercase text-fg-muted">{code}</span>
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
        return <div className="py-12 text-center text-sm text-fg-muted">{t('Loading settings…')}</div>;
    }

    const groups = [...new Set(schema.map((field) => field.group))];

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-5 gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-fg">{t('Settings')}</h2>
                    <p className="text-sm text-fg-muted">{t('What this site says about itself.')}</p>
                </div>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center justify-center rounded-lg bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm ring-1 ring-inset ring-line-strong hover:bg-surface-muted transition-all"
                    >
                        &larr; {t('Back to modules')}
                    </button>
                )}
            </div>

            {errors.length > 0 && (
                <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger-text ring-1 ring-inset ring-danger/30">
                    {errors.map((message, i) => <div key={i}>{message}</div>)}
                </div>
            )}

            {groups.map((group) => (
                <div key={group} className="space-y-4">
                    <h3 className="text-base font-semibold text-fg">
                        {group === 'core' ? t('This installation') : t('Contact details')}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {schema.filter((field) => field.group === group).map((field) => (
                            <div key={field.name}>
                                <label className="block text-sm font-semibold text-fg mb-1.5">
                                    {field.label}
                                </label>
                                {renderField(field)}
                                {messagesFor(field.name).map((message, i) => (
                                    <p key={i} className="mt-1 text-xs text-danger-text">{message}</p>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
                {saved && <span className="text-sm text-success-text">{t('Saved.')}</span>}
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:bg-accent-hover disabled:opacity-50 transition-all"
                >
                    {saving ? t('Saving…') : t('Save settings')}
                </button>
            </div>
        </form>
    );
}
