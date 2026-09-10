import { useState, useEffect } from 'react';

/**
 * Whether a CSS media query currently matches.
 *
 * Needed where a breakpoint changes what is *rendered* rather than only how it
 * looks: the rail collapses to icons on a desktop, but on a phone it is a
 * drawer that is either open or shut, and "collapsed" has no meaning there.
 * Tailwind can hide things at a width; it cannot decide which markup to build.
 *
 * Guarded twice, because jsdom implements no `matchMedia` at all and neither do
 * the older embedded browsers a client might open the panel in. Both answer
 * `false`, so a component falls back to its wide layout - which is the one that
 * works without JavaScript deciding anything.
 */
const supported = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export default function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => (supported() ? window.matchMedia(query).matches : false));

    useEffect(() => {
        if (!supported()) return undefined;

        const list = window.matchMedia(query);
        const onChange = (event) => setMatches(event.matches);

        // Read once here as well as subscribing: between the initialiser above
        // and this effect the window may already have been resized, and the
        // `change` event only fires on the *next* crossing.
        setMatches(list.matches);
        list.addEventListener('change', onChange);

        return () => list.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}
