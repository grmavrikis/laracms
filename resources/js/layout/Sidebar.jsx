import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    LayoutDashboard,
    ChartNoAxesColumn,
    FileText,
    Inbox,
    Boxes,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
    X,
} from 'lucide-react';
import { t, locale } from '../lib/i18n';
import { contentLangCode } from '../lib/languages';
import { loadLanguages } from '../lib/languageStore';
import { loadModules, onModulesChanged } from '../lib/moduleStore';
import { moduleNameIn } from '../lib/modules';
import { hrefFor } from '../routes';
import Link from '../ui/Link';
import useRoute from '../hooks/useRoute';
import useMediaQuery from '../hooks/useMediaQuery';
import IconButton from '../ui/IconButton';

const STORAGE_KEY = 'miniCms.sidebar';

/** Referenced by the test, and by nothing else - the flyout has no role. */
const FLYOUT_ID = 'rail-flyout';

/**
 * A cap on how wide the flyout may sit, not something it grows into - the box
 * mounts at its finished size, so this only guards a label long enough to
 * matter. Generous rather than measured: every label in the rail is a handful
 * of words, `max-width` lets the box shrink-wrap to whatever is actually
 * shorter than this, and the same cap for every row is one number instead of
 * a `ResizeObserver` per label.
 */
const FLYOUT_MAX_WIDTH = 224;

/**
 * How long to keep the flyout mounted after it starts fading out - long
 * enough for the box's own 100ms opacity transition to finish, plus a little
 * room for the browser to actually schedule that paint. Cutting it short is
 * what closing on a click looked like before this existed: the row you had
 * just clicked was becoming active, its own background sliding smoothly into
 * `bg-accent` over its `transition-colors`, while the flyout sitting on top of
 * it vanished in the very same frame - a clean fade fighting a hard cut,
 * right where the reader had just put their pointer.
 */
const FLYOUT_CLOSE_MS = 120;

/**
 * Guarded, like the theme's: a browser set to block site data throws on access
 * rather than answering null, and a rail that will not render is worse than one
 * that forgets how wide it was.
 */
const readCollapsed = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'collapsed';
    } catch (e) {
        return false;
    }
};

const writeCollapsed = (collapsed) => {
    try {
        localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch (e) {
        // Not being able to remember is not a reason to refuse the change.
    }
};

/**
 * One row of the rail.
 *
 * **An anchor, not a button.** Middle-click, ctrl-click and "copy link address"
 * all work on one and none of them work on the other, and a panel whose menu
 * cannot be opened in a new tab is a panel that feels like a toy. The click
 * handler stands aside for every modifier so the browser does its own thing.
 *
 * **The label is always rendered, and hidden rather than dropped when the rail
 * is narrow.** It used to be omitted entirely at 68px, with `title` left to
 * carry the name - and `title` *is* a name, last in the accessible-name
 * computation, which is exactly what made that comfortable. It should not have
 * been: it was the only thing naming the row, announced inconsistently between
 * readers, and one CSS change away from nothing at all. The name is text now,
 * and hidden with `sr-only`, which is what the flyout in `Sidebar` reveals.
 */
function SidebarLink({ href, icon: Icon, letter, label, active, collapsed, nested, onNavigate, onFlyout }) {
    // Only while narrow. At full width the label is right there, and a flyout
    // repeating a word the reader is already looking at is noise. The letter
    // never travels into it - a module has no icon, and the whole point of the
    // flyout is to say the name once, not the initial and then the name.
    const flyoutHandlers = collapsed && onFlyout
        ? {
            onMouseEnter: (event) => onFlyout({ label, active, Icon }, event.currentTarget),
            onFocus: (event) => onFlyout({ label, active, Icon }, event.currentTarget),
            onMouseLeave: () => onFlyout(null),
            onBlur: () => onFlyout(null),
        }
        : {};

    return (
        <li>
            <Link
                href={href}
                onNavigate={onNavigate}
                // `page` rather than `true`: this is the address on show, which
                // is what a screen reader announces as the current location.
                aria-current={active ? 'page' : undefined}
                {...flyoutHandlers}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                        ? 'bg-accent text-accent-fg font-semibold'
                        : 'text-sidebar-fg-muted hover:bg-sidebar-hover hover:text-sidebar-fg'
                } ${collapsed ? 'justify-center px-0' : ''}`}
            >
                {/* A nested row carries no glyph at all: the guide line and the
                    indent say what it belongs to, which is the whole point of
                    drawing the group as a submenu. The initial survives only
                    where it earns its place - see `Section` below. */}
                {!nested && (Icon
                    ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    : (
                        // A module has no icon of its own, and six identical
                        // glyphs in a collapsed rail tell you nothing. Its
                        // initial does.
                        <span
                            aria-hidden="true"
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                                active ? 'bg-accent-fg/20' : 'bg-sidebar-hover'
                            }`}
                        >
                            {letter}
                        </span>
                    ))}

                <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
            </Link>
        </li>
    );
}

