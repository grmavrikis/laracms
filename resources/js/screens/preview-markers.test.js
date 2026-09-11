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

    /**
     * **What this checks and what it does not.** It reads that every `<Preview>`
     * is a wrapper rather than a self-closing tag, which is the shape that can
     * actually contain anything - a marker that wraps nothing marks nothing.
     *
     * It does **not** check that no invented figure is drawn outside one, and
     * cannot: the Dashboard draws real figures outside its marker on purpose.
     * Placement is checked where the screen is rendered -
     * `Dashboard.test.jsx` → *keeps the entry counts inside the marker*. This
     * name said otherwise and a reader would have trusted it.
     */
    it.each(SCREENS)('%s wraps its marker round something', (_name, path) => {
        const code = source(path);
        const opens = (code.match(/<Preview[\s>]/g) ?? []).length;
        const closes = (code.match(/<\/Preview>/g) ?? []).length;

        expect(opens, 'a self-closing Preview marks nothing').toBe(closes);
        expect(opens).toBeGreaterThan(0);
    });
});
