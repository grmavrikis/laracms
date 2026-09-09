import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

/**
 * The panel's catalogue, which the server normally writes into the document
 * (#96). It is stubbed **here** rather than in each test because `lib/i18n.js`
 * reads `window.miniCms` once, at module load: a test file that set it after
 * its own imports would already have missed.
 *
 * `messages` is left empty on purpose. `t()` answers the key when a string is
 * not in the catalogue, and the key *is* the English text - so every component
 * renders English and a test asserts the English it can read in the source.
 * Loading a real catalogue would make the assertions depend on `lang/el.json`,
 * which changes for reasons that have nothing to do with the component.
 */
window.miniCms = {
    locale: 'en',
    locales: ['en'],
    messages: {},
};

// Explicit rather than automatic: React Testing Library only registers its own
// cleanup when Vitest is running with `globals: true`, which this project does
// not. Without it the previous test's DOM is still mounted and `getByRole`
// finds two of everything.
afterEach(() => {
    cleanup();
});
