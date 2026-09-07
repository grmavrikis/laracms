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

Core may name the *location* of the site side in exactly three **files**, and
nowhere else: `config/site.php` holds the three paths — the theme, the routes
file and the theme's translations — `AppServiceProvider` registers the view
namespace and the JSON translation path from two of them, and `routes/web.php`
loads the third. They are config values rather than literals so a test can
point them elsewhere without rewriting the repository's own files. `tests/Feature/CoreSiteBoundaryTest.php`
fails if anything else in `app/`, `routes/`, `bootstrap/`, `config/` or
`database/` names it, checks that the theme provides every `theme::` template
core renders, and checks that the mounts actually work.

`site/routes.php` loads **before** the core pages so a client route can take
one over. The panel and `sitemap.xml` are the exceptions, and they are
declared on **both** sides of it: Laravel's dispatch picks the first matching
route, but its lookup map is keyed by URI, so a later identical path replaces
an earlier one. One position defends against one of those; both defend against
both. Core route
names are `web.*` — `site.` belongs to the client. **`sitemap.xml` is core**,
not theme: its shape is a protocol, not a design.

When that test fails, the fix is almost never to loosen it: it means something
client-specific has been written into core, where the next client inherits it.

### 2. The backend that carries the design (~9 files)

Read all of these before touching backend behaviour. They are small.

