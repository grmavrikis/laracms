import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
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

/**
 * `prose` paints its own colours, and they are not the panel's.
 *
 * The rich-text editor wears `prose` for its type scale and list markers, but
 * the plugin sets `--tw-prose-body` and friends to fixed grays - so the words a
 * client types measured **8.4:1 on the light surface and 2.01:1 on the dark
 * one**. Everything they had written was nearly invisible with the theme
 * switched, and nothing failed: the surface was tokenised, the text was not.
 *
 * Mapping the variables onto `--ui-*` once means the editor follows both axes
 * for free, the same trick `@theme inline` plays for utilities.
 *
 * The list is the **server's**, not a guess: `RichTextDocument::NODES` and
 * `::MARKS` decide what can be stored, so a colour outside it would be paint
 * for markup that cannot survive a save.
 */
describe('the rich-text editor follows the theme', () => {
    const editor = blockContaining('.tiptap-editor {');

    it.each([
        ['body', 'a paragraph'],
        ['headings', 'H1, H2 and H3'],
        ['bold', 'bold text'],
        ['links', 'a link'],
        ['bullets', 'a bullet list'],
        ['counters', 'an ordered list'],
        ['quotes', 'a blockquote'],
        ['quote-borders', 'a blockquote'],
        ['code', 'inline code'],
        ['pre-bg', 'a code block'],
        ['pre-code', 'a code block'],
        ['hr', 'a horizontal rule'],
    ])('paints %s, which the editor writes for %s, from a theme token', (name) => {
        const value = declaration(editor, `tw-prose-${name}`);

        expect(value, `--tw-prose-${name} is left to the plugin's fixed gray`).not.toBeNull();
        expect(value, `--tw-prose-${name} names a colour instead of a token`).toMatch(/^var\(--ui-[\w-]+\)$/);
    });
});

/**
 * The tokens are measured, not eyeballed.
 *
 * Item 3 already settled this once, for `--accent-solid`: a fixed ramp step was
 * correct on half the palettes and silently failed WCAG AA on the rest, and the
 * answer was to measure rather than to trust the ramp. The same applies to the
 * grays, and it was not being checked - **`--ui-fg-muted` measured 4.35:1 on
 * `--ui-surface-muted` in light**, which is the pair every card's secondary
 * line and every small-caps label actually sits on. Found by measuring the live
 * panel; nothing in the suite could see it.
 *
 * The thresholds are WCAG's, by what each tier is for:
 *
 * - `fg` and `fg-muted` carry sentences and labels, so **4.5:1**.
 * - `fg-subtle` is the hint tier - placeholders, an em dash for an empty cell -
 *   and is held to the **3:1** that applies to non-text, which is what stops it
 *   drifting lighter while leaving it distinguishable from `fg-muted`.
 */
const HEX = /^#([0-9a-f]{6})$/i;

const luminance = (hex) => {
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return (hi + 0.05) / (lo + 0.05);
};

