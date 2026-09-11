import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The definition of done for #117 items 18 and 19, checked rather than trusted.
 *
 * Those two screens are drawn from invented figures because the endpoints they
 * want do not exist - the listing API takes `?page` and nothing else. The item
 * says they must **wear a visible marker and leave a TODO naming the endpoint
 * they want**, and both halves are easy to lose: the marker to a later restyle,
 * the TODO to a tidy-up.
 *
 * A TODO that says "make this real" is not a task. One that says
 * `GET /api/stats/traffic` is, and the next person can start it.
 */
const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const SCREENS = [
    ['Dashboard', 'resources/js/screens/Dashboard.jsx'],
    ['Analytics', 'resources/js/screens/Analytics.jsx'],
];

/** `TODO(#117): … GET /api/stats/traffic …` - a verb, a path, on one line. */
const TODO_NAMING_AN_ENDPOINT = /TODO[^\n]*\b(GET|POST|PUT|DELETE)\s+\/api\/[\w/{}:-]+/;

describe('the screens drawn from invented figures', () => {
    it.each(SCREENS)('%s wears the marker', (_name, path) => {
        const code = source(path);

        expect(code).toMatch(/<Preview[\s>]/);
        expect(code).toContain("from '../ui/Preview'");
    });

    it.each(SCREENS)('%s leaves a TODO naming the endpoint it wants', (_name, path) => {
        const todos = source(path)
            .split('\n')
            .filter((line) => line.includes('TODO'));

        expect(todos.length, 'no TODO at all').toBeGreaterThan(0);
        expect(todos.join('\n')).toMatch(TODO_NAMING_AN_ENDPOINT);
    });

    // The marker is the only thing standing between an invented number and a
    // decision made on it, so a screen may not quietly stop using it.
    it.each(SCREENS)('%s never draws a figure outside it', (_name, path) => {
        const code = source(path);
        const opens = (code.match(/<Preview[\s>]/g) ?? []).length;
        const closes = (code.match(/<\/Preview>/g) ?? []).length;

        expect(opens, 'every Preview must be a wrapper, not self-closing').toBe(closes);
    });
});
