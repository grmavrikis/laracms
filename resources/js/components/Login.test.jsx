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
});
