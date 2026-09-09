import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCENTS } from './theme';

/**
 * The colours live in `app.css` and nowhere else; this reads that file and
 * checks it agrees with itself.
 *
 * Why it exists: the accent picker has to show all six palettes at once, but
 * the accent blocks only ever expose the chosen one - so a swatch cannot be
 * `var(--accent-solid)` and has to name its palette's colour a second time.
 * That second copy used to be twelve hexes in `ThemeMenu.jsx`, where nothing
 * could see them drift, and they were already wrong once: they showed step 500
 * while the panel painted 600 or 700. Moving them into the stylesheet put both
 * copies in one file; this test is what makes them provably the same value.
 */
const css = readFileSync(resolve(process.cwd(), 'resources/css/app.css'), 'utf8');

/** The body of the first rule whose selector text contains `needle`. */
const blockContaining = (needle) => {
    const at = css.indexOf(needle);
    expect(at, `no rule mentioning ${needle}`).toBeGreaterThan(-1);

    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);

    return css.slice(open + 1, close);
};

const declaration = (body, name) => {
    const found = body.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));

    return found ? found[1].trim() : null;
};

/** `var(--accent-700)` -> `--accent-700`, anything else unchanged. */
const dereference = (value, body) => {
    const indirect = value?.match(/^var\(\s*(--[\w-]+)\s*\)$/);

    return indirect ? declaration(body, indirect[1].slice(2)) : value;
};

const lightRoot = blockContaining(':root {');
const darkRoot = blockContaining(":root[data-theme='dark'] {");

describe('the accent palettes in app.css', () => {
    it.each(ACCENTS)('%s declares a full ramp and a solid step', (accent) => {
        const body = blockContaining(`[data-accent='${accent}']`);

        for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
            expect(declaration(body, `accent-${step}`), `${accent} is missing --accent-${step}`)
                .toMatch(/^#[0-9a-f]{6}$/i);
        }

        expect(declaration(body, 'accent-solid'), `${accent} is missing --accent-solid`).toBeTruthy();
    });

    // The assertion the picker rests on. A palette retuned for contrast - which
    // is exactly what --accent-solid exists for - must take its swatch with it.
    it.each(ACCENTS)('%s’s light swatch is the colour light mode actually paints', (accent) => {
        const body = blockContaining(`[data-accent='${accent}']`);
        const solid = dereference(declaration(body, 'accent-solid'), body);

        expect(declaration(lightRoot, `swatch-${accent}`)).toBe(solid);
    });

    it.each(ACCENTS)('%s’s dark swatch is the colour dark mode actually paints', (accent) => {
        const body = blockContaining(`[data-accent='${accent}']`);

        // Dark maps `--ui-accent` to the 400 step for every palette.
        expect(declaration(darkRoot, `swatch-${accent}`)).toBe(declaration(body, 'accent-400'));
    });
});

describe('the dark theme', () => {
    // `bg-accent/50` compiles to color-mix() over var(--color-accent); a
    // variable that exists only under [data-theme='dark'] resolves to nothing
    // in light mode, so the modifier goes transparent instead of failing.
    it('only re-points roles that light mode already declares', () => {
        const rolesIn = (body) => (body.match(/--ui-[\w-]+(?=\s*:)/g) ?? []);
        const light = new Set(rolesIn(lightRoot));

        for (const role of rolesIn(darkRoot)) {
            expect(light.has(role), `${role} is defined for dark but not on :root`).toBe(true);
        }
    });
});
