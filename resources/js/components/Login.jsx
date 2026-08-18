import { useState } from 'react';
import api from '../lib/api';
import axios from 'axios'; // We need axios to get the CSRF cookie before login

export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            // 1. Get CSRF Cookie (Required before login with Sanctum)
            await axios.get('/sanctum/csrf-cookie', { baseURL: '/' });

            // 2. Attempt Login
            const { data } = await api.post('/login', { email, password });
            onLogin(data.user);
        } catch (err) {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md w-96">
                <h2 className="text-2xl font-bold mb-6 text-center">Admin Login</h2>
                {error && <p className="text-red-500 mb-4 text-sm text-center">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded px-3 py-2 mt-1" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 mt-1" required />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded mt-4">Login</button>
                </form>
            </div>
        </div>
    );
}