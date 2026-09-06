# This directory belongs to one client

Everything here is **per installation**. Everything outside it is **core** and
ships to every installation unchanged (`docs/TASKS.md` #61).

Client #2 is a copy of this directory against the same core. That is the whole
point of the line, and it holds only for as long as core never names anything
inside here — a test enforces it: `tests/Feature/CoreSiteBoundaryTest.php`.

## What lives here

| | |
|---|---|
| `theme/` | the Blade templates for the public site, reached as `theme::layout`, `theme::entry` and so on |
| `routes.php` | routes this one site needs |

### The templates core expects

Core renders `home`, `module` and `entry` by name, and the contract test reads
that list out of core's own render calls so it cannot drift.

`layout` is not in that list because core never names it — the three templates
above extend it themselves. It is covered separately, by the test that asserts
the `theme::` namespace resolves at all. A theme needs all four.

Anything else a theme wants is its own business — a partial, an extra page
rendered from `routes.php`, whatever the design needs.

### Forms — read this before writing one

**Do not write `@csrf` in a form.** It is the one thing here that quietly costs
the page it sits on its cache: `PageCache` treats a CSRF token in the rendered
HTML as proof the page belongs to one visitor and refuses to store it, so the
busiest page on the site goes back to being rendered per request. That guard is
deliberate and stays — it is what stops a client page handing every later
visitor the first one's token — but it is not what a theme should be triggering.

Forms are submitted by `public/forms.js`, which core ships and which any form
opts into. The markup stays server-rendered, in the visitor's language; only
the submit is JavaScript:

```blade
@once
    <script src="{{ url('/forms.js') }}" defer></script>
@endonce

<form method="POST" action="{{ url('/' . $code . '/enquiries') }}"
      data-cms-form
      data-cms-form-sending="{{ __('Sending…') }}"
      data-cms-form-error="{{ __('It could not be sent. Please try again.') }}"
      data-cms-form-sent="{{ __('Thank you.') }}">

    <p  data-cms-form-status role="status" hidden></p>
    <ul data-cms-form-errors role="alert" hidden></ul>
    …
```

Only `data-cms-form` is required. The two slots are filled from the answer —
the endpoint's own confirmation wins over `data-cms-form-sent`, and the errors
are whatever the server refused with, already translated. `data-cms-form-error`
covers everything that is not a 422, because those messages come from the
framework and are English until TASKS.md #99 lands.

The script is served from a **fixed path and is not built**, which is why it is
in `public/` rather than here: a cached page is a file on disk, and a hashed
asset name baked into one disappears on the next `npm run build` while the page
pointing at it survives. See *Assets* below for the same question about CSS.

Nothing in `forms.js` knows what an enquiry is, so a newsletter box or a search
uses the same three attributes. `resources/js/public-forms.test.js` is its test.

### Modules arrive translated

`theme::home` gets `$modules` as a plain list, already resolved to the page's
language (#114):

```blade
@foreach ($modules as $module)
    <li><a href="{{ $module['url'] }}">{{ $module['name'] }}</a></li>
@endforeach
```

**Do not compose a module address in a template.** A module has a different
slug in each language and none at all in a language nobody has translated it
into, so `url('/' . $current->code . '/' . $module->slug)` produces addresses
that answer 404. Core decides which modules a page lists; the theme lays them
out.

`theme::module` titles itself from `$title`, which is the module's name in this
page's language. `$module->name` is the panel's name and is the same string in
every language.

### Routes

`routes.php` is loaded **before** the core pages, so a route here wins. That is
what makes a hand-written contact page possible where the generic entry page is
not enough. Routes declared here get the same `{language}`, `{module}` and
`{slug}` patterns core's do.

**Two addresses cannot be taken over**: the admin panel, and `/sitemap.xml`.
Both are declared on either side of this file, because Laravel loses a route in
two different ways — the first matching pattern wins at dispatch, and a later
identical URI replaces an earlier one in the lookup map. Declaring them twice
covers both.

`route:cache` freezes the file — run `route:clear` after editing it on a cached
deployment.

### Assets — not wired up yet

**A stylesheet or script placed here is not built and not served.** Vite's
inputs are `resources/css/app.css` and `resources/js/app.jsx`; nothing compiles
`site/`, and nothing under it is web-reachable.

Today the public layout carries a small inline `<style>` block, which is why
this has not mattered. It becomes real work in **#62**, when a bought theme
arrives with its own CSS: either add `site/theme` to the Vite input, or put the
theme's built assets under `public/` and reference them directly. Decide it
there rather than discovering it.

Tailwind is already told to scan `site/theme` (`resources/css/app.css`), so
utility classes written in these templates survive a production build.

## What does not live here

- **The public rendering machinery** — `app/Http/Controllers/Web`,
  `PageCache`, `EntryPresenter`. Those are the same for everybody, and they
  render whatever this theme provides.
- **`sitemap.xml`.** Its structure is fixed by sitemaps.org and by the hreflang
  work, not by anybody's design, and a theme that mangled it would break
  indexing silently. It is core: `resources/views/sitemap.blade.php`.
- **Domain modules** — bookings, invoicing, a catalogue. Those are written
  **once in core** and enabled per installation
  (`docs/TASKS.md` → Decisions, 2026-09-05). If a client needs one, it is core
  work, not work in this directory.
- **Content.** Modules and entries are rows, not files.

## The test to remember

`CoreSiteBoundaryTest` fails if anything in core names a path or namespace
inside `site/`, outside the two mount points that make this directory
reachable at all. When it does fail, the fix is almost never to loosen it: it
is that something client-specific has been written into core, where the next
client will inherit it.
