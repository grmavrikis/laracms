import { describe, it, expect, vi } from 'vitest';
import { applyToEach, bulkSummary, bulkRequest } from './bulk';

/**
 * What a bulk action does to several rows at once (#117 item 19).
 *
 * Pure, and tested without a table, because the failure that matters is
 * arithmetic: **how many of the five actually went**. `GalleryEditor` already
 * records why one refusal must not discard the rest - `allSettled`, not `all` -
 * and a bulk delete is the same shape with a worse consequence, since what
 * succeeded cannot be undone by retrying the whole set.
 */
describe('applyToEach', () => {
    it('calls the action once per id', async () => {
        const action = vi.fn().mockResolvedValue(undefined);

        await applyToEach([1, 2, 3], action);

        expect(action).toHaveBeenCalledTimes(3);
        expect(action.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
    });

    it('reports every id that went through', async () => {
        const result = await applyToEach([1, 2], () => Promise.resolve());

        expect(result).toEqual({ done: [1, 2], failed: [], reason: null });
    });

    // The half that succeeded is real and permanent; discarding the report of
    // it would leave the screen unable to say what happened.
    it('keeps what succeeded when one is refused', async () => {
        const refusal = new Error('403');
        const action = (id) => (id === 2 ? Promise.reject(refusal) : Promise.resolve());

        const result = await applyToEach([1, 2, 3], action);

        expect(result.done).toEqual([1, 3]);
        expect(result.failed).toEqual([2]);
        expect(result.reason).toBe(refusal);
    });

    it('reports the first refusal, so the screen can say why', async () => {
        const first = new Error('first');
        const action = (id) => (id === 1 ? Promise.reject(first) : Promise.reject(new Error('second')));

        expect((await applyToEach([1, 2], action)).reason).toBe(first);
    });

    it('does nothing at all for an empty selection', async () => {
        const action = vi.fn();

        expect(await applyToEach([], action)).toEqual({ done: [], failed: [], reason: null });
        expect(action).not.toHaveBeenCalled();
    });
});

describe('bulkSummary', () => {
    it('says nothing when everything went through', () => {
        expect(bulkSummary({ done: [1, 2], failed: [], reason: null })).toBeNull();
    });

    // The count is the information: "some failed" leaves the reader counting
    // rows to work out what to do next.
    it('says how many of how many could not be done', () => {
        const summary = bulkSummary({ done: [1], failed: [2, 3], reason: new Error('x') });

        expect(summary).toContain('2');
        expect(summary).toContain('3');
    });

    it('carries the reason the endpoint gave, when it gave one', () => {
        const refused = new Error('422');
        refused.response = { status: 422, data: { errors: { status: ['That status is not allowed.'] } } };

        expect(bulkSummary({ done: [], failed: [1], reason: refused }))
            .toContain('That status is not allowed.');
    });
});

/**
 * **Loud, not silent.** `app.jsx` settled this shape for the route table: a
 * name it does not know is a throw, because "loud is affordable". The screen
 * used to answer an unknown action with a bare `return`, so the day the two
 * publish controls are enabled - one line of PHP away - pressing them would
 * have done nothing at all, with no console message and no banner.
 */
describe('bulkRequest', () => {
    const api = { delete: (url) => Promise.resolve(url) };

    it('builds the delete each ticked row needs', async () => {
        const send = bulkRequest('delete', api, 'rooms');

        expect(await send(7)).toBe('/modules/rooms/entries/7');
    });

    it.each(['publish', 'unpublish', 'archive', '', undefined])('refuses %s by name', (action) => {
        expect(() => bulkRequest(action, api, 'rooms')).toThrow(/bulk action/i);
    });

    // The name is in the message, so the console says which one rather than
    // that something was wrong.
    it('names the action it was given', () => {
        expect(() => bulkRequest('publish', api, 'rooms')).toThrow(/publish/);
    });
});
