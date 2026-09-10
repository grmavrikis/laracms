import { useState } from 'react';
import { LogOut } from 'lucide-react';
import api from '../lib/api';
import { t, locale, locales } from '../lib/i18n';
import { errorSummary } from '../lib/apiErrors';
import ThemeMenu from './ThemeMenu';

export default function Topbar({ user, onLoggedOut }) {
    const [localeError, setLocaleError] = useState(null);

    const handleLogout = async () => {
        await api.post('/logout');
        onLoggedOut();
    };

    return (
        <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-line bg-surface px-4">
            {localeError && (
                <span role="alert" className="text-xs text-danger-text">{localeError}</span>
            )}

            {/* Moved here from the old chrome unchanged (#96). The panel's own
                language is **not** the content languages: the list is the files
                in `lang/`, and a person's choice is theirs rather than the
                site's.

                Reloading is the point rather than a shortcut. The catalogue is
                injected into the document by the server, so a different
                language is a different document - and that is what keeps a new
                locale from needing a rebuild. */}
            {locales.length > 1 && (
                <select
                    value={locale}
                    aria-label={t('Panel language')}
                    onChange={async (event) => {
                        // Without the catch the rejection is silent: no reload,
                        // and React puts the select back to `locale`, so an
                        // expired session looks like a language that simply
                        // will not change.
                        setLocaleError(null);

                        try {
                            await api.put('/user/locale', { locale: event.target.value });
                            window.location.reload();
                        } catch (err) {
                            console.error(err);
                            setLocaleError(errorSummary(err, t('Could not change the language.'))[0]);
                        }
                    }}
                    className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                >
                    {locales.map((code) => (
                        <option key={code} value={code}>{code.toUpperCase()}</option>
                    ))}
                </select>
            )}

            <ThemeMenu />

            <div className="mx-1 h-6 w-px bg-line" aria-hidden="true" />

            {user?.email && (
                <span className="hidden max-w-[18ch] truncate text-sm text-fg-muted sm:inline">
                    {user.email}
                </span>
            )}

            {/* Destructive-adjacent and spatially separated from the rest, but
                not painted red: signing out is ordinary, and a red button in
                the chrome of every screen reads as a warning that never stops. */}
            <button
                type="button"
                onClick={handleLogout}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
            >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t('Logout')}
            </button>
        </header>
    );
}
