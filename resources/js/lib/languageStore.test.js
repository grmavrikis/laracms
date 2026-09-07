import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./api', () => ({
    default: { get: vi.fn() },
}));

import api from './api';
import { loadLanguages, forgetLanguages } from './languageStore';

const languages = [
    { id: 1, code: 'el', name: 'Greek', is_default: true, is_active: true },
    { id: 2, code: 'en', name: 'English', is_default: false, is_active: true },
];

beforeEach(() => {
    forgetLanguages();
    api.get.mockReset();
});

describe('loadLanguages', () => {
    /**
     * Five components each fetched this list, so moving between the module
     * list, a module's entries and back re-asked for a table that only
     * changes when the agency runs an INSERT by hand (#52).
     */
    test('asks once however many screens want it', async () => {
        api.get.mockResolvedValue({ data: languages });

        const [first, second, third] = await Promise.all([
            loadLanguages(),
            loadLanguages(),
            loadLanguages(),
        ]);

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(first).toEqual(languages);
        expect(second).toBe(first);
        expect(third).toBe(first);
    });

    test('unwraps a paginator envelope, like every other caller did', async () => {
        api.get.mockResolvedValue({ data: { data: languages } });

        expect(await loadLanguages()).toEqual(languages);
    });

    /**
     * A failure is not an answer. Caching the rejection would make one screen's
     * dropped connection follow the person around the panel until they
     * reloaded.
     */
    test('a failure is not remembered', async () => {
        api.get.mockRejectedValueOnce(new Error('offline'));
        await expect(loadLanguages()).rejects.toThrow('offline');

        api.get.mockResolvedValue({ data: languages });
        expect(await loadLanguages()).toEqual(languages);
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});
