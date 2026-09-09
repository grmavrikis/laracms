import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { readPreference, writePreference, applyPreference } from '../lib/theme';

const ThemeContext = createContext(null);

/**
 * The panel's appearance - which theme, and which accent (#117).
 *
 * **One provider, not one copy per component.** The state used to live inside
 * the hook, which was correct only while exactly one thing called it: a second
 * mounted switcher - the narrow-viewport copy a sidebar usually needs - would
 * have held its own `useState`, so choosing Dark in one left the other's tick
 * and `aria-pressed` pointing at the old value, and that stale copy's next
 * click would spread `{...current, ...patch}` over the change the first had
 * made.
 */
export function ThemeProvider({ children }) {
    // The initialiser is passed as a function, not called: `useState(read())`
    // would hit localStorage on every render rather than only the first. The
    // value comes from storage rather than a default because the inline script
    // in `admin.blade.php` has already applied it to <html>, and starting from
    // a different assumption would repaint on mount - the very flash that
    // script exists to prevent.
    const [preference, setPreference] = useState(readPreference);

    // Applying is safe to repeat and belongs here; **storing does not**.
    useEffect(() => {
        applyPreference(preference);
    }, [preference]);

    const update = useCallback((patch) => {
        // Written from the patch rather than from the merged result, and this
        // is the whole point. `readPreference` fills a missing theme in from
        // `prefers-color-scheme`, so storing the *merged* value on any change
        // would record the machine's current setting as though somebody had
        // picked it - and `resolveTheme` puts a stored value ahead of the media
        // query. Changing only the accent would therefore have frozen the theme
        // as well, and the panel would stop following the system for ever.
        // `writePreference` skips whichever key is absent, so a patch stores
        // exactly the axis that was actually chosen.
        writePreference(patch);
        setPreference((current) => ({ ...current, ...patch }));
    }, []);

    return (
        <ThemeContext.Provider value={[preference, update]}>
            {children}
        </ThemeContext.Provider>
    );
}

export default function useTheme() {
    const value = useContext(ThemeContext);

    // Loud rather than silent. Without a provider the old code simply made a
    // private copy, which worked until something rendered two of them and then
    // failed as a colour that would not stay changed - the hardest possible
    // shape of bug to attribute.
    if (value === null) {
        throw new Error('useTheme must be used inside a <ThemeProvider>.');
    }

    return value;
}
