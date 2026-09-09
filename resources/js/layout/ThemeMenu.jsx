import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Palette, Check } from 'lucide-react';
import { t } from '../lib/i18n';
import { ACCENTS } from '../lib/theme';
import useTheme from '../hooks/useTheme';

/**
 * The swatch each accent shows in the menu.
 *
 * A literal rather than `var(--accent-500)`: every swatch is drawn at once,
 * inside one document that has a single `data-accent`, so reading the variable
 * would paint all six the same colour - the one already chosen.
 */
const SWATCH = {
    emerald: '#10b981',
    teal: '#14b8a6',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    rose: '#f43f5e',
    amber: '#f59e0b',
};

// Translated names rather than the keys. `t()` is called at render, not here,
// so the catalogue is read after the server has injected it.
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

    return (
        <div className="relative" ref={container}>
            <button
                type="button"
                onClick={() => setOpen((was) => !was)}
                aria-expanded={open}
                aria-haspopup="true"
                aria-label={t('Appearance')}
                title={t('Appearance')}
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-fg-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
            >
                <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>

            {open && (
                <div
                    role="dialog"
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
                            const label = ACCENT_LABEL[value]();
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
                                    style={{ backgroundColor: SWATCH[value] }}
                                    className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
                                        chosen ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface-raised' : ''
                                    }`}
                                >
                                    {chosen && <Check className="h-4 w-4 text-white drop-shadow" aria-hidden="true" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
