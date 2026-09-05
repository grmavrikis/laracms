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

const ucfirst = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @type {(messages: Record<string, string>, key: string, replacements?: Record<string, unknown>) => string} */
export const translate = (messages, key, replacements = {}) => {
    // `??`, not `||`: a key deliberately translated to the empty string is a
    // translation, and falling back to the English key would undo it.
    const line = messages?.[key] ?? key;
    const names = Object.keys(replacements);

    if (names.length === 0) {
        return line;
    }

    // `:name`, `:Name` and `:NAME`, which is what PHP's `makeReplacements`
    // registers - a Greek sentence starting with `:Module` should not read
    // `:Module`.
    const forms = {};

    for (const name of names) {
        const value = String(replacements[name]);

        forms[name] = value;
        forms[ucfirst(name)] = ucfirst(value);
        forms[name.toUpperCase()] = value.toUpperCase();
    }

    // **One pass**, longest name first, exactly as PHP's `strtr` does it.
    // Replacing one name at a time over the accumulating line would rescan
    // what was just inserted, so a value containing `:id` would have it
    // substituted too; and it needs the length order anyway, or `:to` eats
    // the start of `:total`.
    const pattern = new RegExp(
        ':(' + Object.keys(forms).sort((a, b) => b.length - a.length).map(escapeForRegExp).join('|') + ')',
        'g'
    );

    return line.replace(pattern, (match, name) => forms[name]);
};

/** What the server put in the page, or nothing outside a browser. */
const panel = (typeof window !== 'undefined' && window.miniCms) || {};

export const locale = panel.locale ?? 'en';

/** Every locale somebody has written a `lang/*.json` for. */
export const locales = panel.locales ?? [];

export const t = (key, replacements) => translate(panel.messages ?? {}, key, replacements);
