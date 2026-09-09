import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Deliberately separate from vite.config.js, which Vitest would otherwise
// reuse: that config loads the Laravel and Tailwind plugins as well, and the
// Laravel one expects to be running against a serving application. React is
// taken from there and nothing else - `.jsx` has to be transformed before a
// component can be rendered at all.
export default defineConfig({
    plugins: [react()],
    test: {
        // Both extensions. The pure helpers in `lib/` are `.test.js`; a
        // component test carries JSX and is `.test.jsx`, and the narrower
        // pattern this replaced did not match one - so such a file was
        // collected by nothing and reported by nothing. A test that never runs
        // is worse than no test, because the count still goes up.
        include: ['resources/js/**/*.test.{js,jsx}'],
        // `node` is the default and jsdom is opted into per file with
        // `// @vitest-environment jsdom`, rather than the other way round.
        // Measured: the thirteen pure-helper files in `lib/` run 211 tests in
        // 422ms but paid 77.82s of cumulative environment setup when every file
        // built a document it never touched.
        environment: 'node',
        setupFiles: ['./resources/js/test/setup.js'],
    },
});
