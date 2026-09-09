/**
 * The panel's appearance: which theme, and which accent (#117).
 *
 * **Two axes, not one list.** Light/dark and the accent colour are independent,
 * so changing one never resets the other. Six accents times two themes as a
 * single list of twelve would drift apart the first time one of them was
 * touched; as two attributes on <html> it is one small block of CSS each.
 *
 * The values are attributes rather than classes because `dark` as a class is
 * the name Tailwind's own variant wants, and #62's public theme is going to
 * live in the same stylesheet (`app.css` still `@source`s `site/theme`).
 *
 * **This file has a second half that is not in this file.** The inline script
 * in `resources/views/admin.blade.php` reads the same two keys and writes the
 * same two attributes, before the bundle exists - which is what stops a white
 * flash on every navigation for a dark-mode reader. The duplication is the
 * point, so `theme.test.js` pins the keys and the allowed values as a contract
 * and names the template to edit when it fails.
 */

export const THEMES = ['light', 'dark'];

/** Emerald is first because it is the default, and the design was drawn in it. */
export const ACCENTS = ['emerald', 'teal', 'blue', 'violet', 'rose', 'amber'];

export const STORAGE_KEYS = {
    theme: 'miniCms.theme',
    accent: 'miniCms.accent',
};

/**
 * A stored theme, or the operating system's when there is none.
 *
 * The system preference is a *fallback*, never an override: once somebody has
 * chosen, their choice wins in both directions. Letting the media query win
 * afterwards makes the switch look broken to anyone whose machine disagrees.
 */
export const resolveTheme = (stored, prefersDark = false) =>
    THEMES.includes(stored) ? stored : (prefersDark ? 'dark' : 'light');

export const resolveAccent = (stored) =>
    ACCENTS.includes(stored) ? stored : ACCENTS[0];

/**
 * Whether the machine asks for dark.
 *
 * Guarded because jsdom has no `matchMedia` at all, and neither do the older
 * embedded browsers a client might open the panel in.
 */
const prefersDark = () =>
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * A partial preference with every key it carries resolved, and none it does not.
 *
 * Partial matters: the two axes are independent, so `{ accent: 'rose' }` has to
 * stay a statement about the accent alone. Filling the theme in here would make
 * every colour change also record whichever theme the machine happened to be
 * in, which is the defect this module's callers exist to avoid.
 */
export const resolvePreference = (patch) => {
    const resolved = {};

    if (patch?.theme !== undefined) resolved.theme = resolveTheme(patch.theme, prefersDark());
    if (patch?.accent !== undefined) resolved.accent = resolveAccent(patch.accent);

    return resolved;
};

/**
 * What is stored, already resolved - so nothing unvalidated leaves this module.
 *
 * Every access is guarded: a browser set to block site data *throws* here
 * rather than answering null, and this runs before the panel has rendered
 * anything, so an unguarded read is a blank screen rather than a lost colour.
 */
export const readPreference = () => {
    let theme = null;
    let accent = null;

    try {
        theme = localStorage.getItem(STORAGE_KEYS.theme);
        accent = localStorage.getItem(STORAGE_KEYS.accent);
    } catch (e) {
        // Storage is unavailable. The defaults below are the whole recovery.
    }

    return {
        theme: resolveTheme(theme, prefersDark()),
        accent: resolveAccent(accent),
    };
};

/**
 * TODO (#117): this belongs in `users.theme` / `users.accent` beside
 * `users.locale`, so a choice follows the person to their second machine
 * rather than to their second tab. It is localStorage today because that pass
 * added no migrations.
 */
export const writePreference = ({ theme, accent }) => {
    try {
        if (theme !== undefined) localStorage.setItem(STORAGE_KEYS.theme, resolveTheme(theme, prefersDark()));
        if (accent !== undefined) localStorage.setItem(STORAGE_KEYS.accent, resolveAccent(accent));
    } catch (e) {
        // Not being able to remember the choice is not a reason to refuse it:
        // the attributes are still applied, so it holds for this page.
    }
};

/** Resolves before it writes, so the DOM only ever carries a known value. */
export const applyPreference = ({ theme, accent }) => {
    const root = document.documentElement;

    if (theme !== undefined) root.setAttribute('data-theme', resolveTheme(theme, prefersDark()));
    if (accent !== undefined) root.setAttribute('data-accent', resolveAccent(accent));
};
