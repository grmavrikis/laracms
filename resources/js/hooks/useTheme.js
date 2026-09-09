import { useState, useEffect, useCallback } from 'react';
import { readPreference, writePreference, applyPreference } from '../lib/theme';

/**
 * The panel's appearance as state, kept in step with the DOM and with storage.
 *
 * The initial value is read from storage rather than defaulted, because the
 * inline script in `admin.blade.php` has already applied it to <html> - React
 * starting from a different assumption would repaint the page on mount, which
 * is the flash that script exists to prevent.
 *
 * `patch` is partial on purpose: the two axes are independent, so
 * `setPreference({ theme: 'dark' })` must leave the chosen accent alone.
 */
export default function useTheme() {
    // The initialiser is passed as a function, not called: `useState(read())`
    // would hit localStorage on every render rather than only the first.
    const [preference, setPreference] = useState(readPreference);

    // Applying and storing live in an effect rather than inside the updater
    // because an updater has to be pure - React invokes it twice under
    // StrictMode, and a write to the DOM from there runs twice with it.
    useEffect(() => {
        applyPreference(preference);
        writePreference(preference);
    }, [preference]);

    const update = useCallback((patch) => {
        setPreference((current) => ({ ...current, ...patch }));
    }, []);

    return [preference, update];
}
