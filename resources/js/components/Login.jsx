import { useState } from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { signIn } from '../lib/api';
import { errorSummary } from '../lib/apiErrors';
import { t } from '../lib/i18n';

/**
 * The sign-in screen (#117 item 9).
 *
 * **`Remember me` and `Forgot password` are drawn but not wired** - see the
 * comment beside them, and **TASKS.md #118**, which carries the PHP both need.
 * Each says so in its `title`, because a control that looks ready and is not
 * belongs on the one screen where a person is already unsure whether they have
 * done something wrong - so it should at least admit it.
 */
export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [revealed, setRevealed] = useState(false);
    // Drawn only - see the block beside the checkbox, and TASKS.md #118.
    const [rememberMe, setRememberMe] = useState(false);
    const [errors, setErrors] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors([]);
        setSubmitting(true);

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
        } finally {
            setSubmitting(false);
        }
    };

    const fieldClasses = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-fg '
        + 'placeholder:text-fg-subtle transition-colors focus-visible:outline-2 '
        + 'focus-visible:outline-offset-2 focus-visible:outline-ring-accent';

    return (
        <div className="grid min-h-screen bg-bg lg:grid-cols-2">
            {/* The brand half. Hidden below `lg` rather than stacked: on a
                phone it would push the form below the fold, and the form is
                the only thing anybody came here for. */}
            <div className="relative hidden overflow-hidden bg-sidebar p-10 lg:flex lg:flex-col lg:justify-between">
                {/* Two soft washes of the accent. Decorative, so they carry no
                    text and nothing depends on seeing them - and they are drawn
                    from the same token the rest of the panel uses, so choosing
                    a different accent changes this screen too. */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
                    style={{ backgroundColor: 'var(--ui-accent)' }}
                />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full opacity-15 blur-3xl"
                    style={{ backgroundColor: 'var(--ui-accent)' }}
                />

                <div className="relative flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-fg">
                        <Layers className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-semibold text-sidebar-fg">{t('Admin Panel')}</span>
                </div>

                <div className="relative max-w-md">
                    <p className="text-3xl font-semibold leading-tight text-sidebar-fg">
                        {t('Everything your site says, in every language you sell in.')}
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-sidebar-fg-muted">
                        {t('Write once, translate at your own pace, and publish when you are ready.')}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-sm">
                    {/* The mark again, for the viewport where the panel beside
                        it is not shown. */}
                    <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg lg:hidden">
                        <Layers className="h-5 w-5" aria-hidden="true" />
                    </span>

                    <h1 className="text-2xl font-bold tracking-tight text-fg">{t('Admin Login')}</h1>
                    <p className="mt-2 text-sm text-fg-muted">
                        {t('Sign in to manage your website’s content.')}
                    </p>

                    {errors.length > 0 && (
                        // `role="alert"` so the refusal is announced rather than
                        // only drawn: it appears after the form has been sent,
                        // by which time a screen reader has moved on.
                        <div
                            role="alert"
                            className="mt-6 space-y-1 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-text"
                        >
                            {errors.map((message, i) => <p key={i}>{message}</p>)}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        {/* The `for`/`id` pair is not decoration: without it the
                            input has no accessible name at all, so a screen
                            reader announces "edit text, blank" and tapping the
                            label does not focus the field. */}
                        <div>
                            <label htmlFor="login-email" className="block text-sm font-medium text-fg">
                                {t('Email address')}
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                // So a password manager can fill it. WCAG 2.2
                                // asks for this, and a client who cannot use
                                // their manager picks a worse password.
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`mt-1.5 ${fieldClasses}`}
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-fg">
                                {t('Password')}
                            </label>
                            <div className="relative mt-1.5">
                                <input
                                    id="login-password"
                                    type={revealed ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`${fieldClasses} pr-11`}
                                    required
                                />
                                {/* Inside the field rather than beside it, and
                                    `tabIndex={-1}`: tabbing from the password
                                    should reach the submit button, not a
                                    control that only changes how the text
                                    looks. It stays reachable by pointer, and
                                    `aria-pressed` reports its state. */}
                                <button
                                    type="button"
                                    onClick={() => setRevealed((was) => !was)}
                                    aria-pressed={revealed}
                                    aria-label={revealed ? t('Hide password') : t('Show password')}
                                    title={revealed ? t('Hide password') : t('Show password')}
                                    tabIndex={-1}
                                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg text-fg-subtle transition-colors hover:text-fg"
                                >
                                    {revealed
                                        ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
                                        : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        {/* ------------------------------------------------
                            NOT WIRED UP YET - both of these are drawn only.

                            `Remember me` needs a `remember` parameter on
                            `POST /api/login`, and `Forgot password` needs a
                            whole reset flow: routes, a signed token, a mail
                            template. This pass of #117 adds no PHP, so they
                            are here as UI and do nothing.

                            **TASKS.md #118** carries both. Until it lands, the
                            checkbox does not extend the session and the link
                            does not go anywhere - the `title` on each says so,
                            which is the least a person deserves from a control
                            that looks ready.
                            ------------------------------------------------ */}
                        <div className="flex items-center justify-between gap-3">
                            <label
                                className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted"
                                title={t('Not available yet.')}
                            >
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="h-4 w-4 cursor-pointer rounded border-line-strong text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                                />
                                {t('Remember me')}
                            </label>

                            <button
                                type="button"
                                title={t('Not available yet.')}
                                onClick={() => setErrors([t('Password reset is not set up yet. Ask your developer to sign you in.')])}
                                className="cursor-pointer text-sm font-medium text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent"
                            >
                                {t('Forgot password?')}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? t('Signing in…') : t('Login')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
