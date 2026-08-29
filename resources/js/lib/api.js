import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true, // This is important for Laravel Sanctum to work properly
    headers: {
        'Accept': 'application/json',
        // Every /api/* route answers 401 rather than 500 without this, but the
        // app should ask for JSON regardless.
        'Content-Type': 'application/json',
    }
});

/**
 * Sanctum's SPA sign-in: fetch the CSRF cookie, then post the credentials.
 *
 * Three things here belong to the client rather than to a form. The cookie
 * endpoint sits outside `/api`, so it needs the baseURL overridden for this one
 * call; that override is why a second bare axios used to live in Login.jsx; and
 * the two calls have to happen in this order. None of it is a caller's problem.
 *
 * Errors are left to propagate: Login turns them into wording with
 * `errorSummary`, and it matters that a failure of the *first* call is not
 * reported as bad credentials.
 */
export const signIn = async (email, password) => {
    await api.get('/sanctum/csrf-cookie', { baseURL: '/' });

    const { data } = await api.post('/login', { email, password });

    return data.user;
};

export default api;