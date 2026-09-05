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
| `routes.php` | routes this one site needs, loaded after the core routes |

Assets belonging to the theme go alongside it when there are any.

## What does not

- **The public rendering machinery** — `app/Http/Controllers/Web`,
  `PageCache`, `EntryPresenter`. Those are the same for everybody, and they
  render whatever this theme provides.
- **Domain modules** — bookings, invoicing, a catalogue. Those are written
  **once in core** and enabled per installation
  (`docs/TASKS.md` → Decisions, 2026-09-05). If a client needs one, it is core
  work, not work in this directory.
- **Content.** Modules and entries are rows, not files.

## The test to remember

`CoreSiteBoundaryTest` fails if anything in `app/` names a path or namespace
inside `site/`. When it does fail, the fix is almost never to loosen the test:
it is that something client-specific has been written into core, where the
next client will inherit it.
