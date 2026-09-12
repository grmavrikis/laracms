import { Plus, Trash2, Lock, Images } from 'lucide-react';
import { isGalleryField } from '../lib/gallery';
import { FIELD_TYPES, fieldTypeLabel } from '../lib/moduleFields';
import { t } from '../lib/i18n';
import { Input, Select, Checkbox, INPUT_LABEL_CLASSES } from '../ui/Input';
import IconButton from '../ui/IconButton';

/** Why a row is fixed, as text on the page rather than only a tooltip. */
const Note = ({ icon: Icon, children }) => (
    <p className="flex items-start gap-1.5 text-xs text-fg-muted">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {children}
    </p>
);

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
 * **A row's own `locked` flag decides**, not its name. Keying that on the
 * name meant a *new* field locked itself the moment somebody typed a name that
 * already existed - the input disabled itself mid-word, and it could then be
 * neither corrected nor removed. Whether a row may change depends on whether
 * it was in the database when this opened, which is a property of the row.
 *
 * **Every control is labelled and every row is named by its position**
 * (#117 item 16). The labels were all `sm:hidden`, so above 640px there was no
 * label at all - four unnamed boxes side by side with no column headings
 * either - and on a telephone, where they did render, they carried no `htmlFor`
 * and the inputs no `id`, so they named nothing there either. `Lang` and `Req`
 * are written out for the same reason: an abbreviation is not a name.
 *
 * @param {Array<object>} fields   rows from `lib/moduleFields`, each with `_id` and `locked`
 * @param {Function} onChange      `(id, key, value) => void`
 * @param {Function} onAdd
 * @param {Function} onRemove      `(id) => void`
 */
export default function ModuleFields({ fields, onChange, onAdd, onRemove }) {
    const lockedReason = t('Entries have already been written against this field. Renaming, retyping or removing it needs a migration.');
    const galleryReason = t('A gallery is one set of images for every language; only the alt text is translated.');

    return (
        <div className="space-y-4 border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-fg">{t('Fields')}</h3>
                    <p className="text-sm text-fg-muted">{t('What each entry in this module holds.')}</p>
                </div>
                <button
                    type="button"
                    onClick={onAdd}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-fg px-3.5 py-2 text-sm font-semibold text-bg transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t('Add field')}
                </button>
            </div>

            <div className="space-y-3">
                {fields.map((field, index) => {
                    const position = index + 1;
                    const locked = !!field.locked;
                    const gallery = isGalleryField(field);
                    const id = (part) => `field-row-${field._id}-${part}`;

                    return (
                        <div
                            key={field._id}
                            role="group"
                            aria-label={t('Field :position', { position })}
                            className="space-y-3 rounded-xl border border-line bg-surface-muted/50 p-4 transition-colors hover:border-line-strong"
                        >
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                                <div className="sm:col-span-4">
                                    <label htmlFor={id('name')} className={INPUT_LABEL_CLASSES}>
                                        {t('Field name')}
                                    </label>
                                    <Input
                                        id={id('name')}
                                        type="text"
                                        placeholder={t('field_name')}
                                        value={field.name}
                                        onChange={(e) => onChange(field._id, 'name', e.target.value)}
                                        disabled={locked}
                                        className="py-1.5 font-mono text-xs"
                                        required
                                    />
                                </div>

                                <div className="sm:col-span-3">
                                    <label htmlFor={id('type')} className={INPUT_LABEL_CLASSES}>
                                        {t('Type')}
                                    </label>
                                    <Select
                                        id={id('type')}
                                        value={field.type}
                                        onChange={(e) => onChange(field._id, 'type', e.target.value)}
                                        disabled={locked}
                                        className="py-1.5 text-sm"
                                    >
                                        {FIELD_TYPES.map((type) => (
                                            <option key={type} value={type}>{fieldTypeLabel(type)}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="sm:col-span-5">
                                    <label htmlFor={id('validation')} className={INPUT_LABEL_CLASSES}>
                                        {t('Validation')}
                                    </label>
                                    <Input
                                        id={id('validation')}
                                        type="text"
                                        placeholder="max:60"
                                        value={field.validation}
                                        onChange={(e) => onChange(field._id, 'validation', e.target.value)}
                                        className="py-1.5 font-mono text-xs"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
                                <label
                                    htmlFor={id('translatable')}
                                    className={`flex select-none items-center gap-2 text-sm ${
                                        gallery || locked ? 'cursor-not-allowed text-fg-muted' : 'cursor-pointer text-fg'
                                    }`}
                                >
                                    <Checkbox
                                        id={id('translatable')}
                                        checked={field.translatable}
                                        disabled={gallery || locked}
                                        onChange={(e) => onChange(field._id, 'translatable', e.target.checked)}
                                    />
                                    {t('Translatable')}
                                </label>

                                {/* Beats asking someone to type "required" into the
                                    validation box, which no field ever did. */}
                                <label
                                    htmlFor={id('required')}
                                    className="flex cursor-pointer select-none items-center gap-2 text-sm text-fg"
                                >
                                    <Checkbox
                                        id={id('required')}
                                        checked={field.required}
                                        onChange={(e) => onChange(field._id, 'required', e.target.checked)}
                                    />
                                    {t('Required')}
                                </label>

                                <IconButton
                                    icon={Trash2}
                                    label={t('Remove field :position', { position })}
                                    onClick={() => onRemove(field._id)}
                                    tone="danger"
                                    disabled={fields.length === 1 || locked}
                                    className="ml-auto h-8 w-8 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                                />
                            </div>

                            {field.type === 'select' && (
                                <div>
                                    <label htmlFor={id('options')} className={INPUT_LABEL_CLASSES}>
                                        {t('Options')}
                                    </label>
                                    <Input
                                        id={id('options')}
                                        type="text"
                                        placeholder={t('Comma separated options (e.g. Option 1, Option 2, Option 3)')}
                                        value={field.options || ''}
                                        onChange={(e) => onChange(field._id, 'options', e.target.value)}
                                        className="py-1.5 text-sm"
                                    />
                                </div>
                            )}

                            {/* On the page, not in a `title`. A disabled control
                                takes no focus and fires no pointer events, so a
                                tooltip on one is reachable by neither keyboard
                                nor hover - the person saw grayed-out boxes and
                                nothing saying why. */}
                            {locked && <Note icon={Lock}>{lockedReason}</Note>}
                            {gallery && !locked && <Note icon={Images}>{galleryReason}</Note>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
