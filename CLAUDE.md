# Working in this repo

A Laravel + React mini-CMS. Users define **Modules** (content types with a
JSON field schema) and manage multilingual **Entries** against them.

It has a commercial purpose, and that purpose decides what gets worked on: it
feeds client websites for a one-person web agency, one installation per site,
first market tourist accommodation. See **Where we are** at the bottom, and
`docs/TASKS.md` → **The MVP**.

You are reading this because it loads automatically. It exists so a fresh
session can be useful in ten minutes without reading the repo.

**130 tracked files. About 25 are worth reading.** `vendor/` and
`node_modules/` are 179 directories of noise — never grep or read them except
to answer one precise question about framework behaviour.

---

## Read these, in this order

### 1. Orientation (always — ~15 min, and you are oriented)

| File | What you get |
|---|---|
| `docs/ARCHITECTURE.md` | How the system works **now**. Domain model, auth, schema→validation, rich text, slugs, pagination. Start here. |
| `docs/TASKS.md` | What is open. **Read its MVP section first** — it holds the definition of done, the phases, and the product decisions that govern everything else. The numbered code-review findings further down are mostly *not* being worked on. |
| `docs/BUSINESS.md` | Short. What is sold, for how much, what it costs to run, and how we know it works. **It outranks `TASKS.md` when the two disagree** — the goal is revenue, not a finished feature list. Read it before arguing that something should be built. |

That is enough to take instructions. Read the fourth when you need the *why*:

| File | What you get |
|---|---|
| `docs/CHANGELOG.md` | Why the code looks the way it does — 16 themed sections, each: what was wrong, what was decided, how it was checked. **Most entries are decisions, not fixes.** Skim the headings; read a section before changing what it describes. |

`README.md` is for a human running the app. Read it only if you need setup.

### 1a. The line through the middle (#61)

**`site/` is one client's; everything else ships to every installation.** The
theme lives in `site/theme` and is reached as `theme::layout`, `theme::entry`
and so on; `site/routes.php` holds anything that one site alone needs. Client
#2 is a copy of that directory against the same core — see `site/README.md`.

Core may name the *location* of the site side at exactly two mount points, and
nowhere else: `AppServiceProvider` registers the view namespace and
`routes/web.php` loads the routes file. `tests/Feature/CoreSiteBoundaryTest.php`
fails if anything else in `app/` or `routes/` names it, and also checks that
the theme provides every `theme::` template core renders.

When that test fails, the fix is almost never to loosen it: it means something
client-specific has been written into core, where the next client inherits it.

### 2. The backend that carries the design (~9 files)

Read all of these before touching backend behaviour. They are small.

| File | Why it matters |
|---|---|
| `app/Services/SchemaRuleBuilder.php` | **The heart of the project.** Turns a Module's JSON schema into Laravel rules. Owns `SUPPORTED_TYPES`, requiredness, the two-level translatable rules, and the checks that reject contradictory validation. Most findings live here. |
| `app/Services/RichTextDocument.php` | Rich text is stored as a **Tiptap JSON document, never HTML**. This rebuilds every incoming document from an allowlist. Read the class docblock — it explains why. |
| `app/Services/RichTextRenderer.php` | The other half: document → HTML for public pages. Normalises first, escapes everything, returns an `HtmlString` so no template writes `{!! !!}`. Takes the language as a second argument — a translatable field holds a map, not a document. |
| `app/Http/Controllers/Api/ModuleController.php` | Slug derivation (single-query collision resolution, length, format) and schema validation at creation. |
| `app/Http/Controllers/Api/EntryController.php` | Authorization calls, pagination, and where documents get normalised. Short. |
| `app/Policies/ModulePolicy.php` | 30 lines. Every authorization question in the app reduces to what is in here. |
| `app/Http/Requests/StoreEntryRequest.php` + `UpdateEntryRequest.php` | Nearly identical, ~30 lines each. `authorize()` runs before `rules()` — that ordering is deliberate. |
| `app/Http/Requests/Concerns/ValidatesStructuralFields.php` | The rules for the columns that are *not* schema fields: `status`, `sort_order`, per-language slugs. Shared by both Entry requests. |
| `routes/api.php` | The entire API surface, ~40 lines. Note `Route::scopeBindings()`. |
| `bootstrap/app.php` | Five deliberate middleware decisions with comments: `statefulApi`, `throttleApi`, `trustProxies` (env-driven, empty by default), `trimStrings(except: data.*)`, `redirectGuestsTo(fn () => null)`. Each fixed a real bug. |

