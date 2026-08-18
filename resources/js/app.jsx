import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';
import api from './lib/api';
import Login from './components/Login';
import ModulesList from './components/ModulesList';
import EntriesManager from './components/EntriesManager';
import ModuleBuilder from './components/ModuleBuilder';

export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState({ type: 'list', data: null });

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

    if (loading) return <div className="p-10 text-center">Loading...</div>;
    if (!user) return <Login onLogin={(userData) => setUser(userData)} />;

    return (
        <div>
            <header className="bg-gray-800 text-white p-4 flex justify-between items-center">
                <h1 className="font-bold">Admin Panel</h1>
                <button onClick={handleLogout} className="text-sm bg-red-600 px-3 py-1 rounded">Logout</button>
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
if (rootElement) createRoot(rootElement).render(<App />);