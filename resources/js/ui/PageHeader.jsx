/**
 * The heading strip every screen opens with.
 *
 * Extracted because `ModulesList` carried **three identical copies** of it -
 * one each for loading, error and ready - so a change to the panel's heading
 * meant finding all three, and the last person to touch it changed two.
 *
 * `title` renders as `h1`. Nothing in the Shell provides one: the Topbar has no
 * heading and the rail's brand is a `span`, so a screen that opens at `h2`
 * leaves the document with no top-level heading and "skip to the main heading"
 * lands nowhere.
 */
export default function PageHeader({ icon: Icon, title, description, actions }) {
    return (
        <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
                {Icon && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text ring-1 ring-inset ring-accent/20">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                )}
                <div className="min-w-0">
                    <h1 className="truncate text-xl font-bold tracking-tight text-fg">{title}</h1>
                    {description && (
                        <p className="mt-0.5 truncate text-sm text-fg-muted">{description}</p>
                    )}
                </div>
            </div>

            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
