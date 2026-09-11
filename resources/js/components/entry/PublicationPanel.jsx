import { getLangCode } from '../../lib/languages';
import { STATUS_DRAFT, STATUS_PUBLISHED } from '../../lib/entries';
import { t } from '../../lib/i18n';
import { formatDate } from '../../lib/format';
import { Input } from '../../ui/Input';

/**
 * Everything about an entry that is **not** one of its Module's fields.
 *
 * This is the whole rule for what the form's side column holds (#117 item 14,
 * settled with the owner): status, when it first went out, and its address per
 * language. They are the three things that mean the same for **every** Module,
 * which is exactly why they are indexed columns rather than keys inside `data`
 * (ARCHITECTURE §2) - so the column is not a layout preference, it is the same
 * line the database already draws.
 *
 * A schema field never belongs here, however well it would fit: which fields a
 * Module has is the client's decision, and a side column that sometimes held
 * one of them would move under them as they edited the schema.
 */
export default function PublicationPanel({
    status,
    onStatusChange,
    publishedAt,
    languages,
    slugs,
    onSlugChange,
}) {
    return (
        <div className="space-y-6 rounded-xl border border-line bg-surface-muted/50 p-4">
            <div className="space-y-3">
                <div>
                    <h2 className="text-sm font-semibold text-fg">{t('Publication')}</h2>
                    <p className="mt-0.5 text-sm text-fg-muted">
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
                            onClick={() => onStatusChange(option.value)}
                            aria-pressed={status === option.value}
                            className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                status === option.value
                                    ? 'bg-accent text-accent-fg'
                                    : 'border border-line bg-surface text-fg hover:bg-surface-muted'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {publishedAt && (
                    <p className="text-xs text-fg-muted">
                        {t('First published :date', { date: formatDate(publishedAt) })}
                    </p>
                )}
            </div>

            {languages.length > 0 && (
                <div className="space-y-3 border-t border-line pt-4">
                    <div>
                        <h2 className="text-sm font-semibold text-fg">{t('Address')}</h2>
                        <p className="mt-0.5 text-sm text-fg-muted">
                            {t('The last part of the URL, per language. Leave a language empty and it has no page in it.')}
                        </p>
                    </div>

                    {languages.map((language) => {
                        const code = getLangCode(language);

                        return (
                            <div key={language.id}>
                                <label
                                    htmlFor={`slug-${code}`}
                                    className="mb-1 block text-xs font-semibold uppercase text-fg-muted"
                                >
                                    {code}
                                </label>
                                <Input
                                    id={`slug-${code}`}
                                    type="text"
                                    value={slugs[code] ?? ''}
                                    onChange={(e) => onSlugChange(code, e.target.value)}
                                    placeholder={t('thea-sti-thalassa')}
                                    className="font-mono text-xs"
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