describe('the grays are readable on the surfaces they sit on', () => {
    const SURFACES = ['bg', 'surface', 'surface-muted'];
    const cases = [];

    for (const [theme, body] of [['light', lightRoot], ['dark', darkRoot]]) {
        for (const surface of SURFACES) {
            for (const [ink, floor] of [['fg', 4.5], ['fg-muted', 4.5], ['fg-subtle', 3]]) {
                cases.push([theme, ink, surface, floor, body]);
            }
        }
    }

    it.each(cases)('%s: %s on %s clears %s:1', (_theme, ink, surface, floor, body) => {
        const inkHex = declaration(body, `ui-${ink}`);
        const surfaceHex = declaration(body, `ui-${surface}`);

        // Every one of these is a literal in both blocks; a `var()` here would
        // mean a token moved and this test needs to learn how to follow it.
        expect(inkHex, `--ui-${ink}`).toMatch(HEX);
        expect(surfaceHex, `--ui-${surface}`).toMatch(HEX);

        expect(contrast(inkHex, surfaceHex)).toBeGreaterThanOrEqual(floor);
    });

    /**
     * The rail needs its own check because nothing above would notice it, and
     * it needs **both** themes: `--ui-sidebar-bg` is re-pointed under
     * `[data-theme='dark']` while the two inks are not, so the dark pairing is
     * one the light block alone never describes. Checking light only - which
     * this did at first - would pass while the dark rail went unreadable.
     */
    it.each([
        ['light', 'sidebar-fg', 4.5],
        ['light', 'sidebar-fg-muted', 4.5],
        ['dark', 'sidebar-fg', 4.5],
        ['dark', 'sidebar-fg-muted', 4.5],
    ])('%s: the rail ink %s clears %s:1', (theme, ink, floor) => {
        const body = theme === 'dark' ? darkRoot : lightRoot;

        // The inks are declared on `:root` only, so dark inherits them; the
        // background is re-pointed and has to be read from the dark block.
        const inkHex = declaration(body, `ui-${ink}`) ?? declaration(lightRoot, `ui-${ink}`);
        const bgHex = declaration(body, 'ui-sidebar-bg') ?? declaration(lightRoot, 'ui-sidebar-bg');

        expect(inkHex, `--ui-${ink}`).toMatch(HEX);
        expect(bgHex, '--ui-sidebar-bg').toMatch(HEX);
        expect(contrast(inkHex, bgHex)).toBeGreaterThanOrEqual(floor);
    });

    /**
     * The highlight is the narrowest margin in the panel - it measured 4.58:1
     * in dark, live - and it is a self-contained pair of literal hexes in both
     * theme blocks, which is exactly the shape this file already handles.
     * Leaving it out is how `--tw-prose-body` shipped at 2.01:1.
     */
    it.each([['light', lightRoot], ['dark', darkRoot]])('%s: highlighted text stays readable', (_theme, body) => {
        const ink = declaration(body, 'ui-highlight-fg');
        const ground = declaration(body, 'ui-highlight-bg');

        expect(ink, '--ui-highlight-fg').toMatch(HEX);
        expect(ground, '--ui-highlight-bg').toMatch(HEX);
        expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
    });
});

/**
 * Everything above measures a **token**. An opacity modifier writes a different
 * colour than the token names - `text-sidebar-fg-muted/70` composites the ink
 * against whatever is behind it - so a class like that is a silent opt-out of
 * every measurement in this file.
 *
 * It is not hypothetical. The rail's three group headings carried exactly that,
 * and composited over `--ui-sidebar-bg` they measured **3.56:1 in light and
 * 3.92:1 in dark** against the 4.5 floor the rule above holds that same token
 * to. At 11px semibold nothing excuses it: WCAG's large-text allowance starts
 * at 18.66px bold.
 *
 * Only `text-`. The panel carries twenty-eight other modifiers and every one is
 * `bg-`, `border-` or `ring-`, which are surfaces and edges rather than ink -
 * a translucent border is a design decision, a translucent sentence is a
 * readability one.
 */
describe('no text colour opts out of the measurement', () => {
    // Tailwind's other use of the slash: `text-sm/6` is a font-size with a
    // line-height and says nothing about colour. Named rather than pattern-
    // matched, because the scale is a closed list and a colour token is not.
    const FONT_SIZES = new Set([
        'xs', 'sm', 'base', 'lg', 'xl',
        '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
    ]);

    const sources = globSync('resources/js/**/*.{js,jsx}', { cwd: process.cwd() })
        .filter((path) => !/\.test\.[jt]sx?$/.test(path));

    it('scans the panel it claims to scan', () => {
        // A scan that reads less than it thinks reports success either way -
        // the lesson `TranslatedLiterals` paid for when `accept="image/*"` hid
        // three files from the check that existed to read them.
        expect(sources.length).toBeGreaterThan(40);
    });

    it.each(sources)('%s', (path) => {
        const source = readFileSync(resolve(process.cwd(), path), 'utf8');
        const offenders = [...source.matchAll(/\btext-([a-z0-9-]+)\/(\d{1,3})\b/g)]
            .filter(([, token]) => !FONT_SIZES.has(token))
            .map(([match]) => match);

        expect(offenders, `${path} dims an ink instead of naming a token`).toEqual([]);
    });
});
