import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Palette, Check } from 'lucide-react';
import { t } from '../lib/i18n';
import { ACCENTS } from '../lib/theme';
import useTheme from '../hooks/useTheme';

/**
 * Every colour here comes from `app.css` through a variable, and none of it is
 * written twice.
 *
 * A swatch cannot be `var(--accent-solid)`: all six are drawn at once inside
 * one document carrying a single `data-accent`, so that would paint six
 * identical circles in the colour already chosen. `--swatch-<name>` exists for
 * exactly this - declared per palette, re-pointed under dark, and pinned to the
 * step the panel really paints with by `theme.css.test.js`.
 *
 * These were twelve hexes in this file until a review observed that nothing
 * could see them drift from the stylesheet. They had already drifted once.
 */
const swatchVar = (accent) => `var(--swatch-${accent})`;

// Translated names. `t()` is called at render rather than here, so the
// catalogue is read after the server has injected it into the page.
const ACCENT_LABEL = {
    emerald: () => t('Emerald'),
    teal: () => t('Teal'),
    blue: () => t('Blue'),
    violet: () => t('Violet'),
    rose: () => t('Rose'),
    amber: () => t('Amber'),
};

// Referenced by `aria-controls`, so the trigger and the panel it reveals are
// related programmatically rather than only by sitting next to each other.
const PANEL_ID = 'theme-menu-panel';

export default function ThemeMenu() {
    const [{ theme, accent }, setPreference] = useTheme();
    const [open, setOpen] = useState(false);
    const container = useRef(null);

    // A popover has to be closable without the mouse that opened it, and
    // without hitting the trigger again: Escape for the keyboard, a click
    // outside for the pointer. Both are listened for only while it is open.
    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (event) => {
            if (!container.current?.contains(event.target)) setOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onPointerDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [open]);

    return (
        <div className="relative" ref={container}>
            {/* `aria-expanded` plus `aria-controls`, and no `role="dialog"`.
                It carried one, together with `aria-haspopup="true"` - which
                means *menu* - so it announced two different things and was
                neither: focus was never moved inside, and Tab left it for the
                page behind. `title` is not a duplicate of `aria-label` here;
                it is the only thing naming an icon-only button for a sighted
                pointer user, and dropping it left a bare glyph. */}
            <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                aria-controls={PANEL_ID}
                aria-label={t('Appearance')}
                title={t('Appearance')}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-fg-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
            >
                <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>

            {open && (
                <div
                    id={PANEL_ID}
                    role="group"
                    aria-label={t('Appearance')}
                    className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface-raised p-3 shadow-lg"
                >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        {t('Theme')}
                    </p>
                    <div className="mb-4 grid grid-cols-2 gap-1.5">
                        {[
                            { value: 'light', label: t('Light'), Icon: Sun },
                            { value: 'dark', label: t('Dark'), Icon: Moon },
                        ].map(({ value, label, Icon }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setPreference({ theme: value })}
                                aria-pressed={theme === value}
                                className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                    theme === value
                                        ? 'border-accent bg-accent-soft text-accent-soft-fg'
                                        : 'border-line text-fg-muted hover:bg-surface-muted'
                                }`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        {t('Accent colour')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {ACCENTS.map((value) => {
                            // Optional call and fallbacks throughout: `ACCENTS`
                            // is declared in `lib/theme.js` because the inline
                            // script in `admin.blade.php` shares it, so a
                            // seventh palette can be added there without these
                            // maps. Unguarded, that threw inside render - and
                            // with no error boundary anywhere in the tree it
                            // took the whole panel down, not just this menu.
                            // `ThemeMenu.test.jsx` fails first, which is the
                            // part that actually prevents it.
                            //
                            // `||` rather than `??`: `t()` preserves an empty
                            // translation deliberately (see lib/i18n.js), so a
                            // catalogue carrying `"Emerald": ""` would pass
                            // `??` straight through and leave a colour-only
                            // button with no accessible name at all - the one
                            // thing these labels exist to prevent.
                            const label = ACCENT_LABEL[value]?.() || value;
                            const chosen = accent === value;

                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPreference({ accent: value })}
                                    aria-pressed={chosen}
                                    // The name carries the colour, so the
                                    // control is not colour-only: a swatch row
                                    // is unusable to a screen reader and to
                                    // anyone who cannot separate two of these
                                    // hues. The tick does the same for sight.
                                    aria-label={label}
                                    title={label}
                                    style={{ backgroundColor: swatchVar(value) }}
                                    className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                        chosen ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface-raised' : ''
                                    }`}
                                >
                                    {/* The tick sits on the swatch, so it wants
                                        the same foreground the panel puts on an
                                        accent fill. Reading the token means one
                                        decision in one place rather than a
                                        third copy of white-on-light,
                                        near-black-on-dark. */}
                                    {chosen && (
                                        <Check
                                            className="h-4 w-4"
                                            style={{ color: 'var(--ui-accent-fg)' }}
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
