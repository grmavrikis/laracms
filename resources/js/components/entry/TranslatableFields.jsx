import { getLangCode } from '../../lib/languages';
import { languagesWithErrors } from '../../lib/apiErrors';
import { t } from '../../lib/i18n';
import FieldInput from './FieldInput';
import FieldErrors from './FieldErrors';
import FieldLabel, { labelId } from './FieldLabel';
import Badge from '../../ui/Badge';

/**
 * The schema fields that hold a value per language, and the tabs that switch
 * between them.
 *
 * **One language is edited at a time**, which is why the tabs carry a dot.
 * Messages are filed under their own language (#96's sibling fix), so a
 * complaint about French is not rendered under the Greek input - and the dot is
 * then the only thing that keeps a failure on a tab the author cannot see from
 * being silent. `EntryForm` also opens on the first language that failed.
 */
export default function TranslatableFields({
    fields,
    languages,
    activeLangId,
    onLanguageChange,
    translations,
    onChange,
    errors,
    onError,
}) {
    if (fields.length === 0) {
        return null;
    }

    const failedLanguages = languagesWithErrors(errors, languages.map(getLangCode));
    const activeCode = getLangCode(languages.find((l) => l.id === activeLangId));

    // **Not merely cosmetic.** `FieldErrors` reads a null `langCode` as "this
    // field is not translatable, show everything" - so rendering these fields
    // without a resolved language put every language's complaints under every
    // box at once, which is the defect #96 fixed and ARCHITECTURE records: the
    // Greek box marked wrong because the French one was empty.
    if (!activeCode) {
        return (
            <p className="text-sm text-fg-muted">{t('Could not load the languages.')}</p>
        );
    }

    return (
        <div className="space-y-6">
            <div
                role="group"
                aria-label={t('Content language')}
                className="flex w-max gap-0.5 rounded-lg border border-line bg-surface-muted p-1"
            >
                {languages.map((language) => {
                    const failed = failedLanguages.includes(getLangCode(language));
                    const active = activeLangId === language.id;

                    return (
                        <button
                            key={language.id}
                            type="button"
                            onClick={() => onLanguageChange(language.id)}
                            aria-pressed={active}
                            title={failed ? t('This translation has errors') : undefined}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                active
                                    ? 'bg-surface text-accent-text shadow-sm'
                                    : failed
                                        ? 'text-danger-text hover:bg-surface'
                                        : 'text-fg-muted hover:text-fg'
                            }`}
                        >
                            {getLangCode(language).toUpperCase()}
                            {failed && (
                                <>
                                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
                                    {/* The dot is a colour and a shape; this is
                                        what says the same thing to a reader who
                                        has neither. */}
                                    <span className="sr-only">{t('has errors')}</span>
                                </>
                            )}
                        </button>
                    );
                })}
            </div>

            {fields.map((field) => (
                <div key={field.name}>
                    <FieldLabel field={field}>
                        <Badge tone="accent">{activeCode}</Badge>
                    </FieldLabel>
                    <FieldInput
                        field={field}
                        value={translations[activeLangId]?.[field.name]}
                        onChange={(value) => onChange(activeLangId, field.name, value)}
                        languages={languages}
                        onError={onError}
                        labelledBy={labelId(field)}
                    />
                    {/* Only this language's messages - see the note above. */}
                    <FieldErrors errors={errors} fieldName={field.name} langCode={activeCode} />
                </div>
            ))}
        </div>
    );
}
