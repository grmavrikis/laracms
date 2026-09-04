/**
 * One request at a time, and only the newest value is worth sending.
 *
 * Built for reordering, whose payload is the **whole** order rather than a
 * description of what moved. That makes two things true at once: two requests
 * in flight are a genuine hazard, because whichever lands last wins and it may
 * not be the newest; and anything queued behind the newest value is redundant,
 * because the newest already describes the finished list.
 *
 * So clicks are neither dropped nor raced. The first goes out immediately, and
 * everything that arrives while it is in flight collapses into a single
 * follow-up carrying the latest order.
 *
 * The alternative was to disable the controls while a request was running,
 * which the review offered as an option (TASKS.md #78). It removes the race
 * by removing the clicks: pressing the arrow three times quickly moved a row
 * one place and silently discarded the other two.
 *
 * A failure stops the drain and clears what was waiting. Whatever is queued
 * was computed on top of an order the server refused, so sending it would
 * write a list built on a state that never existed - the caller reverts to
 * the last order the server confirmed instead.
 */
export const createLatestWriteQueue = (send) => {
    let running = false;
    let hasPending = false;
    let pending = null;
    let draining = null;

    const drain = async () => {
        running = true;

        try {
            while (hasPending) {
                const next = pending;
                hasPending = false;
                pending = null;

                await send(next);
            }
        } finally {
            // A failure leaves the loop, and that alone is what drops whatever
            // was queued behind it - the clearing here only keeps the state
            // honest for a later reader. Removing it changes no test, which is
            // the whole reason it is two lines and not a catch block.
            hasPending = false;
            pending = null;
            running = false;
            draining = null;
        }
    };

    return {
        /**
         * Queue a value. Resolves when the queue has drained, so every caller
         * waiting on it learns about a failure - and rejects with it.
         */
        push(value) {
            pending = value;
            hasPending = true;

            if (!running) {
                draining = drain();
            }

            return draining;
        },

        get busy() {
            return running;
        },
    };
};
