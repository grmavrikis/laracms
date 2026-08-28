import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.js, which Vitest would otherwise
// reuse: that config loads the Laravel, React and Tailwind plugins, and the
// Laravel one expects to be running against a serving application. These tests
// only exercise the pure helpers in resources/js/lib, so none of it is needed.
export default defineConfig({
    test: {
        include: ['resources/js/**/*.test.js'],
        // No DOM: these are plain functions over API payloads and editor
        // documents. Component rendering would need jsdom and is not covered.
        environment: 'node',
    },
});
