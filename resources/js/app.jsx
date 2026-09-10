import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';
import api from './lib/api';
import { t } from './lib/i18n';
import { loadModules, forgetModules, onModulesChanged } from './lib/moduleStore';
import Login from './components/Login';
import ModulesList from './components/ModulesList';
import EntriesManager from './components/EntriesManager';
import ModuleBuilder from './components/ModuleBuilder';
import ModuleTranslator from './components/ModuleTranslator';
import EnquiriesManager from './components/EnquiriesManager';
import SettingsManager from './components/SettingsManager';
import ErrorBoundary from './components/ErrorBoundary';
import Shell from './layout/Shell';
import { ThemeProvider } from './hooks/useTheme';
import { RouterProvider } from './hooks/useRoute';
import useRoute from './hooks/useRoute';

/**
 * A screen addressed by a module's slug, which is what the URL carries.
 *
 * The components underneath still want the whole row, so it is looked up here.
 * Item 12 of #117 replaces this with `EntriesScreen`, which will own the
 * fetching properly; for now it bridges the router to the components that
 * already work.
 */
function ByModuleSlug({ slug, children }) {
    const [module, setModule] = useState(null);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        let current = true;

        const find = () => {
            loadModules()
                .then((list) => {
                    if (!current) return;

                    const found = list.find((row) => row.slug === slug) ?? null;

                    setModule(found);
                    setMissing(found === null);
                })
                .catch(() => current && setMissing(true));
        };

        find();

        return onModulesChanged(find);
    }, [slug]);

    if (missing) {
        return <p className="text-sm text-fg-muted">{t('That section no longer exists.')}</p>;
    }

    if (!module) {
        return <p className="text-sm text-fg-muted">{t('Loading…')}</p>;
    }

    return children(module);
}

/**
 * Placeholder until item 18 of #117.
 *
 * TODO (#117 item 18): a real dashboard needs counts the API does not expose -
 * there is no endpoint answering how many entries, drafts or enquiries exist.
 * Drawn statically until there is, per this item's rule.
 */
function Placeholder({ title }) {
    return (
        <div className="rounded-xl border border-dashed border-line-strong p-12 text-center">
            <h2 className="text-lg font-semibold text-fg">{title}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t('This screen is not built yet.')}</p>
        </div>
    );
}

function Screen() {
    const [route, navigate] = useRoute();
    const { name, params } = route;

    if (name === 'dashboard') return <Placeholder title={t('Dashboard')} />;
    if (name === 'analytics') return <Placeholder title={t('Analytics')} />;

    if (name === 'enquiries') return <EnquiriesManager onBack={() => navigate('dashboard')} />;
    if (name === 'settings') return <SettingsManager onBack={() => navigate('dashboard')} />;

    if (name === 'modules') {
        return (
            <ModulesList
                onSelectModule={(mod) => navigate('entries', { module: mod.slug })}
                onCreateModule={() => navigate('moduleCreate')}
                onTranslateModule={(mod) => navigate('moduleEdit', { module: mod.slug })}
            />
        );
    }

    if (name === 'moduleCreate') {
        return (
            <ModuleBuilder
                // The rail lists the modules, so one that has just been created
                // has to appear in it without a reload.
                onCreated={() => { forgetModules(); navigate('modules'); }}
                onCancel={() => navigate('modules')}
            />
        );
    }

    if (name === 'moduleEdit') {
        return (
            <ByModuleSlug slug={params.module}>
                {(module) => (
                    <ModuleTranslator
                        module={module}
                        onSaved={() => { forgetModules(); navigate('modules'); }}
                        onCancel={() => navigate('modules')}
                    />
                )}
            </ByModuleSlug>
        );
    }

    // `entryCreate` and `entryEdit` resolve here too. Nothing in the panel
    // produces those addresses yet - `EntriesManager` still owns create and
    // edit as internal state - so they are unreachable except by typing one.
    // Item 12 splits that component and makes them real.
    if (name === 'entries' || name === 'entryCreate' || name === 'entryEdit') {
        return (
            <ByModuleSlug slug={params.module}>
                {(module) => <EntriesManager module={module} onBack={() => navigate('modules')} />}
            </ByModuleSlug>
        );
    }

    return <Placeholder title={t('Dashboard')} />;
}

export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/user')
            .then(({ data }) => setUser(data))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-10 text-center text-fg-muted">{t('Loading…')}</div>;

    if (!user) {
        return <Login onLogin={(userData) => setUser(userData)} />;
    }

    return (
        <Shell
            user={user}
            onLoggedOut={() => {
                // The next person to sign in may not be the same one, and the
                // rail is built from their modules.
                forgetModules();
                setUser(null);
            }}
        >
            <Screen />
        </Shell>
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

    // The boundary is **outside** the providers, so it still renders when one
    // of them is what threw. Inside, a provider failing to mount would take the
    // boundary down with it and produce the blank page it exists to prevent.
    rootElement._adminRoot.render(
        <ErrorBoundary>
            <ThemeProvider>
                <RouterProvider>
                    <App />
                </RouterProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}
