import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api from './api';
import { loadModules, forgetModules, onModulesChanged } from './moduleStore';

vi.mock('./api', () => ({ default: { get: vi.fn() } }));

describe('moduleStore', () => {
    // The listener set is module-level and outlives each test, so a
    // subscription left behind is still called by the next test's
    // `forgetModules()`. Harmless today only because the mocks are cleared
    // straight afterwards - a test asserting "nothing was notified" would fail
    // for a reason that has nothing to do with the code.
    const subscriptions = [];
    const subscribe = (listener) => {
        subscriptions.push(onModulesChanged(listener));
    };

    beforeEach(() => {
        forgetModules();
        vi.clearAllMocks();
    });

    afterEach(() => {
        while (subscriptions.length > 0) subscriptions.pop()();

        forgetModules();
    });

    it('asks once however many screens want the list', async () => {
        api.get.mockResolvedValue({ data: [{ slug: 'rooms' }] });

        const [first, second] = await Promise.all([loadModules(), loadModules()]);

        expect(api.get).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });

    it('tolerates the paginator envelope as well as a bare array', async () => {
        api.get.mockResolvedValue({ data: { data: [{ slug: 'rooms' }] } });

        await expect(loadModules()).resolves.toEqual([{ slug: 'rooms' }]);
    });

    // A rejection is not an answer. Caching one would make a single dropped
    // request permanent for the life of the page, for every other screen too.
    it('does not cache a failure', async () => {
        api.get.mockRejectedValueOnce(new Error('offline'));
        api.get.mockResolvedValueOnce({ data: [{ slug: 'rooms' }] });

        await expect(loadModules()).rejects.toThrow('offline');
        await expect(loadModules()).resolves.toEqual([{ slug: 'rooms' }]);
        expect(api.get).toHaveBeenCalledTimes(2);
    });

    // The difference from `languageStore`: modules are created and renamed from
    // the panel, and since #117 they are also the navigation. A create that
    // left the rail stale would be a section the client just made and cannot
    // reach.
    it('asks again after being told to forget', async () => {
        api.get.mockResolvedValue({ data: [] });

        await loadModules();
        forgetModules();
        await loadModules();

        expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('tells everyone showing the list', () => {
        const sidebar = vi.fn();
        const list = vi.fn();

        subscribe(sidebar);
        subscribe(list);

        forgetModules();

        expect(sidebar).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledTimes(1);
    });

    it('stops telling one that has unsubscribed', () => {
        const listener = vi.fn();
        const stop = onModulesChanged(listener);

        stop();
        forgetModules();

        expect(listener).not.toHaveBeenCalled();
    });

    // A listener unsubscribing while being told would otherwise mutate the set
    // mid-iteration, which silently skips whichever listener came next.
    it('survives a listener that unsubscribes while being told', () => {
        const second = vi.fn();
        let stopFirst;

        stopFirst = onModulesChanged(() => stopFirst());
        subscribe(second);

        expect(() => forgetModules()).not.toThrow();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
