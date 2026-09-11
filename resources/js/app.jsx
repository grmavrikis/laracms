import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';
import api from './lib/api';
import { t } from './lib/i18n';
import { loadModules, forgetModules, onModulesChanged } from './lib/moduleStore';
import Login from './components/Login';
import ModulesList from './components/ModulesList';
import Dashboard from './screens/Dashboard';
import Analytics from './screens/Analytics';
import EntriesScreen from './screens/EntriesScreen';
import EntryEditScreen from './screens/EntryEditScreen';
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
    // `null` while we do not know yet, which is a different thing from
    // `missing`. Keyed on the slug so a second module cannot inherit the
    // first's answer - without the reset, clicking Rooms then Facilities
    // rendered Rooms' screen under the Facilities address until the lookup
    // resolved, and `EntriesManager` fetched for the wrong module meanwhile.
    const [state, setState] = useState({ slug: null, module: null, failed: false });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let current = true;

        const find = () => {
            loadModules()
                .then((list) => {
                    if (!current) return;

                    setState({
                        slug,
                        module: list.find((row) => row.slug === slug) ?? null,
                        failed: false,
                    });
                })
                // **Not `missing`.** A dropped request is not a deleted
                // section, and telling somebody their Rooms are gone because
                // the wifi blinked is the most alarming thing this panel could
                // say to a person who has just spent an afternoon filling it.
                .catch(() => current && setState({ slug, module: null, failed: true }));
        };

        find();

        const stop = onModulesChanged(find);

        // Both, and the second is the point: returning only `stop` left
        // `current` permanently true, so every guard above it was inert and a
        // resolve after unmount still set state.
        return () => {
            current = false;
            stop();
        };
    }, [slug, attempt]);

    if (state.failed) {
        return (
            <div className="text-sm">
                <p className="text-danger-text">{t('Could not load the modules.')}</p>
                <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className="mt-2 cursor-pointer font-medium text-accent-text underline-offset-2 hover:underline"
                >
                    {t('Try again')}
                </button>
            </div>
        );
    }

    // Answered for *this* slug, and there was nothing.
    if (state.slug === slug && state.module === null) {
        return <p className="text-sm text-fg-muted">{t('That section no longer exists.')}</p>;
    }

    if (state.slug !== slug || !state.module) {
        return <p className="text-sm text-fg-muted">{t('Loading…')}</p>;
    }

    return children(state.module);
}

const entriesScreen = ({ params }) => (
    <ByModuleSlug slug={params.module}>
        {(module) => <EntriesScreen module={module} />}
    </ByModuleSlug>
);

// One screen for both, told apart by whether the address carries an id. The
// route constrains `:entry` to digits, so this parse cannot fail.
const entryFormScreen = ({ params }) => (
    <ByModuleSlug slug={params.module}>
        {(module) => (
            <EntryEditScreen
                module={module}
                entryId={params.entry ? Number(params.entry) : null}
            />
        )}
    </ByModuleSlug>
);

/**
 * Every route name, and what it renders.
 *
 * A lookup rather than a chain of `if`s that ended in a default. That default
 * returned the dashboard placeholder, so a route added to `routes.js` without a
 * screen here rendered something that looked deliberate and was wrong, with
 * nothing in the console. Missing from this object is now a throw, which the
 * error boundary turns into a message - loud is affordable since #117 item 8.
 */
const SCREENS = {
    dashboard: ({ navigate }) => <Dashboard navigate={navigate} />,
    analytics: () => <Analytics />,

    enquiries: ({ navigate }) => <EnquiriesManager onBack={() => navigate('dashboard')} />,
    settings: ({ navigate }) => <SettingsManager onBack={() => navigate('dashboard')} />,

    modules: ({ navigate }) => (
        <ModulesList
            onSelectModule={(mod) => navigate('entries', { module: mod.slug })}
            onCreateModule={() => navigate('moduleCreate')}
            onTranslateModule={(mod) => navigate('moduleEdit', { module: mod.slug })}
        />
    ),

    moduleCreate: ({ navigate }) => (
        <ModuleBuilder
            // The rail lists the modules, so one that has just been created has
            // to appear in it without a reload.
            onCreated={() => { forgetModules(); navigate('modules'); }}
            onCancel={() => navigate('modules')}
        />
    ),

    moduleEdit: ({ params, navigate }) => (
        <ByModuleSlug slug={params.module}>
            {(module) => (
                <ModuleTranslator
                    module={module}
                    onSaved={() => { forgetModules(); navigate('modules'); }}
                    onCancel={() => navigate('modules')}
                />
            )}
        </ByModuleSlug>
    ),

    entries: entriesScreen,
    entryCreate: entryFormScreen,
    entryEdit: entryFormScreen,
};

function Screen() {
    const [route, navigate] = useRoute();
    const render = SCREENS[route.name];

    if (!render) {
        throw new Error(`No screen is mapped to the route "${route.name}".`);
    }

    return render({ params: route.params, navigate });
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

    // The providers wrap the **mount** rather than `App`'s return, and that is
    // load-bearing rather than tidy: `App` leaves early while loading and again
    // when nobody is signed in, so wrapping inside it would put the sign-in
    // screen outside the theme and outside the router. Moving them in looks
    // neater and silently breaks that screen.
    //
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