/**
 * A named group of rows.
 *
 * `h2` + `aria-labelledby`, not a loose paragraph above a list. It said in a
 * comment that the grouping was "real to a screen reader" and it was not:
 * nothing associated the two, so the whole rail read as one flat list of links
 * with three stray words in it - and a reader could not tell Rooms, which is
 * the client's content, from Modules, which is ours. Collapsed it was worse,
 * because the hidden heading was then the only marker and it pointed at
 * nothing.
 *
 * **An `icon` makes it a submenu.** The heading is then drawn as a row of the
 * rail rather than as a small-caps label, and its rows hang under it on a guide
 * line. Only Content asks for that, because only Content's rows are the
 * client's own sections rather than screens we shipped - and it is still an
 * `h2` and still not a link, since there is no `/admin/content` to open and
 * pointing it at the module list would hand a hotel owner the agency's half of
 * the rail.
 */
function Section({ id, title, icon: Icon, collapsed, children }) {
    const submenu = Boolean(Icon) && !collapsed;

    return (
        <div className="px-3 py-2">
            <h2
                id={id}
                className={
                    collapsed
                        ? 'sr-only'
                        : submenu
                            ? 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-sidebar-fg'
                            : 'mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg-muted'
                }
            >
                {submenu && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
                {title}
            </h2>

            {/* 21px is `px-3` plus half of an 18px icon, so the line falls down
                the centre of the heading's own glyph; the 1px border and `pl-2`
                then put a child's label at the same 42px as the heading's. */}
            <ul
                aria-labelledby={id}
                className={`space-y-0.5 ${submenu ? 'ml-[21px] border-l border-sidebar-line pl-2' : ''}`}
            >
                {children}
            </ul>
        </div>
    );
}

export default function Sidebar({ open = false, onClose }) {
    const [route, navigate] = useRoute();
    const [collapsed, setCollapsed] = useState(readCollapsed);

    // Collapsing is a desktop idea. On a phone the rail is a drawer that is
    // either shown or not, so "icons only" would be a second, narrower drawer
    // for no reason - and the control that un-collapses it lives inside the
    // thing it collapsed.
    const isDesktop = useMediaQuery('(min-width: 1024px)');
    const rail = collapsed && isDesktop;
    const [modules, setModules] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [modulesFailed, setModulesFailed] = useState(false);

    // Two states rather than one, because a fade needs a frame to fade *from*:
    // `flyout` mounts the box already at its full, final size - nothing here
    // animates width any more - and `show` is flipped a frame later so the
    // browser has an opacity/transform to transition between. A single
    // boolean would either skip the transition (mount already shown) or never
    // play it (nothing here to trigger a re-render).
    const [flyout, setFlyout] = useState(null);
    const [show, setShow] = useState(false);

    // Cleared on every open and every close, so an open arriving while a
    // previous close is still pending cancels it rather than racing it - a
    // quick re-hover of a row that was on its way out must not have the
    // scheduled unmount arrive after the new one has already opened.
    const closeTimer = useRef(null);

    const viewLangCode = contentLangCode(languages, locale);

    /**
     * The collapsed rail's rows read as icons; hovering or focusing one
     * reveals its label beside it, which is what stands in for the rest of
     * the row's own text. It is **portalled**, not laid over the row it
     * describes with `absolute` - measured before it was written rather than
     * assumed, `nav` computes `overflow-x: auto`, forced by its own
     * `overflow-y-auto`, with its right edge at 67.2px, and a probe positioned
     * past that is clipped, with `elementFromPoint` over it answering the page
     * behind rather than the probe.
     *
     * **A fade and a slide, not a width grown open.** The first attempt here
     * animated `max-width` from the row's own size up to the label's, and
     * seen live it read as a progress bar sliding across rather than a menu
     * revealing a name - the owner's word for it was *slider*. The box now
     * mounts at its finished size and fades in as a whole; the label carries
     * its own short delay and its own small `translate-x`, so it settles a
     * beat after the highlight does rather than both arriving at once.
     *
     * **Closing plays the same fade backwards, rather than unmounting on the
     * spot.** `show` drops first, which is the class toggle the box already
     * transitions on, and the box itself is only removed once that transition
     * has had time to finish. Clicking a row used to cut straight to unmount:
     * the flyout vanished in the same frame the clicked row's own background
     * began sliding into `bg-accent`, so a smooth colour change sat right next
     * to a hard cut a few pixels away. Now both are the same kind of motion.
     */
    const closeFlyout = useCallback(() => {
        setShow(false);
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setFlyout(null), FLYOUT_CLOSE_MS);
    }, []);

    const openFlyout = useCallback((meta, element) => {
        clearTimeout(closeTimer.current);

        if (meta === null) {
            closeFlyout();

            return;
        }

        setFlyout({ ...meta, rect: element.getBoundingClientRect() });
        setShow(false);

        // Two frames, not one: the first commits the hidden state to the
        // page, the second flips the class that reveals it. A single `raf`
        // here was still asking to animate from a state the browser had not
        // yet painted, on the machine this was checked on.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setShow(true));
        });
    }, [closeFlyout]);

    // Only widening the rail closes the flyout on its own - the labels are
    // inline once it does, so a floating one left over would duplicate a name
    // that is now sitting right there in the markup. A route change does
    // **not** close it, and that took a live measurement to get right: the
    // first version closed on navigation too, on the reasoning that a link
    // just followed is a row just left. It measured as the opposite of smooth
    // - clicking a hovered row started the flyout's own fade-out at the exact
    // moment the *clicked* row's background began its own, differently-timed
    // transition into `bg-accent`, two motions of different lengths racing on
    // the same few pixels. The pointer had not gone anywhere, so there was
    // nothing to close *for*. It answers to the pointer actually leaving
    // (`onMouseLeave`/`onBlur`, wired on the row) exactly as before; this
    // effect exists only for the one case neither of those covers.
    useEffect(() => {
        if (rail) return undefined;

        closeFlyout();

        return () => clearTimeout(closeTimer.current);
    }, [rail, closeFlyout]);

    const fetchModules = useCallback(() => {
        setModulesFailed(false);

        Promise.all([
            loadModules(),
            // The languages may fail on their own: `moduleNameIn` falls back to
            // the module's own name, which is the rail exactly as it would have
            // been before #114. Losing the modules is the failure worth showing.
            loadLanguages().catch(() => []),
        ])
            .then(([list, langs]) => {
                setModules(list);
                setLanguages(langs);
            })
            .catch(() => setModulesFailed(true));
    }, []);

    useEffect(() => {
        fetchModules();

        // A module created or renamed elsewhere in the panel is a section of
        // this menu, so the rail has to hear about it - otherwise the client
        // makes a section and cannot reach it.
        return onModulesChanged(fetchModules);
    }, [fetchModules]);

    const toggle = () => {
        setCollapsed((was) => {
            writeCollapsed(!was);

            return !was;
        });
    };

    const isAt = (name, params) =>
        route.name === name && Object.entries(params ?? {}).every(([k, v]) => route.params[k] === v);

    return (
        <aside
            // Fixed and slid out of view below `lg`; an ordinary flex child
            // above it. `lg:translate-x-0` unconditionally, so the drawer's
            // closed position can never leak into the desktop layout.
            className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-sidebar-line bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-[width] ${
                open ? 'translate-x-0' : '-translate-x-full'
            } ${rail ? 'lg:w-[68px]' : 'lg:w-64'}`}
        >
            <div className={`flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-line px-3 ${
                rail ? 'justify-center' : ''
            }`}>
                {!rail && (
                    <span className="flex-1 truncate px-2 font-semibold text-sidebar-fg">
                        {t('Admin Panel')}
                    </span>
                )}

                {/* Two different controls at two widths: a drawer closes, a
                    rail collapses. Neither is meaningful at the other's size. */}
                <IconButton
                    icon={X}
                    label={t('Close menu')}
                    tone="sidebar"
                    onClick={onClose}
                    className="lg:hidden"
                />
                <IconButton
                    icon={rail ? PanelLeftOpen : PanelLeftClose}
                    label={rail ? t('Expand menu') : t('Collapse menu')}
                    tone="sidebar"
                    onClick={toggle}
                    aria-expanded={!rail}
                    className="hidden lg:inline-flex"
                />
            </div>

            <nav aria-label={t('Sections')} className="flex-1 overflow-y-auto py-2">
                <Section id="nav-overview" title={t('Overview')} collapsed={rail}>
                    <SidebarLink
                        href={hrefFor('dashboard')}
                        icon={LayoutDashboard}
                        label={t('Dashboard')}
                        active={isAt('dashboard')}
                        collapsed={rail}
                        onNavigate={() => navigate('dashboard')}
                        onFlyout={openFlyout}
                    />
                    <SidebarLink
                        href={hrefFor('analytics')}
                        icon={ChartNoAxesColumn}
                        label={t('Analytics')}
                        active={isAt('analytics')}
                        collapsed={rail}
                        onNavigate={() => navigate('analytics')}
                        onFlyout={openFlyout}
                    />
                </Section>

                <Section id="nav-content" title={t('Content')} icon={FileText} collapsed={rail}>
                    {modulesFailed && !rail && (
                        <li className="px-3 py-2 text-xs text-danger-text">
                            {t('Could not load the modules.')}
                        </li>
                    )}
                    {modules.map((module) => {
                        const name = moduleNameIn(module, viewLangCode) ?? module.slug;

                        return (
                            <SidebarLink
                                key={module.slug}
                                href={hrefFor('entries', { module: module.slug })}
                                letter={(name[0] ?? '?').toUpperCase()}
                                label={name}
                                nested={!rail}
                                active={isAt('entries', { module: module.slug })
                                    || isAt('entryEdit', { module: module.slug })
                                    || isAt('entryCreate', { module: module.slug })}
                                collapsed={rail}
                                onNavigate={() => navigate('entries', { module: module.slug })}
                                onFlyout={openFlyout}
                            />
                        );
                    })}
                </Section>

                {/* Visually separated because it is the agency's half rather
                    than the client's: a hotel owner works above this line and
                    should not have to pick their rooms out of a list that also
                    offers "Modules". */}
                <div className="mx-3 my-2 border-t border-sidebar-line" />

                <Section id="nav-manage" title={t('Manage')} collapsed={rail}>
                    <SidebarLink
                        href={hrefFor('enquiries')}
                        icon={Inbox}
                        label={t('Enquiries')}
                        active={isAt('enquiries')}
                        collapsed={rail}
                        onNavigate={() => navigate('enquiries')}
                        onFlyout={openFlyout}
                    />
                    <SidebarLink
                        href={hrefFor('modules')}
                        icon={Boxes}
                        label={t('Modules')}
                        active={isAt('modules') || isAt('moduleCreate') || route.name === 'moduleEdit'}
                        collapsed={rail}
                        onNavigate={() => navigate('modules')}
                        onFlyout={openFlyout}
                    />
                    <SidebarLink
                        href={hrefFor('settings')}
                        icon={Settings}
                        label={t('Settings')}
                        active={isAt('settings')}
                        collapsed={rail}
                        onNavigate={() => navigate('settings')}
                        onFlyout={openFlyout}
                    />
                </Section>
            </nav>

            {/* `aria-hidden`, because the row it describes already carries the
                same words as its accessible name and a reader announcing both
                would say everything twice - the flyout stands in for the rest
                of the row's own text, not a second control.

                Positioned at the row's own rect and **the same colour it
                already has**: `bg-accent` for the active row, matching what
                the owner saw on Dashboard, and `bg-sidebar-hover` for every
                other one, matching its ordinary `:hover`. The real row is
                still underneath and still receiving the pointer - this simply
                paints over it at an identical position, so there is nothing to
                mismatch.

                **The box mounts at its finished width and fades in; nothing
                here animates `max-width`.** The first version did, and seen
                live it read as a progress bar sliding open rather than a name
                appearing - animating the *clip* rather than the *content* is
                what a slider is. The label carries its own short delay and its
                own `-translate-x-1`, so it settles a beat after the highlight
                rather than both snapping in together. No icon travels into
                the box for a module row (`Icon` is undefined there), which is
                the whole point: the initial is what the flyout replaces, not
                what it repeats beside the name. */}
            {flyout && createPortal(
                <div
                    id={FLYOUT_ID}
                    aria-hidden="true"
                    style={{
                        top: flyout.rect.top,
                        left: flyout.rect.left,
                        height: flyout.rect.height,
                        maxWidth: Math.min(FLYOUT_MAX_WIDTH, window.innerWidth - flyout.rect.left - 16),
                    }}
                    className={`pointer-events-none fixed z-50 flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 transition-opacity duration-100 ease-out motion-reduce:transition-none ${
                        show ? 'opacity-100' : 'opacity-0'
                    } ${
                        flyout.active
                            ? 'bg-accent text-accent-fg font-semibold'
                            : 'bg-sidebar-hover text-sidebar-fg'
                    }`}
                >
                    {flyout.Icon && <flyout.Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
                    <span
                        className={`transition-[opacity,translate] delay-75 duration-150 ease-out motion-reduce:transition-none motion-reduce:delay-0 ${
                            show ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'
                        }`}
                    >
                        {flyout.label}
                    </span>
                </div>,
                document.body,
            )}
        </aside>
    );
}