Models (`app/Models/*.php`) are 15–30 lines each and hold no logic worth
reading up front. Read one when you touch it.

### 3. The frontend (~6 files)

The `lib/` helpers are pure functions and carry the interesting decisions:

| File | Why |
|---|---|
| `resources/js/lib/richText.js` | Document helpers + which field types are rich text. |
| `resources/js/lib/gallery.js` | List helpers for the `gallery` type. Pure; the editor holds no logic. |
| `resources/js/lib/entries.js` | The structural bits: statuses (generated), slug maps, and working out a new order. |
| `resources/js/lib/apiErrors.js` | Turns an axios rejection into wording. Used by all three forms. |
| `resources/js/lib/pagination.js` | Reduces Laravel's paginator envelope. |
| `resources/js/lib/languages.js` | `getLangCode` + which language is the default. |
| `resources/js/lib/api.js` | One axios client. `signIn()` owns the CSRF-then-credentials ordering; `uploadImage()` owns the upload contract, shared by both editors. |
| `resources/js/lib/fieldTypes.json` | **Generated** by `php artisan schema:sync-field-types`. Never edit by hand. |

Components, in order of how much they will surprise you:
`EntryForm.jsx` (largest — dynamic fields, translations, error display),
`EntriesManager.jsx` (fetching, pagination, language state),
`ModuleBuilder.jsx`, `EntriesTable.jsx`, `GalleryEditor.jsx` (several images
on one entry, alt text per language), `RichTextEditor.jsx` (Tiptap),
`Login.jsx`, `app.jsx`.

### 4. Tests — read one before writing one

`tests/Feature/` has 22 files, each named for what it pins — the suite is the
best description of intended behaviour. Read `EntryAuthorizationTest.php`
first: it documents the security model by attacking it. `ExampleTest.php` is
the Laravel default and covers nothing.

The schema rules are spread over six files that are easy to confuse:
`SchemaFieldTypeTest` (which types exist), `SchemaFieldKeysTest` (which keys
a field may carry), `SchemaValidationRulesTest` (the `validation` string vs
the type), `RequiredFieldTest` (the `required` flag), `SchemaFieldNamesTest`
(names must be unique) and `SchemaErrorKeyTest` (which request field a
complaint is reported against).

JS tests sit **beside** their source as `resources/js/lib/*.test.js`.

---

## Do not read

- **`resources/views/welcome.blade.php`** — **gone as of #59.** It held a full
  inlined Tailwind stylesheet and reading it once cost ~36k tokens. Mentioned
  only so nobody goes looking for it: `/` now redirects to the default
  language.
- **`vendor/`, `node_modules/`, `public/build/`** — noise. Exception: reading
  one framework file to confirm behaviour is good practice, and has caught
  real bugs here. Grep for the specific method, do not browse.
- **`config/*.php`** — stock Laravel. Open one only to check a specific value.
- **`database/migrations/`** — read only when changing schema.
- **`composer.lock`, `package-lock.json`** — never.

---

## Environment — hard-won, do not re-derive

- **The app is served by Laragon's Apache at `http://mini-cms.test`.** Not
  `php artisan serve`. `.env` sets `SANCTUM_STATEFUL_DOMAINS` with no `:8000`
  entry, so a `localhost:8000` origin is not stateful and login fails 401/419.
- **Database is MySQL** (`mini_cms`). Tests use SQLite in memory via
  `phpunit.xml`. **SQLite does not enforce `varchar` limits and MySQL does** —
  assert lengths directly rather than relying on the database.
- **Run PHP through PowerShell, not Bash** — `php` is not on the Bash `PATH`.
- **PowerShell mangles `|` and `$` inside arguments.** For anything
  non-trivial, write a `.php` script to the scratchpad and run that.
- **`Set-Content -Encoding utf8` adds a BOM.** It silently corrupted
  `app.css` here. Use the `Write` tool for files.
- **`composer` and `npm` exit 255 through PowerShell** when they write to
  stderr. That is not failure — check the output text.
- **`php artisan pail` cannot run on Windows** (needs `pcntl`). It is
  deliberately absent from the `dev` script. Do not add it back.
- **`AuthController::login` calls `session()->regenerate()`**, which rotates
  the CSRF token. Re-read the cookie after login when testing by hand.
