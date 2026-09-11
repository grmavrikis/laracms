import { getLangCode } from '../lib/languages';
import { t } from '../lib/i18n';
import { Input } from '../ui/Input';
import Badge from '../ui/Badge';

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
 * **Each language is a named group and both its boxes are labelled**
 * (#117 item 16). Four languages is eight identical boxes, and the code beside
 * them was a `span` - which associates with nothing, so a reader arriving at
 * one was told neither which language it was nor which of the two.
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
                const id = (part) => `module-${code}-${part}`;
                const slug = value[code]?.slug ?? '';

                return (
                    <div
                        key={language.id ?? code}
                        role="group"
                        aria-label={code.toUpperCase()}
                        className="space-y-3 rounded-xl border border-line p-4 transition-colors hover:border-line-strong"
                    >
                        {/* The language names the group, so it is said once
                            here rather than inside both labels - where it would
                            have become part of each box's accessible name.
                            Every language is offered, published or not, so the
                            client can translate ahead of a launch (#114), which
                            makes saying which ones are not live this screen's
                            job. */}
                        <div className="flex items-center gap-2">
                            <Badge tone="neutral">{code}</Badge>
                            {!language.is_active && (
                                <Badge tone="warning">{t('not published yet')}</Badge>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor={id('name')} className="mb-1.5 block text-sm font-semibold text-fg">
                                    {t('Module name')}
                                </label>
                                <Input
                                    id={id('name')}
                                    type="text"
                                    placeholder={t('e.g. Rooms')}
                                    value={value[code]?.name ?? ''}
                                    onChange={(e) => onChange(code, 'name', e.target.value)}
                                />
                            </div>

                            <div>
                                <label htmlFor={id('slug')} className="mb-1.5 block text-sm font-semibold text-fg">
                                    {t('Address')}{' '}
                                    <span className="font-normal text-fg-muted">{t('(optional)')}</span>
                                </label>
                                <Input
                                    id={id('slug')}
                                    type="text"
                                    placeholder={t('generated from the name')}
                                    value={slug}
                                    onChange={(e) => onChange(code, 'slug', e.target.value)}
                                    className="font-mono text-sm"
                                />
                                {/* What the visitor will actually see, rather than
                                    asking somebody to imagine it. */}
                                <p className="mt-1.5 font-mono text-xs text-fg-muted">
                                    {`/${code}/${slug || t('generated from the name')}`}
                                </p>
                            </div>
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
            .map(([code, entry]) => [code, { name: (entry?.name ?? '').trim(), slug: (entry?.slug ?? '').trim() }])
            .filter(([, entry]) => entry.name !== '')
            .map(([code, entry]) => [code, entry.slug === '' ? { name: entry.name } : entry])
    );

/** What the API hands back, turned into what the form holds. */
export const translationsFrom = (slugs = []) =>
    Object.fromEntries((slugs ?? []).map((s) => [s.language_code, { name: s.name, slug: s.slug }]));
