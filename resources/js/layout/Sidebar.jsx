import { useState, useEffect, useCallback } from 'react';
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

/** Referenced by the test, and by nothing else - the tooltip has no role. */
const TIP_ID = 'rail-tip';

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
 * and the tooltip below is decoration.
 */
function SidebarLink({ href, icon: Icon, letter, label, active, collapsed, nested, onNavigate, onTip }) {
    // Only while narrow. At full width the label is right there, and a tooltip
    // repeating a word the reader is already looking at is noise.
    const tipHandlers = collapsed && onTip
        ? {
            onMouseEnter: (event) => onTip(label, event.currentTarget),
            onFocus: (event) => onTip(label, event.currentTarget),
            onMouseLeave: () => onTip(null),
            onBlur: () => onTip(null),
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
                {...tipHandlers}
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
    const [tip, setTip] = useState(null);

    const viewLangCode = contentLangCode(languages, locale);

    /**
     * Where the hovered row's name is shown, and it is **portalled**.
     *
     * Measured before it was written rather than assumed: `nav` computes
     * `overflow-x: auto` - forced by its own `overflow-y-auto` - with its right
     * edge at 67.2px, and a probe positioned past that is clipped, with
     * `elementFromPoint` over it answering the page behind. A `fixed` child
     * happens to escape today because the rail's computed `transform` is
     * `none`, but that holds by accident of the current classes and the failure
     * mode of losing it is a tooltip nobody can see and nobody reports.
     */
    const showTip = useCallback((label, element) => {
        if (label === null) {
            setTip(null);

            return;
        }

        const row = element.getBoundingClientRect();
        const aside = element.closest('aside')?.getBoundingClientRect();

        setTip({
            label,
            top: row.top + row.height / 2,
            left: (aside?.right ?? row.right) + 8,
        });
    }, []);

    // Anything that moves the rows out from under the pointer takes the tooltip
    // with them: following a link, and widening the rail so the labels are
    // there anyway.
    useEffect(() => {
        setTip(null);
    }, [route, rail]);

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
                        onTip={showTip}
                    />
                    <SidebarLink
                        href={hrefFor('analytics')}
                        icon={ChartNoAxesColumn}
                        label={t('Analytics')}
                        active={isAt('analytics')}
                        collapsed={rail}
                        onNavigate={() => navigate('analytics')}
                        onTip={showTip}
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
                                onTip={showTip}
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
                        onTip={showTip}
                    />
                    <SidebarLink
                        href={hrefFor('modules')}
                        icon={Boxes}
                        label={t('Modules')}
                        active={isAt('modules') || isAt('moduleCreate') || route.name === 'moduleEdit'}
                        collapsed={rail}
                        onNavigate={() => navigate('modules')}
                        onTip={showTip}
                    />
                    <SidebarLink
                        href={hrefFor('settings')}
                        icon={Settings}
                        label={t('Settings')}
                        active={isAt('settings')}
                        collapsed={rail}
                        onNavigate={() => navigate('settings')}
                        onTip={showTip}
                    />
                </Section>
            </nav>

            {/* `aria-hidden`, because the row it describes already carries the
                same words as its accessible name and a reader announcing both
                would say everything twice. `bg-surface` rather than the
                `bg-surface-raised` the appearance menu uses: this ink is
                measured against that ground in `theme.css.test.js` and the
                raised surface is not on its list. The edge is `line-strong`
                rather than `line`, measured in both themes: a tooltip lands
                over the content area, where a card is `bg-surface` too, so at
                the ordinary border weight the only thing separating the two was
                a hairline of #e2e8f0 on #fff. */}
            {tip && createPortal(
                <div
                    id={TIP_ID}
                    aria-hidden="true"
                    style={{ top: tip.top, left: tip.left }}
                    className="pointer-events-none fixed z-50 -translate-y-1/2 animate-rail-tip whitespace-nowrap rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg shadow-lg motion-reduce:animate-none"
                >
                    {tip.label}
                </div>,
                document.body,
            )}
        </aside>
    );
}
