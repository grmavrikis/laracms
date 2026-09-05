import { useState } from 'react';
import { signIn } from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { t } from '../lib/i18n';

export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState([]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);

        try {
            // The CSRF-cookie-then-credentials dance lives in lib/api.js.
            onLogin(await signIn(email, password));
        } catch (err) {
            console.error('Login Error:', err);

            // Every failure here used to read "Invalid credentials", including
            // the csrf-cookie request above failing outright - so a server that
            // was down looked like a typo in the password. On this form a 401
            // really is bad credentials, which the default wording would
            // otherwise report as an expired session.
            setErrors(errorSummary(err, t('Could not sign you in.'), {
                401: t('Wrong email or password.'),
            }));
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md w-96">
                <h2 className="text-2xl font-bold mb-6 text-center">{t('Admin Login')}</h2>
                {errors.length > 0 && (
                    <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                        {errors.map((message, i) => <p key={i}>{message}</p>)}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">{t('Email address')}</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded px-3 py-2 mt-1" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">{t('Password')}</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded px-3 py-2 mt-1" required />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded mt-4">{t('Login')}</button>
                </form>
            </div>
        </div>
    );
}