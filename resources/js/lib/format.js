import { locale } from './i18n';

/**
 * Dates, in the language the panel is being read in.
 *
 * Every call site used `toLocaleDateString()` with no argument, which asks the
 * *browser* what language it is in - so a Greek owner running an English
 * Windows read `9/10/2026` on a panel that was Greek in every other respect,
 * and could not tell September from October. The panel already knows which
 * language it is in; that is what `window.miniCms.locale` is for.
 *
 * Returns `null` rather than "Invalid Date" for anything it cannot read, so a
 * caller can decide what an absent date looks like - usually a dash.
 */
export const formatDate = (value, options = { dateStyle: 'medium' }) => {
    if (value === null || value === undefined || value === '') return null;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return null;

    try {
        return new Intl.DateTimeFormat(locale || undefined, options).format(date);
    } catch (e) {
        // An unknown locale throws `RangeError`, and `locale` comes from a file
        // somebody dropped into `lang/` - so a typo in a filename must not take
        // a table down with it. The browser's own default is a worse answer
        // than the right one and a better answer than a blank screen.
        return new Intl.DateTimeFormat(undefined, options).format(date);
    }
};

/** A date and a time, for a record of when something arrived. */
export const formatDateTime = (value) =>
    formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });
