/**
 * An anchor that navigates inside the panel.
 *
 * **An anchor, not a button.** Middle-click, ctrl-click and "copy link address"
 * all work on one and none of them work on the other, and a panel whose links
 * cannot be opened in a new tab is a panel that feels like a toy. The handler
 * stands aside for every modifier so the browser does its own thing.
 *
 * Extracted at its **third** copy (#117 item 18's review): `SidebarLink` had
 * it, and `Dashboard` wrote it out twice more - **without the
 * `defaultPrevented` check**, so a click a parent had already handled was
 * honoured in the rail and navigated anyway on the dashboard. That is what a
 * third hand-written copy of a non-obvious rule costs: not duplication, drift.
 */
export default function Link({ href, onNavigate, children, ...rest }) {
    return (
        <a
            href={href}
            onClick={(event) => {
                if (
                    event.defaultPrevented
                    || event.button !== 0
                    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
                ) {
                    return;
                }

                event.preventDefault();
                onNavigate?.();
            }}
            {...rest}
        >
            {children}
        </a>
    );
}
