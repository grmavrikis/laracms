import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Palette, Check } from 'lucide-react';
import { t } from '../lib/i18n';
import { ACCENTS } from '../lib/theme';
import useTheme from '../hooks/useTheme';

/**
 * The colour each accent actually paints with, per theme.
 *
 * Literals rather than `var(--accent-…)`: all six swatches are drawn at once
 * inside one document that carries a single `data-accent`, so reading the
 * variable would paint every one of them the colour already chosen.
 *
 * **Two maps, because the panel applies two different steps.** Light mode uses
 * each palette's `--accent-solid` - the darkest step that clears 4.5:1 on
 * white, which is 700 for emerald, teal and amber and 600 for the rest - while
 * dark mode uses 400. A single map showed 500 for everything, so the swatch
 * advertised a colour the panel never paints, and the gap was widest for
 * exactly the palettes tuned darkest.
 */
const ACCENT_SWATCH = {
    light: {
        emerald: '#047857',
        teal: '#0f766e',
        blue: '#2563eb',
        violet: '#7c3aed',
        rose: '#e11d48',
        amber: '#b45309',
    },
    dark: {
        emerald: '#34d399',
        teal: '#2dd4bf',
        blue: '#60a5fa',
        violet: '#a78bfa',
        rose: '#fb7185',
        amber: '#fbbf24',
    },
};

// The tick sits on the swatch, so it follows the same rule `--ui-accent-fg`
// does: white on light mode's dark fills, near-black on dark mode's bright ones.
const CHECK_COLOUR = { light: '#ffffff', dark: '#0b1120' };

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

    const swatches = ACCENT_SWATCH[theme] ?? ACCENT_SWATCH.light;

    return (
        <div className="relative" ref={container}>
            {/* `aria-expanded` alone, with the controls sitting next in DOM
                order so the keyboard simply walks into them. This carried
                `role="dialog"` and `aria-haspopup="true"` - which means *menu* -
                so it announced two different things and was neither: focus was
                never moved inside, and Tab left it for the page behind. */}
            <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                aria-label={t('Appearance')}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-fg-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
            >
                <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>

            {open && (
                <div
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
                            const label = ACCENT_LABEL[value]?.() ?? value;
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
                                    style={{ backgroundColor: swatches[value] ?? 'transparent' }}
                                    className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                        chosen ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface-raised' : ''
                                    }`}
                                >
                                    {chosen && (
                                        <Check
                                            className="h-4 w-4"
                                            style={{ color: CHECK_COLOUR[theme] ?? CHECK_COLOUR.light }}
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
