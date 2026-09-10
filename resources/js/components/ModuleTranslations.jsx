// resources/js/components/ModuleTranslations.jsx
import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';

/**
 * A module's name and address in every language (TASKS.md #114).
 *
 * Shared by the create screen and the edit screen deliberately: they ask the
 * same question and post the same shape, and two copies of this block would
 * drift the first time one of them gained a field.
 *
 * **There is no slugify here.** `ModuleBuilder` used to transliterate in the
 * browser and send the result, which meant the stored slug came from a
 * Greek-only character map that disagreed with the backend's `Str::slug` -
 * "Café München" became `cafe-munchen` on the server and `caf-m-nch-n` here.
 * The backend is the authority: leave the address blank and it derives one
 * from **that language's own name**. It transliterates rather than translates,
 * which is why the name is typed per language rather than once.
 *
 * @param {Array<object>} languages every language, published or not
 * @param {object} value            `{ [code]: { name, slug } }`
 * @param {Function} onChange       `(code, key, value) => void`
 */
export default function ModuleTranslations({ languages, value, onChange }) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-fg-muted">
                {t('A section needs a name in each language it should appear in. Leave a language blank and the section simply has no page in it.')}
            </p>

            {languages.map((language) => {
                const code = getLangCode(language);

                return (
                    <div key={language.id ?? code} className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-line p-4">
                        <div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-fg mb-1.5">
                                <span className="inline-flex h-5 min-w-8 items-center justify-center rounded bg-surface-muted px-1.5 text-xs font-bold uppercase text-fg-muted">{code}</span>
                                {t('Module name')}
                                {!language.is_active && (
                                    <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-text">
                                        {t('not published yet')}
                                    </span>
                                )}
                            </label>
                            <input
                                type="text"
                                placeholder={t('e.g. Rooms')}
                                value={value[code]?.name ?? ''}
                                onChange={(e) => onChange(code, 'name', e.target.value)}
                                className="w-full rounded-lg border border-line-strong px-3.5 py-2 text-sm text-fg shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-fg mb-1.5">
                                {t('Address')} <span className="font-normal text-fg-muted">{t('(optional)')}</span>
                            </label>
                            <input
                                type="text"
                                placeholder={t('generated from the name')}
                                value={value[code]?.slug ?? ''}
                                onChange={(e) => onChange(code, 'slug', e.target.value)}
                                className="w-full rounded-lg border border-line-strong px-3.5 py-2 text-sm font-mono text-fg shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                            />
                            <p className="mt-1.5 text-xs text-fg-muted">/{code}/{(value[code]?.slug ?? '') || t('generated from the name')}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * The payload shape `store` and `update` both take.
 *
 * A blank name means "not translated", which is a real state rather than an
 * omission: that language then has no page for this section. A blank address
 * is left out so the server derives it - sending one means "exactly this", and
 * a duplicate is then a 422 rather than a silent rename.
 */
export const translationsPayload = (value) =>
    Object.fromEntries(
        Object.entries(value)
            .map(([code, t]) => [code, { name: (t?.name ?? '').trim(), slug: (t?.slug ?? '').trim() }])
            .filter(([, t]) => t.name !== '')
            .map(([code, t]) => [code, t.slug === '' ? { name: t.name } : t])
    );

/** What the API hands back, turned into what the form holds. */
export const translationsFrom = (slugs = []) =>
    Object.fromEntries((slugs ?? []).map((s) => [s.language_code, { name: s.name, slug: s.slug }]));
