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
        // Semantic tokens rather than a fixed grey and a fixed white. Those
        // were fine while every colour in the panel was hardcoded, but `body`
        // now takes its text colour from `--ui-fg` - so under the dark theme
        // this card was near-white text on a white card, which is how the
        // sign-in screen ended up unreadable. The two-panel redesign is #117
        // item 9; this is only the colours, so it is legible until then.
        <div className="flex items-center justify-center min-h-screen bg-bg">
            <div className="bg-surface p-8 rounded-xl border border-line shadow-sm w-96">
                <h2 className="text-2xl font-bold mb-6 text-center text-fg">{t('Admin Login')}</h2>
                {errors.length > 0 && (
                    <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-text space-y-1">
                        {errors.map((message, i) => <p key={i}>{message}</p>)}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* The `for`/`id` pair is not decoration: without it the
                        input has no accessible name at all, so a screen reader
                        announces "edit text, blank" and tapping the label does
                        not focus the field. */}
                    <div>
                        <label htmlFor="login-email" className="block text-sm font-medium text-fg">{t('Email address')}</label>
                        <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-line bg-surface text-fg px-3 py-2 mt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent" required />
                    </div>
                    <div>
                        <label htmlFor="login-password" className="block text-sm font-medium text-fg">{t('Password')}</label>
                        <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-line bg-surface text-fg px-3 py-2 mt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent" required />
                    </div>
                    {/* `autocomplete` on both, so a password manager can fill
                        them. WCAG 2.2 asks for it, and a client who cannot use
                        their manager is a client who picks a worse password. */}
                    <button type="submit" className="w-full cursor-pointer bg-accent text-accent-fg font-semibold py-2 rounded-lg mt-4 transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent">{t('Login')}</button>
                </form>
            </div>
        </div>
    );
}