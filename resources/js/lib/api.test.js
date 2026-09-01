import { describe, it, expect, vi, beforeEach } from 'vitest';

// axios.create() has to be stubbed before lib/api.js is imported, since the
// instance is built at module load.
const calls = [];

const instance = {
    get: vi.fn((url, config) => {
        calls.push({ method: 'get', url, config });
        return Promise.resolve({ data: {} });
    }),
    post: vi.fn((url, body) => {
        calls.push({ method: 'post', url, body });
        return Promise.resolve({ data: { user: { id: 1, email: 'test@example.com' } } });
    }),
};

vi.mock('axios', () => ({
    default: { create: vi.fn(() => instance) },
}));

const { signIn, uploadImage } = await import('./api');

describe('uploadImage', () => {
    beforeEach(() => {
        calls.length = 0;
        instance.post.mockClear();
    });

    it('sends the file under the field name the endpoint expects', async () => {
        // No mockResolvedValueOnce here: that replaces the implementation, so
        // the shared `calls` array this asserts on would never be written to.
        await uploadImage(new File(['x'], 'sea.jpg', { type: 'image/jpeg' }));

        expect(calls[0].url).toBe('/upload');
        expect(calls[0].body).toBeInstanceOf(FormData);
        expect(calls[0].body.get('image')).toBeInstanceOf(File);
    });

    it('returns the stored URL rather than the response', async () => {
        instance.post.mockResolvedValueOnce({ data: { url: '/storage/uploads/sea.jpg' } });

        await expect(uploadImage(new File(['x'], 'sea.jpg')))
            .resolves.toBe('/storage/uploads/sea.jpg');
    });

    it('lets a rejection propagate, so callers can word it themselves', async () => {
        // The endpoint refuses by type and by size, and those reasons are
        // worth showing rather than being replaced with "failed".
        instance.post.mockRejectedValueOnce(Object.assign(new Error('Unprocessable'), {
            response: { status: 422, data: { errors: { image: ['The image must be an image.'] } } },
        }));

        await expect(uploadImage(new File(['x'], 'notes.txt'))).rejects.toThrow('Unprocessable');
    });
});

describe('signIn', () => {
    beforeEach(() => {
        calls.length = 0;
        instance.get.mockClear();
        instance.post.mockClear();
    });

    it('fetches the CSRF cookie before posting credentials', async () => {
        await signIn('test@example.com', 'password');

        // Order is the whole reason this lives in the client: Sanctum rejects
        // the login with 419 if the cookie has not been fetched first.
        expect(calls.map((c) => c.url)).toEqual(['/sanctum/csrf-cookie', '/login']);
    });

    it('escapes the /api prefix for the cookie, which is not an API route', () => {
        return signIn('test@example.com', 'password').then(() => {
            expect(calls[0].config).toEqual({ baseURL: '/' });
        });
    });

    it('posts the credentials to the API route, with no baseURL override', async () => {
        await signIn('test@example.com', 'password');

        expect(calls[1].body).toEqual({ email: 'test@example.com', password: 'password' });
    });

    it('returns the user from the response', async () => {
        await expect(signIn('test@example.com', 'password'))
            .resolves.toEqual({ id: 1, email: 'test@example.com' });
    });

    it('lets a failure of the cookie request propagate, and never reaches login', async () => {
        // Login maps this to a connection message; reporting it as bad
        // credentials was the bug behind TASKS.md #12.
        instance.get.mockRejectedValueOnce(new Error('Network Error'));

        await expect(signIn('test@example.com', 'password')).rejects.toThrow('Network Error');
        expect(instance.post).not.toHaveBeenCalled();
    });

    it('lets a failure of the login request propagate', async () => {
        instance.post.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), {
            response: { status: 401, data: { message: 'Invalid credentials' } },
        }));

        await expect(signIn('test@example.com', 'wrong')).rejects.toThrow('Unauthorized');
    });
});