| File | Why it matters |
|---|---|
| `app/Services/SchemaRuleBuilder.php` | **The heart of the project.** Turns a Module's JSON schema into Laravel rules. Owns `SUPPORTED_TYPES`, requiredness, the two-level translatable rules, and the checks that reject contradictory validation. Most findings live here. |
| `app/Services/RichTextDocument.php` | Rich text is stored as a **Tiptap JSON document, never HTML**. This rebuilds every incoming document from an allowlist. Read the class docblock — it explains why. |
| `app/Services/RichTextRenderer.php` | The other half: document → HTML for public pages. Normalises first, escapes everything, returns an `HtmlString` so no template writes `{!! !!}`. Takes the language as a second argument — a translatable field holds a map, not a document. |
| `app/Services/StaticPages.php` | The public site is **files on disk**, served by Apache before PHP starts (#97). Replaced `PageCache`, which is gone. Addresses are composed from rows and re-checked here; a page carrying a CSRF token is never written. |
| `app/Services/Redirects.php` | An address that has moved answers 301 rather than 404 (#69). Called from the 404 in `bootstrap/app.php`, never a middleware, so a row can never hide a live page. Renames write their own rows in three statements whatever the catalogue; the client's old site is rows the agency writes by hand, matched decoded and optionally keyed by a query string. Nothing in a row is trusted: the destination must be a path on this site and the status must be a redirect. |
| `app/Services/SiteSettings.php` | What a client may change about their own site (#67). Declares the fields **in a Module schema's shape**, so `SchemaRuleBuilder` validates them; `config('site.*')` is the default for a key nobody has saved, never the answer for one that was. One row, fixed key. |
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
| `resources/js/lib/languages.js` | `getLangCode`, which language is the default, and `contentLangCode` — the content language a listing opens on, which **follows the panel's own language when the site has it** and falls back to the default when it does not (#116). |
| `resources/js/lib/modules.js` | Which name a Module shows in a given language, falling back to the panel's own (#114, #116). Two screens ask; while each held its own expression, one was missed. |
| `resources/js/lib/languageStore.js` | One `/api/languages` fetch per page load, shared by the five screens that want it. A rejection is not cached. |
| `resources/js/lib/moduleFields.js` | The rows of a module's field editor and the payload they become (#115). Pure, because three defects in this logic shipped in one commit while it lived inside a component. A row carries its own `locked`; ids come from the rows; a stored `select` option survives a round trip. |
| `resources/js/lib/i18n.js` | `t()` — the panel's strings. The catalogue is **injected by the server** into `window.miniCms`, never bundled, so a new language needs no rebuild. `translate` mirrors PHP's `strtr`: one pass, longest name first. |
| `resources/js/lib/api.js` | One axios client. `signIn()` owns the CSRF-then-credentials ordering; `uploadImage()` owns the upload contract, shared by both editors. |
| `public/forms.js` | **Not part of the bundle and not built.** The public site's only JavaScript: one submitter any theme form opts into with `data-cms-form` (#97). Tested by `resources/js/public-forms.test.js`, which loads the shipped file into jsdom. |
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
php artisan test                    # 502 tests
npm test                            # 214 tests
npm run build
php artisan schema:sync-field-types # after changing field type constants
php artisan pages:warm              # bake the public site to files (#97) - THE DEPLOY STEP
php artisan pages:flush             # empty it
php artisan pages:doctor            # is the web server actually serving them?
php artisan schema:doctor           # can the database and PHP hold what the code allows? (#98)
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

- **502 PHP tests, 214 JS tests**, all passing. Build clean.
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
- **Phase 1 is nearly done.** Landed: #68 (CHANGELOG §14), #55 (§15),
  #56/#57/#58 (§16), the whole of `## P0` (§17 and §19), #59 (§21), #60 (§23),
  #61 (§24), #66 (§25) and #67 (§26) — a gallery field, a Tiptap-to-HTML
  renderer, the three structural columns and their admin UI, the fourteen
  review findings against them, the public Blade site with its cache and
  sitemap, singleton modules, the core/site line, enquiries, and site
  settings.
- **`## P0` is closed.** It was fourteen findings against #56/#57/#58 and it
  outranked the MVP list until it was done; the three that were wrong in the
  browser (#75 reordering across pages, #76 a long `slugs` key answering 500 on
  MySQL, #77 a failed slug write destroying an entry's URLs) are fixed and
  verified live. Do not go looking for them.
- **Languages are added by the agency, with SQL, and that is deliberate**
  (`BUSINESS.md` §5, `TASKS.md` #52). Adding one is a **billable service**, and
  what enforces it is the *absence* of a write endpoint — there are no roles at
  all, so every signed-in person can do everything the API offers. **Do not
  give `LanguageController` a writer.**
- **#114 is in progress** — a Module had no translation at all, so
  `/fr/ypiresies/petit-dejeuner` carried a Greek segment in a French URL and
  the page was titled *Υπηρεσίες*. Step 1 (the data and the public side) is
  done; step 2 is the panel, step 3 is #69. **`modules.name` and
  `modules.slug` are now the panel's only** — everything a visitor reads comes
  from `module_slugs`, and a module untranslated into a language has no page
  there. Do not compose a module address from `$module->slug`. Steps 1 and 2
  are done, and **step 3 landed with them** (CHANGELOG §33): a rename now
  writes redirects for its listing and every entry page underneath it, so the
  old addresses answer 301 rather than 404. `PUT /api/modules/{module}` is the
  only thing that edits a Module,
  the slug is derived **per language from that language's own name** (`Str::slug`
  transliterates, it does not translate), and `LanguageController` now returns
  every language so the panel can translate into one the public site has not
  published. The screen is `ModuleTranslator` (*Rename* on a module row);
  `ModuleTranslations` is the per-language block, shared with the create
  screen. Step 3 is #69.
- **#115: a Module's schema is editable, additively.** Add a field, reorder,
  change `required`, `validation` or a select's `options` — all fine. Renaming,
  removing, retyping and **flipping `translatable`** are refused, because they
  reshape data already in `entries.data` and nothing migrates it. That settles
  *What does editing a Module mean for its Entries?* in `TASKS.md` → To
  discuss: **additive edits only**. `ModuleFields` disables the four on a field
  that already exists.
- **Then #98**, plus the review that keeps #96 open. Both were added on
  2026-09-05 at a stop the owner called, and recorded in `TASKS.md` →
  Amendments and → Decisions taken (2026-09-05, third). Read those before
  starting either; each rests on a decision that is not obvious from the code.
  **#67 is done** (CHANGELOG §26): site settings are one core table, not the
  singleton Module the item first described — core cannot read the notification
  address out of a row the client owns and could delete.
  - **#96 translated interfaces — both halves are built; the review is not
    done** (ARCHITECTURE §5a). Public: `SetLocale` from the address, `lang/`
    for core and `site/lang/` for the theme. Panel: `InterfaceLocales`,
    `users.locale`, a picker, and the catalogue **injected into the page** so
    a new locale needs no `npm run build`. Content languages are **rows**;
    interface locales are **files** — different axes, and they must not share
    the `languages` table.
    **What is left is #100–#110**. #99 and #109 are done (CHANGELOG §34):
    `lang/el/validation.php` carries the rules both surfaces use, and the
    enquiry form's field names come from `StoreEnquiryRequest::attributes()`
    so one declaration serves every locale. Read that section before touching
    translations — three of the tests that look like they hold this mechanism
    do not (#101, #102, #103).
  - **#97 static HTML pages — DONE** (CHANGELOG §27 and §28). The public site
    is written to `public/cache/{lang}/{module}/{slug}.html` and Apache serves
    it before PHP starts; `PageCache` is **deleted**. Commands: `pages:warm`,
    `pages:flush`, `pages:doctor`. **`pages:warm` is the deploy step** — a
    release that changes a template leaves every page on disk serving the old
    markup, and there is no expiry underneath; warming notices and rebuilds.
    Run the doctor after a deployment to a new server too, because a missing
    rewrite breaks nothing and silently sends every page back through PHP.
    **`schema:doctor` belongs in the same step** (#98): it refuses when a column
    is narrower than the rule that fills it, when a column an expectation names
    is not there at all, or when PHP's own upload limits are below what the
    panel accepts — none of which any test can see, because a constant does not
    alter a table that exists and nothing here edits a server's `php.ini`. Forms are a JS island (`public/forms.js`, `data-cms-form`), so
    **§25's rule is reversed on purpose**: a page with a form *is* baked. Do
    not put `@csrf` back into `site/theme/enquiry.blade.php` — and the guard
    that refuses to bake a page carrying a token is still there and still
    needed, for a client route rendering its own form. **The entry is saved
    before its slugs are replaced** in `EntryController::update`, and that
    order is what lets the observer read the old addresses; swapping the two
    lines leaves the old page on disk for ever. There is no TTL any more, so
    anything that changes a page must invalidate it.
  - **#98 one source for a number.** The enquiry field widths live in three
    unconnected places, two exactly at the column limit — #76 waiting to
    happen, invisible to SQLite.
  - #96 goes first: #97 bakes HTML and should bake translated HTML. #62 waits
    for both or it is built twice.
- **#36 is not next**, and neither is most of #36–#53, #78–#88's successors
  (#89–#95) included. They are recorded, real, and deliberately not being
  worked on. Grinding through them before the MVP ships is the most plausible
  way to spend three months and reach no client.

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

### What a human has and has not checked

**The panel has been clicked through**, as of 2026-09-05: the ↑/↓ controls
across a page boundary, the disabled states at either end, a text-only save
leaving a published entry published, and the create response carrying every
column. Two defects came out of that session which no test had caught — a
listing that showed the default language's text for an untranslated field, and
a `required` rule that demanded every active language (CHANGELOG §22).

**What still needs a person** is anything in a component rather than in a pure
helper. `TASKS.md` #94 records why: six defects in a row have been in the
wiring of `EntriesManager`, `EntryForm` and `EntriesTable` while the helpers
underneath them were well covered, and one was an assignment to a `const` that
the build and 155 passing tests both walked past. There is no component-test
harness. Ask the user to click, or expect surprises there first.

The public site was verified live over real HTTP against MySQL — routes,
hreflang, the draft that must not appear, and the cache surviving a row
rewritten behind the model's back.

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
