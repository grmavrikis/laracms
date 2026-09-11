import { useState, useEffect } from 'react';
import { Loader2, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import api, { uploadImage } from '../lib/api';
import { errorSummary, validationErrors, messagesNotForFields } from '../lib/apiErrors';
import { getLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { t } from '../lib/i18n';
import { FILE_CLASSES } from '../ui/FileInput';
import { Input, Select, Checkbox, INPUT_LABEL_CLASSES } from '../ui/Input';
import Alert from '../ui/Alert';
import PageHeader from '../ui/PageHeader';

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
 *
 * **Every control is named** (#117 item 17, TASKS.md #121). This file had no
 * `htmlFor` anywhere: the label sat as a *sibling* of the control rather than
 * wrapping it, so the association was never made and every box on the screen
 * was announced as unnamed. The ids are derived from `field.name`, which is the
 * one thing the server guarantees is unique, and `renderField` takes the id it
 * must carry rather than inventing one.
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
            // Per-field messages are rendered beside their inputs, so only
            // what belongs to no field goes in the banner - otherwise a 422
            // says the same thing twice, once at the top and once at the box.
            const refused = validationErrors(err);

            setFieldErrors(refused);
            setErrors(
                Object.keys(refused).length > 0
                    ? messagesNotForFields(refused, schema.map((field) => field.name))
                    : errorSummary(err, t('Could not save the settings.'))
            );
        } finally {
            setSaving(false);
        }
    };

    // Messages are filed under `data.<name>` and, for a translatable field,
    // `data.<name>.<code>` - so a complaint about the English address is
    // shown under the English box rather than under the Greek one (#96, and
    // the lesson in EntryForm).
    const messagesFor = (name) =>
        Object.entries(fieldErrors)
            .filter(([key]) => key === `data.${name}` || key.startsWith(`data.${name}.`))
            .flatMap(([, messages]) => messages);

    /** The id a field's control carries, and its label points at. */
    const controlId = (field) => `setting-${field.name}`;

    /**
     * Whether a `<label for>` can reach this field's control.
     *
     * Only a translatable field cannot be reached: it is one box per language,
     * so there is no single control to point at, and it carries `role="group"`
     * named by the same words instead - what a composite control is supposed to
     * have, and the same rule as `FieldLabel` in the entry form.
     *
     * An **image field is labelable**: the file input is one control, and the
     * preview and its remove button sit beside it rather than inside it.
     */
    const isLabelable = (field) => !field.translatable;

    const renderField = (field) => {
        const value = data[field.name];
        const id = controlId(field);

        if (field.type === 'select') {
            return (
                <Select
                    id={id}
                    value={value ?? ''}
                    onChange={(e) => setValue(field.name, e.target.value || null)}
                >
                    <option value="">{t('Not set')}</option>
                    {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>{option.toUpperCase()}</option>
                    ))}
                </Select>
            );
        }

        // A switch, not a text box. Without this branch a `boolean` field fell
        // through to the plain input at the bottom: the owner saw the word
        // "true" in a text box, and typing into it made the value a string -
        // which Laravel's `boolean` rule refuses for anything but "1" and "0".
        //
        // No second label here. The field's own label above already names it,
        // and it used to repeat `field.label` beside the box - two labels on
        // one control, and the words printed twice.
        if (field.type === 'boolean') {
            return (
                <div className="flex h-10 items-center">
                    <Checkbox
                        id={id}
                        checked={value === true || value === 1 || value === '1'}
                        onChange={(e) => setValue(field.name, e.target.checked)}
                    />
                </div>
            );
        }

        if (field.type === 'image') {
            return (
                <div className="space-y-2">
                    {/* The class string, not the component: the field's own
                        label above already points at this input, and
                        `FileInput` would render a second one. */}
                    <input
                        id={id}
                        type="file"
                        className={FILE_CLASSES}
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
                                // The endpoint refuses by type and by size, and
                                // those reasons are worth showing.
                                setErrors(errorSummary(err, t('Could not upload the image.')));
                            }
                        }}
                    />
                    {value && (
                        <div className="flex items-center gap-3">
                            <img src={value} alt={t('Preview')} className="h-12 w-auto rounded border border-line" />
                            <button
                                type="button"
                                onClick={() => setValue(field.name, null)}
                                className="cursor-pointer rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
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
                        const code = getLangCode(language) ?? '';
                        const perLanguage = `${id}-${code}`;

                        return (
                            <div key={language.id ?? code} className="flex items-center gap-2">
                                <label htmlFor={perLanguage} className={`${INPUT_LABEL_CLASSES} mb-0 w-8 shrink-0`}>
                                    {code}
                                </label>
                                <Input
                                    id={perLanguage}
                                    type="text"
                                    value={map[code] ?? ''}
                                    onChange={(e) => setTranslation(field.name, code, e.target.value)}
                                />
                            </div>
                        );
                    })}
                </div>
            );
        }

        return (
            <Input
                id={id}
                type="text"
                value={value ?? ''}
                onChange={(e) => setValue(field.name, e.target.value)}
            />
        );
    };

    const header = (
        <PageHeader
            icon={SlidersHorizontal}
            title={t('Settings')}
            description={t('What this site says about itself.')}
            actions={onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {t('Back to modules')}
                </button>
            )}
        />
    );

    if (loading) {
        return (
            <div className="space-y-6">
                {header}
                <p className="py-12 text-center text-sm text-fg-muted">{t('Loading settings…')}</p>
            </div>
        );
    }

    const groups = [...new Set(schema.map((field) => field.group))];

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {header}

            <Alert messages={errors} />

            {groups.map((group) => (
                <div key={group} className="space-y-4">
                    <h2 className="text-base font-semibold text-fg">
                        {group === 'core' ? t('This installation') : t('Contact details')}
                    </h2>

                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                        {schema.filter((field) => field.group === group).map((field) => {
                            const labelText = (
                                <span className="mb-1.5 block text-sm font-semibold text-fg">{field.label}</span>
                            );

                            return (
                                <div key={field.name}>
                                    {isLabelable(field) ? (
                                        <label htmlFor={controlId(field)}>{labelText}</label>
                                    ) : (
                                        // Named by the same words, through the
                                        // mechanism a control made of several
                                        // elements is supposed to use.
                                        <div role="group" aria-labelledby={`${controlId(field)}-label`}>
                                            <span id={`${controlId(field)}-label`}>{labelText}</span>
                                            {renderField(field)}
                                        </div>
                                    )}

                                    {isLabelable(field) && renderField(field)}

                                    {messagesFor(field.name).map((message, i) => (
                                        <p key={i} className="mt-1 text-xs text-danger-text">{message}</p>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
                {/* Announced, not a silent green word: the button is at the
                    bottom of a long form and this is the only sign that
                    anything happened. */}
                {saved && (
                    <Alert tone="success" messages={t('Saved.')} className="px-3 py-1.5" />
                )}
                <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {saving ? t('Saving…') : t('Save settings')}
                </button>
            </div>
        </form>
    );
}
