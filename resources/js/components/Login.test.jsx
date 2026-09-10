// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';

// The module is mocked rather than the network: `signIn` owns the
// csrf-then-credentials ordering (lib/api.js), and a test that stubbed XHR
// would be asserting axios rather than this form.
vi.mock('../lib/api', () => ({ signIn: vi.fn() }));

const { signIn } = await import('../lib/api');

// English is asserted raw, never through `t()`. Two reasons, and the second
// is the one that bites: the setup file leaves `messages` empty so `t()`
// answers its own key, and `CatalogueCoversTheCodeTest` skips `*.test.js`
// but **not** `*.test.jsx` - so a `t('…')` here would be demanded of
// `lang/en.json` as though the panel used it.
describe('Login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the two credentials fields and a submit button', () => {
        render(<Login onLogin={() => {}} />);

        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    });

    it('hands the credentials to signIn and the user back to onLogin', async () => {
        const user = userEvent.setup();
        const onLogin = vi.fn();
        signIn.mockResolvedValue({ id: 1, email: 'test@example.com' });

        render(<Login onLogin={onLogin} />);

        await user.type(screen.getByLabelText('Email address'), 'test@example.com');
        await user.type(screen.getByLabelText('Password'), 'password');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(signIn).toHaveBeenCalledWith('test@example.com', 'password');
        expect(onLogin).toHaveBeenCalledWith({ id: 1, email: 'test@example.com' });
    });

    // The wording that a 401 gets is a decision with a comment against it in
    // Login.jsx: a failed *csrf* call used to be reported as a bad password,
    // so a server that was down looked like a typo.
    // A person who cannot see what they typed retypes it, and on a form whose
    // only failure message is "wrong email or password" that is the difference
    // between one attempt and five - which the login limiter counts.
    it('can reveal and re-hide the password', async () => {
        const user = userEvent.setup();
        render(<Login onLogin={() => {}} />);

        const field = screen.getByLabelText('Password');
        expect(field).toHaveAttribute('type', 'password');

        await user.click(screen.getByRole('button', { name: 'Show password' }));

        expect(field).toHaveAttribute('type', 'text');
        expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'Hide password' }));

        expect(field).toHaveAttribute('type', 'password');
    });

    // Tab from the password should reach Sign in, not a control that only
    // changes how the text looks.
    it('keeps the reveal toggle out of the tab order', () => {
        render(<Login onLogin={() => {}} />);

        expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('tabindex', '-1');
    });

    // Both fields need `autocomplete` or a password manager cannot fill them,
    // which WCAG 2.2 asks for and which decides how good a password gets used.
    it('lets a password manager fill it', () => {
        render(<Login onLogin={() => {}} />);

        expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email');
        expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    });

    it('reports a 401 as bad credentials rather than as an expired session', async () => {
        const user = userEvent.setup();
        signIn.mockRejectedValue({ response: { status: 401 } });

        render(<Login onLogin={() => {}} />);

        // Both fields are `required`, and jsdom enforces constraint validation:
        // submitting them empty never reaches `handleSubmit`, so the assertion
        // below would be waiting for a request that was never made.
        await user.type(screen.getByLabelText('Email address'), 'test@example.com');
        await user.type(screen.getByLabelText('Password'), 'wrong-one');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(await screen.findByText('Wrong email or password.')).toBeInTheDocument();
    });

    // The refusal appears after the form has been sent, by which time a screen
    // reader has moved on - so it has to announce itself rather than only be
    // drawn.
    it('announces the refusal rather than only drawing it', async () => {
        const user = userEvent.setup();
        signIn.mockRejectedValue({ response: { status: 401 } });

        render(<Login onLogin={() => {}} />);

        await user.type(screen.getByLabelText('Email address'), 'test@example.com');
        await user.type(screen.getByLabelText('Password'), 'wrong-one');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    });

    // Both are drawn and neither is wired (TASKS.md #118). The assertion is not
    // that they exist - it is that they **admit** they do nothing, because a
    // control that looks ready is a support call on the screen where somebody
    // is already unsure whether they typed their password wrong.
    it('says so on the controls that are not wired up yet', () => {
        render(<Login onLogin={() => {}} />);

        expect(screen.getByRole('checkbox', { name: 'Remember me' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Forgot password?' }))
            .toHaveAttribute('title', 'Not available yet.');
    });

    // An answer to a reasonable question, not a rejection - so `status` rather
    // than `alert`, and the neutral surface rather than the danger one. In the
    // refusal banner it read as "you did something wrong" to somebody already
    // unsure whether they had mistyped their password.
    it('explains the reset flow without dressing it as a failure', async () => {
        const user = userEvent.setup();
        render(<Login onLogin={() => {}} />);

        await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

        expect(await screen.findByRole('status')).toHaveTextContent(/not set up yet/i);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // The checkbox is a real control that remembers being ticked, so it does
    // not feel broken - it simply has no effect on the request yet.
    it('lets the remember box be ticked even though it does nothing yet', async () => {
        const user = userEvent.setup();
        signIn.mockResolvedValue({ id: 1 });
        render(<Login onLogin={() => {}} />);

        const box = screen.getByRole('checkbox', { name: 'Remember me' });
        await user.click(box);

        expect(box).toBeChecked();

        await user.type(screen.getByLabelText('Email address'), 'test@example.com');
        await user.type(screen.getByLabelText('Password'), 'password');
        await user.click(screen.getByRole('button', { name: 'Login' }));

        // Two arguments, still. When #118 lands this is the assertion that has
        // to change, which is the point of pinning it.
        expect(signIn).toHaveBeenCalledWith('test@example.com', 'password');
    });
});
