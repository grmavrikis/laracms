import { describe, it, expect } from 'vitest';
import { toggle, toggleAll, allSelected, someSelected, onlyPresent } from './selection';

/**
 * Which rows are ticked, as pure functions (#117 item 19).
 *
 * In a component this would be four `useState` updaters nobody could reach
 * without rendering a table - and `lib/moduleFields.js` records what that costs:
 * three defects in one commit while the logic lived inside a component. The
 * selection decides what a bulk **delete** acts on, which is the least
 * forgiving thing in the panel to get wrong.
 */
describe('toggle', () => {
    it('ticks a row that was not ticked', () => {
        expect(toggle([], 7)).toEqual([7]);
        expect(toggle([3], 7)).toEqual([3, 7]);
    });

    it('unticks one that was', () => {
        expect(toggle([3, 7], 7)).toEqual([3]);
    });

    // Ids arrive from JSON and from the DOM, where a number can become a
    // string; `[7]` and `['7']` selecting different rows is the kind of thing
    // that deletes the wrong entry.
    it('does not care whether an id arrived as a string', () => {
        expect(toggle([7], '7')).toEqual([]);
        expect(toggle(['7'], 7)).toEqual([]);
    });

    it('never mutates what it was given', () => {
        const before = [1, 2];

        toggle(before, 3);

        expect(before).toEqual([1, 2]);
    });

    it('survives being handed nothing', () => {
        expect(toggle(undefined, 1)).toEqual([1]);
        expect(toggle(null, 1)).toEqual([1]);
    });
});

describe('toggleAll', () => {
    /**
     * A selection is a **set**: which rows are ticked is the contract, the
     * order they are held in is not. Asserting the array shape would pin an
     * implementation detail and fail the first time the helper appended rather
     * than prepended - which is what the first draft of this test did.
     */
    const ticked = (result) => [...result].map(String).sort();

    it('ticks every row on the page when some are missing', () => {
        expect(ticked(toggleAll([2], [1, 2, 3]))).toEqual(['1', '2', '3']);
        expect(ticked(toggleAll([], [1, 2, 3]))).toEqual(['1', '2', '3']);
    });

    // And ticks each of them once, however many were already on.
    it('never ticks the same row twice', () => {
        expect(toggleAll([2], [1, 2, 3])).toHaveLength(3);
    });

    it('clears them when every one is already ticked', () => {
        expect(toggleAll([1, 2, 3], [1, 2, 3])).toEqual([]);
    });

    // The header box acts on the page, not on the module: a listing holds
    // fifteen rows and "select all" must never reach the four hundred a reader
    // cannot see.
    it('leaves a selection from elsewhere alone', () => {
        expect(ticked(toggleAll([9], [1, 2]))).toEqual(['1', '2', '9']);
    });

    it('survives an empty page', () => {
        expect(toggleAll([1], [])).toEqual([1]);
    });
});

describe('allSelected', () => {
    it('is true only when the whole page is ticked', () => {
        expect(allSelected([1, 2], [1, 2])).toBe(true);
        expect(allSelected([1], [1, 2])).toBe(false);
    });

    // An empty page has no "all", and a header box that ticks itself over
    // nothing is a control that says something untrue.
    it('is false for an empty page', () => {
        expect(allSelected([], [])).toBe(false);
        expect(allSelected([9], [])).toBe(false);
    });
});

describe('someSelected', () => {
    // Which is what makes the header box indeterminate rather than empty.
    it('is true when part of the page is ticked', () => {
        expect(someSelected([1], [1, 2])).toBe(true);
        expect(someSelected([], [1, 2])).toBe(false);
        expect(someSelected([1, 2], [1, 2])).toBe(false);
    });
});

/**
 * A selection is per page, and this is what enforces it.
 *
 * Turning to page two with fifteen rows still ticked means a bulk delete acts
 * on rows the reader is no longer looking at - and the confirmation would say
 * "delete 15" while showing fifteen different entries.
 */
describe('onlyPresent', () => {
    it('drops what this page does not hold', () => {
        expect(onlyPresent([1, 2, 9], [1, 2, 3])).toEqual([1, 2]);
    });

    it('empties the selection when the page shares nothing with it', () => {
        expect(onlyPresent([1, 2], [7, 8])).toEqual([]);
    });

    it('compares ids the same way the rest does', () => {
        expect(onlyPresent(['1'], [1, 2])).toEqual(['1']);
    });
});