- **PHPUnit 12: `@dataProvider` annotations are inert.** Use `#[DataProvider]`.

---

## Commands

```bash
php artisan test                    # 210 tests
npm test                            # 120 tests
npm run build
php artisan schema:sync-field-types # after changing field type constants
```

Checking the live app needs a session. This exact sequence works — the token
must be re-read after login, because logging in rotates it:

```powershell
$base = "http://mini-cms.test"
Invoke-WebRequest "$base/sanctum/csrf-cookie" -SessionVariable s -UseBasicParsing | Out-Null
$tok = [System.Net.WebUtility]::UrlDecode( ($s.Cookies.GetCookies($base) | Where-Object Name -eq 'XSRF-TOKEN').Value )
$h = @{ "Accept"="application/json"; "X-XSRF-TOKEN"=$tok; "Referer"=$base }
Invoke-WebRequest "$base/api/login" -Method Post -WebSession $s -Headers $h `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"password"}' -UseBasicParsing | Out-Null
$tok = [System.Net.WebUtility]::UrlDecode( ($s.Cookies.GetCookies($base) | Where-Object Name -eq 'XSRF-TOKEN').Value )
$h = @{ "Accept"="application/json"; "X-XSRF-TOKEN"=$tok; "Referer"=$base }
# now: Invoke-WebRequest "$base/api/modules" -WebSession $s -Headers $h -UseBasicParsing
```

Send Greek text as UTF-8 bytes or it arrives as `??????`:
`-Body ([System.Text.Encoding]::UTF8.GetBytes($json))`.

**Clean up anything you create.** Name probe modules `zz…` and delete them
through the API, or with a scratchpad script for what the API cannot remove
(there is no module-delete endpoint).

---

## How we work here

This is what the user expects; it has caught real bugs.

1. **Write the failing test first**, and confirm it fails *for the expected
   reason*. A test that never failed proves nothing. When a fix is structural,
   mutate the code afterwards to prove the test still bites.
2. **Verify live, not just green.** A passing suite is not proof the app
   works — several bugs here passed SQLite and failed on MySQL, or passed
   tests and failed in the browser.
3. **Check before claiming.** Do not assert something is pre-existing, safe,
   or unreachable without looking. `git log`/`git show` settles whether you
   caused a defect; say so plainly either way. Several review findings here
   were regressions from earlier work in the same session.
4. **Measure before optimising or refusing.** Two findings were closed by
   measurement showing the fix cost more than the problem. That is a real
   outcome — record it with the numbers.
5. **Stay in scope.** Log unrelated findings in `docs/TASKS.md` rather than
   fixing them inline. Exception: a one-line correction inside code you are
   already rewriting, or something that would ship the current change broken.
6. **Update the docs in the same change** — `TASKS.md` for status,
   `CHANGELOG.md` for a completed decision, `ARCHITECTURE.md` where behaviour
   changed.
7. **Never commit.** Supply the commit message; the user commits. Imperative
   subject under ~72 chars; body explains the **root cause** and why this fix;
   breaking changes get their own sentence; state what was verified; end with
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
8. **Reply in Greek.** Code, comments, docs and commit messages in English.

---

## Where we are

Started from a repo that would not boot (eight files of merge conflicts).
Worked through a prioritised list; every item is either done or recorded in
`CHANGELOG.md` with its reasoning.

- **210 PHP tests, 120 JS tests**, all passing. Build clean.
- **The project has a commercial goal as of 2026-08-30**, and it now decides
  what gets worked on. A multilingual CMS that feeds client sites, owned
  outright, for a one-person web agency: **one installation per client site**,
  first market **tourist accommodation** (apartments, small hotels, villas),
  budget about **€5/month**. Multilingual-by-data-model is the thing it already
  does better than a cheap WordPress build, and that market cannot work in one
  language.
- **`docs/TASKS.md` → The MVP is the governing section.** It carries a binding
  definition of done, four phases, and the decisions taken. Read it before
  proposing any work.
- **`docs/BUSINESS.md` carries the numbers**: €290 build and €25/month for the
  first ten clients (the discount is on the build only, **never** on the
  monthly), €800 + €30 after, one day per site from the fifth onward. The
  freelancer registration is already active, so the incremental cost is ~€6/month
  plus ~€300/year — **the first client makes it profitable.** The build fee is
  nearly a loss-leader; the €25/month annuity is the actual business, billed
  yearly in advance, and the ceiling on it is **support minutes per client**,
  not sales. The introductory price ends at the tenth deposit or 31 March 2027.
- **The selling season is November–March.** Greek accommodation owners work
  through the summer and buy in the off-season, so a month lost in autumn costs
  a season, not a month.
- **Phase 0 is done** (CHANGELOG §13): the seeder, rate limiting, and ownership
  dropped as the authorization axis — plus a login defect the tests turned up,
  where a correct password answered 500 from any non-stateful origin while a
  wrong one answered 401.
- **Phase 1 is half done.** #68 (CHANGELOG §14), #55 (§15) and #56/#57/#58
  (§16) have landed: a gallery field, a Tiptap-to-HTML renderer, and the three
  structural columns plus their admin UI. What is left of the phase is #59,
  #60, #61, #66, #67.
- **Next is not #59. It is `TASKS.md` → `## P0` (#75–#88)** — fourteen findings
  from a review of #56/#57/#58 on the day it landed, 2026-09-02. **Three are
  wrong in the browser now**: reordering on page 2 renumbers those rows over
  page 1 (#75); a `slugs` key longer than five characters answers **500** on
  MySQL (#76); and a failed slug write **destroys the entry's existing public
  URLs**, because `syncSlugs` deletes before it inserts with no transaction
  (#77). #59 is built on exactly those mechanisms, so it goes second.
- **#36 is no longer next**, and neither is most of #36–#53. They are recorded,
  real, and deliberately not being worked on. Grinding through them before the
  MVP ships is the most plausible way to spend three months and reach no client.
  **`## P0` is the one exception** and outranks even the MVP list.

### What #56/#57/#58 actually built — read this before touching an Entry

Four mechanisms, and each has a reason a fresh session will otherwise undo:

- **`sort_order` reads as `null` everywhere above the database.** The column
  defaults to the sentinel `Entry::UNPOSITIONED` (100000) and an Eloquent
  `Attribute` maps it to and from `null`. The sentinel exists so "unpositioned
  sorts last" is a plain indexed ascending sort; **a default of 0 inverted the
  intent** — setting an entry to position 1 pushed it *below* everything
  nobody had positioned. Do not "simplify" it back to 0, and do not let the
  sentinel reach JavaScript.
- **Entry statuses are generated into `fieldTypes.json`**, like the field
  types, so the panel never restates a PHP constant. `FieldTypeConsistencyTest`
  pins it. (#79 says the JS then reads them *positionally*, which quietly
  defeats this — fix that before adding a third status.)
- **Slugs are rows in `entry_slugs`, not a key in `data`**, with `module_id`
  copied onto them. Uniqueness is **per Module per language** — the module slug
  is already in the path, so `/el/rooms/about` and `/el/pages/about` are both
  legitimate. `Entry::forSlug($module, $lang, $slug)` is a scope so the public
  side composes `forSlug(...)->published()`.
- **Reordering is one request for the whole list**, `PUT
  /modules/{module}/entries/order`, routed **before** `{entry}` or the binding
  tries to resolve an Entry called "order". The ids arrive in the body where
  scoped binding cannot reach them, so that endpoint is the one place the
  Module is checked by hand.

### Not verified by a human yet

The API and models were verified end-to-end against the real MySQL database
(probe scripts, since deleted). **Nobody has clicked through the admin panel**
— the Publish buttons, the per-language slug inputs and the ↑/↓ controls have
never been exercised in a browser, because doing so needs a password typed into
a form. Ask the user to try them, or expect surprises there first.

**Decisions you must not re-open or contradict** (all in `TASKS.md` →
Decisions, with reasoning): Blade rather than React for public pages; single
tenant, so globally unique module slugs are *correct*; ownership is not the
authorization axis; structural fields (`status`, `published_at`, `sort_order`,
per-language slug) leave the JSON and become indexed columns; a "Module" is a
menu entry with a screen behind it, so bookings and invoices are hand-written
tables and **not** generated from a JSON schema; core and site are separated by
a directory line but not yet by packaging.

`TASKS.md` → **To discuss** holds three open questions and one settled: how
strict a module schema should be, what editing a Module means for its existing
Entries (deferred — only the master admin edits schemas, so it is a
hand-written migration for now), and how this becomes an eshop platform.
Whether `/` should exist is **settled**: it serves the site's home page.

Do not decide the open ones unilaterally. Commerce is the one thing that could
consume a year without producing revenue — it stays deferred until content
sites are earning.
