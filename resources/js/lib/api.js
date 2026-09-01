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

/**
 * Send one image to the upload endpoint and return the URL it was stored at.
 *
 * The endpoint takes a single file per request, so a gallery calls this once
 * per file. The path, the field name the controller reads, and the multipart
 * header belong here rather than at each call site: two copies existed, and
 * the upload contract has changes queued against it — #50 drops `svg` from the
 * accepted list, #51 makes an upload owned so it can be cleaned up — each of
 * which would otherwise have to be made twice.
 *
 * Rejections propagate. The endpoint refuses by type and by size, and those
 * reasons are worth showing rather than being replaced with "failed", so
 * wording is left to the caller and `errorSummary`.
 */
export const uploadImage = async (file) => {
    const body = new FormData();
    body.append('image', file);

    const { data } = await api.post('/upload', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

    // A 200 carrying no URL is not a successful upload: it would become an
    // image nothing can display, and two of them would share the same
    // undefined key in the gallery list. Rejecting here means every caller
    // reports it where it already reports the refusals.
    if (typeof data?.url !== 'string' || data.url === '') {
        throw new Error('The upload succeeded but returned no URL.');
    }

    return data.url;
};

export default api;
