import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';
import api from './lib/api';
import { t, locale, locales } from './lib/i18n';
import { errorSummary } from './lib/apiErrors';
import Login from './components/Login';
import ModulesList from './components/ModulesList';
import EntriesManager from './components/EntriesManager';
import ModuleBuilder from './components/ModuleBuilder';
import EnquiriesManager from './components/EnquiriesManager';

export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState({ type: 'list', data: null });
    const [localeError, setLocaleError] = useState(null);

    useEffect(() => {
        api.get('/user')
            .then(({ data }) => setUser(data))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const handleLogout = async () => {
        await api.post('/logout');
        setUser(null);
        setView({ type: 'list', data: null });
    };

    if (loading) return <div className="p-10 text-center">{t('Loading…')}</div>;
    if (!user) return <Login onLogin={(userData) => setUser(userData)} />;

    return (
        <div>
            <header className="bg-gray-800 text-white p-4 flex justify-between items-center">
                <h1 className="font-bold">{t('Admin Panel')}</h1>
                <div className="flex items-center gap-3">
                    {/* The panel's own language, which is **not** the content
                        languages (TASKS.md #96): the list is the files in
                        `lang/`, and a person's choice is theirs rather than
                        the site's.

                        Reloading is the point rather than a shortcut. The
                        catalogue is injected into the document by the server,
                        so a different language is a different document - and
                        that is what keeps a new locale from needing a
                        rebuild. */}
                    {locales.length > 1 && (
                        <select
                            value={locale}
                            aria-label={t('Panel language')}
                            onChange={async (event) => {
                                // Without the catch the rejection is silent:
                                // no reload, and React puts the select back
                                // to `locale`, so an expired session looks
                                // like a language that simply will not change.
                                setLocaleError(null);

                                try {
                                    await api.put('/user/locale', { locale: event.target.value });
                                    window.location.reload();
                                } catch (err) {
                                    console.error(err);
                                    setLocaleError(errorSummary(err, t('Could not change the language.'))[0]);
                                }
                            }}
                            className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
                        >
                            {locales.map((code) => (
                                <option key={code} value={code}>{code.toUpperCase()}</option>
                            ))}
                        </select>
                    )}
                    {localeError && (
                        <span role="alert" className="text-xs text-red-300">{localeError}</span>
                    )}
                    {/* Enquiries are a domain module: written once in core and
                        reached from the chrome rather than through the module
                        list, which holds content types (TASKS.md #66). */}
                    <button
                        onClick={() => setView({ type: view.type === 'enquiries' ? 'list' : 'enquiries' })}
                        className={`text-sm px-3 py-1 rounded transition-colors ${view.type === 'enquiries'
                            ? 'bg-white text-gray-900'
                            : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        {t('Enquiries')}
                    </button>
                    <button onClick={handleLogout} className="text-sm bg-red-600 px-3 py-1 rounded">{t('Logout')}</button>
                </div>
            </header>

            <main className="p-6">
                {view.type === 'create' && (
                    <ModuleBuilder
                        onCreated={() => setView({ type: 'list' })}
                        onCancel={() => setView({ type: 'list' })}
                    />
                )}
                {view.type === 'entries' && (
                    <EntriesManager module={view.data} onBack={() => setView({ type: 'list' })} />
                )}
                {view.type === 'enquiries' && (
                    <EnquiriesManager onBack={() => setView({ type: 'list' })} />
                )}
                {view.type === 'list' && (
                    <ModulesList
                        onSelectModule={(mod) => setView({ type: 'entries', data: mod })}
                        onCreateModule={() => setView({ type: 'create' })}
                    />
                )}
            </main>
        </div>
    );
}

const rootElement = document.getElementById('admin-root');

if (rootElement) {
    // The root is kept on the element rather than created each time this
    // module runs. Vite re-executes it on every hot update, and `createRoot`
    // on a container that already has one mounts a second root over the first:
    // React warns, and the panel throws away whatever you had typed on each
    // save. Harmless in a production build, where the module runs once - and
    // exactly where it is not harmless is while working on the panel.
    rootElement._adminRoot ??= createRoot(rootElement);
    rootElement._adminRoot.render(<App />);
}