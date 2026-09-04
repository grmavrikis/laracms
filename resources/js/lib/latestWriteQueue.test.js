import { describe, it, expect, vi } from 'vitest';
import { createLatestWriteQueue } from './latestWriteQueue';

/** A sender whose promises are resolved by hand, so the race is deterministic. */
const controllable = () => {
    const calls = [];
    const resolvers = [];

    const send = vi.fn((value) => {
        calls.push(value);
        return new Promise((resolve, reject) => resolvers.push({ resolve, reject }));
    });

    return {
        send,
        calls,
        settle: (i = 0) => resolvers[i].resolve(),
        fail: (i = 0, err = new Error('nope')) => resolvers[i].reject(err),
    };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLatestWriteQueue', () => {
    it('sends the first value immediately', async () => {
        const { send, calls, settle } = controllable();
        const queue = createLatestWriteQueue(send);

        const done = queue.push('a');
        expect(calls).toEqual(['a']);

        settle(0);
        await done;
    });

    it('never has two requests in flight at once', async () => {
        const { send, calls, settle } = controllable();
        const queue = createLatestWriteQueue(send);

        queue.push('a');
        queue.push('b');
        await tick();

        // 'b' arrived while 'a' was still going: it waits rather than racing.
        expect(calls).toEqual(['a']);

        settle(0);
        await tick();
        expect(calls).toEqual(['a', 'b']);
    });

    it('coalesces everything that arrived while one was in flight', async () => {
        const { send, calls, settle } = controllable();
        const queue = createLatestWriteQueue(send);

        queue.push('a');
        queue.push('b');
        queue.push('c');
        queue.push('d');
        await tick();

        settle(0);
        await tick();

        // Each value is a complete order, so only the last one has to be
        // written. 'b' and 'c' were superseded before they were ever sent.
        expect(calls).toEqual(['a', 'd']);
    });

    it('drains until nothing is left, however long the queue grows', async () => {
        const { send, calls, settle } = controllable();
        const queue = createLatestWriteQueue(send);

        queue.push(1);
        await tick();
        queue.push(2);
        settle(0);
        await tick();

        queue.push(3);
        settle(1);
        await tick();
        settle(2);
        await tick();

        expect(calls).toEqual([1, 2, 3]);
        expect(queue.busy).toBe(false);
    });

    it('reports a failure to whoever is waiting, and recovers', async () => {
        const { send, calls, fail, settle } = controllable();
        const queue = createLatestWriteQueue(send);

        const done = queue.push('a');
        fail(0, new Error('500'));

        await expect(done).rejects.toThrow('500');
        expect(queue.busy).toBe(false);

        // A failed write must not leave the queue wedged, nor silently send
        // the value that was waiting behind it.
        const next = queue.push('b');
        expect(calls).toEqual(['a', 'b']);
        settle(1);
        await next;
    });

    it('drops what was queued behind a failure', async () => {
        const { send, calls, fail } = controllable();
        const queue = createLatestWriteQueue(send);

        const done = queue.push('a');
        queue.push('b');
        fail(0);

        await expect(done).rejects.toThrow();
        await tick();

        // 'b' was computed from an order the server rejected, so sending it
        // would write a list built on top of a state that never existed.
        expect(calls).toEqual(['a']);
    });
});
