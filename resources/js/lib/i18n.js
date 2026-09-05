/**
 * The panel's strings (TASKS.md #96).
 *
 * The catalogue is **injected into the page by the server**, not bundled:
 * `resources/views/admin.blade.php` writes it into `window.miniCms`. That is
 * what makes adding a language a file the owner drops into `lang/` rather than
 * a release — Vite never sees these strings, so nothing has to be rebuilt.
 *
 * `translate` is pure and carries the rule; `t` is it bound to whatever the
 * page was served with. Same semantics as `__()` in PHP, deliberately:
 *
 *   - **the key is the English text**, so an untranslated string reads as
 *     English instead of as `panel.entries.title`, which is what makes
 *     translating a screen at a time possible;
 *   - `:name` placeholders are replaced from the second argument.
 */

/** @type {(messages: Record<string, string>, key: string, replacements?: Record<string, unknown>) => string} */
export const translate = (messages, key, replacements = {}) => {
    // `??`, not `||`: a key deliberately translated to the empty string is a
    // translation, and falling back to the English key would undo it.
    let line = messages?.[key] ?? key;

    // Longest name first, or a short one eats a long one: replacing `:to`
    // before `:total` turns "1–:to of :total" into "1–15 of 15tal". Laravel's
    // `Translator::sortReplacements` does the same, for the same reason.
    const names = Object.keys(replacements).sort((a, b) => b.length - a.length);

    for (const name of names) {
        line = line.split(`:${name}`).join(String(replacements[name]));
    }

    return line;
};

/** What the server put in the page, or nothing outside a browser. */
const panel = (typeof window !== 'undefined' && window.miniCms) || {};

export const locale = panel.locale ?? 'en';

/** Every locale somebody has written a `lang/*.json` for. */
export const locales = panel.locales ?? [];

export const t = (key, replacements) => translate(panel.messages ?? {}, key, replacements);
