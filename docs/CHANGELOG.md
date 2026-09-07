# What was done, and why

A record of the work already completed, grouped by area rather than by date.
Open work lives in [`TASKS.md`](TASKS.md); how the system is put together is
in [`ARCHITECTURE.md`](ARCHITECTURE.md).

This exists because most of these were **decisions**, not just fixes. When
something here looks odd, the reason it is that way is written down — and if
it needs revisiting, the reasoning is what to argue with.

Each entry says what was wrong, what was decided, and how it was checked.

---

## 1. Getting it to run

### Eight files had unresolved merge conflicts

`Controller.php`, `bootstrap/app.php`, `routes/web.php`, `DatabaseSeeder.php`,
`app.css`, `vite.config.js`, `package.json`, `composer.json`/`composer.lock`
all still contained conflict markers. The app would not boot.

Resolved each by hand. `bootstrap/app.php` mattered most: the `HEAD` side
registered no `api:` routes at all.

### `composer run dev` killed itself on Windows

The script chained `php artisan pail`, which needs the `pcntl` extension.
It crashed on startup and `--kill-others` took the server, queue worker and
Vite down with it.

Removed pail. Also removed `php artisan serve`: `.env` sets
`SANCTUM_STATEFUL_DOMAINS` with no `:8000` entry, so a `localhost:8000`
origin is not stateful and login fails with 401/419. Laragon's Apache serves
the app at `mini-cms.test`, which matches `APP_URL`.

---

## 2. Authorization

### Any user could read, change or delete any other user's entries

`show`/`update`/`destroy` took `{moduleSlug}` from the route and ignored it,
calling `Entry::findOrFail($id)` directly. `index`/`store` looked the module
up without filtering by `user_id`. Both Entry FormRequests had `authorize()`
returning `true`. Sanctum established identity; nothing checked ownership.

Closed with two independent layers:

- **Scoped route model binding** (`Route::scopeBindings()`) — `{entry}`
  resolves *through* `$module->entries()`, so an entry in another module is a
  404 before any controller code runs. Every `Entry::findOrFail($id)` is gone.
- **`ModulePolicy`** — another user's module is a 403. Consulted from the
  controller for reads and deletes, and from `authorize()` on both
  FormRequests for writes, which runs *before* `rules()` so a module's schema
  never leaks to someone who cannot write to it.

Covered by `EntryAuthorizationTest`, including the exact original attack —
your own module slug plus someone else's entry id — and a happy-path test
proving the 403s are real policy denials rather than blanket auth failure.

Fixed in the same pass: the `DEBUG_PAYLOAD` log that dumped whole request
payloads; module lookup narrowed to slug-only (a live ambiguity — a module
with slug `"2"` coexists with the module of `id=2`, and the old
`orWhere('id', ...)` matched both); duplicate module lookups in the
FormRequests; and the entry routes grouped together.

### Unauthenticated `/api/*` answered 500 without a JSON header

Laravel redirects guests to a route named `login`, which an API-only app
never defines, so opening an API URL in a browser returned
`Route [login] not defined`.

The mechanism explains why the existing `shouldRenderJsonWhen(api/*)` did not
cover it: `Authenticate::unauthenticated()` builds the redirect **as an
argument** to the `AuthenticationException` constructor, so `route('login')`
threw before an authentication failure existed for the handler to render.

Fixed with `redirectGuestsTo(fn () => null)`, after checking the handler had
no `?? route('login')` fallback that would reintroduce it. Verified live: 401
with no Accept header, with `text/html`, and with `application/json`.

---

## 3. Rich text

### Stored HTML was never sanitized

The Tiptap editor produced HTML that was stored raw and rendered with
`dangerouslySetInnerHTML`. The editor is not a security boundary — the API
can be called directly.

The first attempt purified the HTML with HTMLPurifier. It worked, but it
meant accepting an open language and then trying to remove the dangerous
parts. **Replaced with the stronger option: store the editor's document as
JSON.** A document tree is a closed vocabulary — there is no `script` node
type — so unsafe constructs cannot be expressed at all. HTMLPurifier was
removed as a dependency and the app now contains no `dangerouslySetInnerHTML`
anywhere; the admin table renders a plain-text excerpt.

`RichTextDocument` rebuilds each incoming document from known node types,
marks and validated attributes. A closed vocabulary does not cover attribute
*values*, so those still get real checks: link `href` is parsed and
restricted to `http`/`https`/`mailto`, `target`/`rel` are set server-side
rather than taken from the payload, and depth and node count are capped.

Existing HTML was converted by `php artisan entries:migrate-richtext`,
verified with `--dry-run` first and idempotent on re-run.

Verified live: a document containing a `script` node, a `javascript:` link
mark and `textAlign: "evil"` stored only the paragraph with its `bold` mark
intact.

### `TrimStrings` ate the spaces around bold and italic text

A regression from moving to documents. Laravel's `TrimStrings` trims every
string in a request. While rich text was one HTML string that was harmless,
but a mark splits a sentence into separate text nodes whose *edges* hold the
spaces between words — `"Κάτι "`, `"έντονο"`, `" εδώ"` — so each node lost
its own padding and the words glued together on save.

`data.*` is excluded from trimming. Plain string fields are no longer
auto-trimmed either, which is the right default for a CMS: content is stored
as the author typed it.

### The legacy type aliases became unreadable

Collapsing `textarea` and `richtext` into `text` (see §4) broke any module
already declaring one, in two ways at once: entry writes threw "unsupported
type", and the rich-text migration selects fields through
`isRichTextField()`, so legacy HTML could not even be converted out.

The mistake was conflating two questions. What may be **created** is still
the eight types in `SUPPORTED_TYPES`. What may be **read** now also covers
`RichTextDocument::LEGACY_FIELD_TYPES`; the aliases only ever meant `text`,
so the rule builder normalises them. The module form is untouched.

---

## 4. Schema and validation

### An unrecognised field type silently became `string`

`rulesForType()` ended in `default => ['string']`, so a typo passed unnoticed
and the field was never really validated.

The fallback was hiding a live defect: `datetime` was accepted by
`ModuleController` but had no arm in the rule builder, so a datetime field
validated as a plain string and accepted `"definitely-not-a-date"`.

Introduced `SchemaRuleBuilder::SUPPORTED_TYPES` as the single list, which
`ModuleController` validates against via `Rule::in()`, so the two cannot
drift. `date` and `datetime` share an arm. An unrecognised type throws,
naming the field and the type. Dropped the unreachable `number`/`email`/`url`
arms.

### A field with *no* type still fell back to `string`

The half the previous item left: `$field['type'] ?? 'string'` never reached
the throw. Unreachable through the API, which requires `schema.*.type`, but
the seeder writes schemas with `DB::table` and a schema can be edited
straight in the database.

Dropped the default, after checking no existing module has a typeless field.
A missing type and a misspelled one now read differently, because they are
different mistakes: *"declares no type"* rather than
*"unsupported type 'null'"*.

### Custom validation rules could contradict the type

The `validation` string was merged into the type's rules unchecked, and it
went wrong two ways. **Impossible:** a `text` field validates as an `array`,
so adding `string` produced a pair no value can satisfy — every entry
rejected, with nothing saying why. **Quietly different:** `max:255` on that
field is applied to an array as a *count*, limiting the document to 255
**nodes** while reading as a character limit.

`assertCustomRulesFit()` rejects a rule that asserts a data type (the field's
`type` already decides that) and a size rule on rich text. `required` and
`nullable` are untouched; `max:60` on a `string` still works.

Checked at **module creation** rather than the first entry save, by having
`ModuleController` build the entry rules and discard them: a schema that
cannot produce rules is not a usable schema. Reusing the builder keeps one
definition of "usable".

### Unknown keys in a schema field were accepted silently

Laravel validates the keys it has rules for and ignores the rest, so
`requred: true` was stored and did nothing.

**Decision: reject them.** The trade-off flagged when this was logged — that
strictness would break a client sending extra metadata — turned out to be
hypothetical: `ModuleBuilder` sends exactly the six keys the controller
validates. A future key has to join the allowlist first, which makes the
contract explicit rather than costing anything.

Checked on `schema.*` rather than a named key, so the error points at the
offending field (`schema.1`) and lists every unknown key rather than the
first. Guards the API, not the database — a schema written with `DB::table`
still bypasses it.

### `required` was a dead key, and the box that worked was unused

The `required` key was written into schemas and never read. The only
mechanism that worked was typing the word into the free-text validation box —
which **no field in the database had ever done**. The intuitive mechanism was
dead and the working one unused.

**Decision: make the flag real.** `SchemaRuleBuilder` reads it,
`ModuleController` validates it as an optional boolean, and the module form
has a **Req** checkbox beside **Lang**. The validation box keeps everything
else, and writing `required` there still works. Setting both does not apply
the rule twice.

> ⚠ The seeded `projects.title` carries `required => true` and is now
> genuinely required — posting to `projects` without a title returns 422
> where it returned 201.
>
> **This does not work for rich-text fields.** See TASKS.md #36.

### A translatable field could never be optional

A translatable field produces two levels of rules — the map of language codes
and each value inside it — but only the inner level was built from the
field's configuration. The outer key was hardcoded `['required','array']`.

Both levels now follow the field's configuration.

> ⚠ Translatable fields with nothing configured were *accidentally*
> mandatory and are now optional. Requiredness is opted into.

### The frontend restated the type lists

Three lists — `SUPPORTED_TYPES`, the rich-text types, and the module form's
dropdown — were maintained by hand in two languages, and had already drifted:
the API accepted `textarea` and `richtext` while the form offered neither.

Two fixes, done together because the second removes the first:

- **Collapsed to `text` as the single rich-text type.** All three names
  behaved identically, and three dropdown entries doing one thing is worse
  than one. Verified first that no module used either alias.
- **The frontend no longer restates anything.**
  `php artisan schema:sync-field-types` writes `fieldTypes.json` from the PHP
  constants, and the JS imports it. Labels stay in JS, being wording; a type
  with no label gets its own name capitalised, so adding a type on the
  backend reaches the form without a second edit.

The drift check is a file comparison rather than a regex over JS source. Both
approaches rely on a test failing when things drift — the difference is only
whether reformatting a literal can break it. It fails with
*"fieldTypes.json is stale. Run: php artisan schema:sync-field-types"*.

---

## 5. Slugs

### A generated slug bypassed the uniqueness check

`Str::slug($name)` ran *after* validation, so the `unique:modules,slug` rule
never saw it — posting the same name twice returned 201 then **500** on the
database index.

Split the two cases, which are genuinely different requests: an **explicit**
slug that is taken stays a 422, because the client asked for that value; a
**derived** slug means "pick one for me", so a free one is chosen. A
punctuation-only name, which `Str::slug` reduces to `''`, falls back to
`module` — an empty slug would make the module unreachable, since the slug is
the route key.

Known limit, noted in the code: check-then-insert, so concurrent requests
could still race. The unique index stays the real guarantee.

### Two different slug algorithms, and the wrong one won

`ModuleBuilder.jsx` carried its own `greekToLatin`/`slugify` and *sent* the
result, so the frontend's version was stored and `Str::slug` never ran.
Measured against each other, they disagreed on 4 of 9 sample names:

| name | frontend | backend |
|---|---|---|
| Νέα & Ανακοινώσεις | nea-anakoin**o**seis | nea-anakoin**w**seis |
| Ψυχαγωγία | ps**ych**agogia | ps**ikhagh**oghia |
| Ξενοδοχεία 2026 | **x**enodo**ch**eia-2026 | **ks**enodo**kh**ia-2026 |
| Café Münchén | **caf-m-nch-n** | cafe-munchen |

The last is the worst: the map covered only Greek, so accented Latin was
stripped to hyphens.

Removed the frontend implementation rather than keeping two in sync. The slug
box is optional and blank by default. No live preview, because the only
honest preview would come from the backend — showing a locally computed guess
is what caused this.

### Overflow, falsy `"0"`, and no format check

Three defects found by review of the slug work:

- **`generateSlug` could exceed `varchar(255)`.** A 255-character name gave a
  255-character base, and a collision suffix made 257. The base is now
  shortened once, with room kept up front.
- **An explicit slug of `"0"` was silently discarded**, because `?:` treats
  it as falsy. Compared against `null` now.
- **No format validation.** `a/b` was accepted, and the slug is the route
  key, which matches a single segment — so the module could never be
  addressed. A regex now enforces the shape `Str::slug` produces. (Spaces and
  Greek were also accepted and turn out to be *reachable* once URL-encoded,
  so for those the rule enforces consistency rather than repairing breakage.)

### Collision resolution took one query per candidate

`products` taken, try `products-2`, taken, try `products-3` — the seventh
module of a name cost seven selects.

Now one: read the slugs sharing the base as a prefix and pick a free
candidate in memory. That needed a change of shape, not just of query — the
base used to be truncated *per candidate*, so candidates did not share a
prefix and no single `LIKE` could have found them.

---

## 6. Languages

### `/languages` was an inline closure

Moved to `Api\LanguageController::index`, so every endpoint is reached the
same way and the handler is somewhere a test can name.

Checked for a functional reason first and did not find one: closures are
often said to block `route:cache`, but it succeeded with the closure in
place. This was the stylistic cleanup it was filed as.

Added an explicit `orderBy('id')` — nothing observable changes, but the panel
displays the *first* language it receives, and leaving that to an unordered
query makes the default depend on the database.

### `is_default` was set and never read

The column was set — `en` is flagged — but the panel opened on whichever
language came first by id.

**Decision: honour the flag.** Done in the frontend rather than by ordering
the endpoint, so ordering and defaulting stay separate concerns; a list
sorted by name later should not silently move the default.

`lib/languages.js` carries that logic and absorbed `getLangCode`, which was
declared identically in two components.

> To open on Greek instead, move the flag rather than changing code:
> `UPDATE languages SET is_default = (code = 'gr')`.

> **Correction (2026-08-31).** "The column was set" described *this*
> development database, where the flag had been set by hand. **No code path
> writes it** — not the seeder, not an endpoint, not a migration beyond
> `->default(false)`. So on a fresh install nothing is flagged,
> `defaultLanguage()` falls through to the first language, and the decision
> above has no visible effect. Recorded as `TASKS.md` #49; the writer that
> fixes it belongs with #52.

---

## 7. The entries list

### Pagination existed on the server and nowhere else

`EntriesManager` read only `data` from the paginated response and discarded
the other twelve fields, so the table counted the rows it held and called
that the total, and nothing could reach past the first 15 entries.

`lib/pagination.js` reduces the paginator envelope; `EntriesTable` shows the
real total with Previous/Next and a "showing X to Y of Z" line. A page past
the end falls back to the last page. Creating an entry returns to page 1,
since the list is newest first; editing leaves the reader where they were.

**Found while testing it:** the ordering was not a total order.
`latest()` alone ties for entries saved in the same second, leaving the
database free to order them as it likes — which is how a paginated list
repeats or skips rows. Not hypothetical: 18 entries sharing a timestamp came
back *oldest* first. Added an `id` tie-break, rather than logging it, because
page controls over an unstable sort would be a feature shipped broken.

### A `lang` param was sent and never read

`index()` has no parameter for it — confirmed live, `lang=gr`, `lang=en` and
`lang=NONSENSE` returned byte-identical responses.

Removed rather than implemented. Language switching is deliberately
client-side: an entry carries every translation and the table picks one,
which is what makes switching instant. Filtering server-side would flatten
`title: {en, el}` to a single value, changing the response shape and breaking
both the switcher and the edit form, which needs every language at once.

The dead param had a real cost: the language was a dependency of the fetch
effect, so every tab switch refetched an identical response.

---

## 8. Errors the user can act on

### Every save failure read "Failed to save."

`EntryForm` collapsed everything into one `alert()`, discarding
`response.data.errors` — so the 422 naming the offending field was invisible
in the app and loud only for API clients.

`lib/apiErrors.js` now serves all three forms. Messages go where they belong:
those keyed to a field render beside that input (covering `data.title` and
every `data.title.{lang}`), and messages belonging to no field — a
schema-level complaint keyed under `data` alone — go to a banner, where they
would otherwise be dropped entirely.

The helper separates what the old code flattened: 401, 403, 404, 419, 5xx and
an absent response each get their own wording, since "please try again" is
useless advice for a 403.

### Every sign-in failure read "Invalid credentials"

The `catch` wrapped both the CSRF request and the login call, so a server
that was down, a 500, or a CSRF mismatch all read the same — a user would
keep retyping a correct password.

Confirmed live first: a wrong password returns
`401 {"message":"Invalid credentials"}`, a stale token returns
`419 {"message":"CSRF token mismatch."}` — two unrelated causes rendered
identically.

This needed one addition: the helper's default 401 wording is "your session
has ended", correct inside the app but wrong on the sign-in form, where a 401
*is* bad credentials. `errorSummary` takes per-status overrides, with a check
that the override does not leak into the other callers.

### Two axios instances

`Login.jsx` imported a bare `axios` alongside the configured client, purely
to reach `/sanctum/csrf-cookie`. `lib/api.js` now exports `signIn()`.

Three pieces of knowledge moved with it, none of which belong to a form: the
cookie endpoint sits **outside** `/api`, it needs the `baseURL` overridden
for that one call, and it must happen **before** the credentials are posted.
Verified what the ordering is worth: posting to `/api/login` without the
cookie returns **419**.

---

## 9. Editor appearance

### Headings all looked identical

Tailwind's preflight resets headings to `font-size: inherit`, and the `prose`
class that would restore them was inert: `@tailwindcss/typography` was in
`package.json` but never declared in the CSS, which Tailwind v4 requires.
`.prose` appeared zero times in the built stylesheet.

Purely visual — headings were always stored correctly as
`{"type":"heading","attrs":{"level":N}}`.

Enabling it then brought its article-reading rhythm along: line-height 1.75,
a 1.25em margin on every block, 2em above every H2. Tiptap starts a new
paragraph on each Enter, so that reads as huge gaps in a form field. Kept the
type scale and list markers, tightened the spacing.

---

## 10. Dead code removed

- **`App\Http\Controllers\EntryController`** — an empty resource stub beside
  the real `Api\EntryController` that every route uses.
- **`2026_07_14_191839_add_user_id_to_modules_table`** — a no-op duplicate of
  the migration that actually added the column. Deleted rather than kept as
  history, since it records none. Its row stays in the `migrations` table;
  checked first that `Migrator::rollback` skips a missing file with a warning
  rather than failing, and that `migrate:status` omits it.
- **`entry_translations` and `EntryTranslation`** — the translation model
  this CMS did not adopt. Row count checked first (**0**), since dropping a
  populated table would be unrecoverable. The *create* migration is
  deliberately kept: deleting a migration that has run elsewhere makes the
  schema history unreproducible, and a create-then-drop pair states plainly
  what happened.
- **`resources/js/app.js`** — three bytes of comment, and a Vite entry point
  emitting a 0-byte chunk on every build.

---

## 11. Tooling

### There was no JS test runner

Frontend changes were verified by `npm run build`, which proves the code
compiles and nothing else, plus throwaway node scripts deleted as soon as
they ran.

Vitest runs with `npm test`. `vitest.config.js` is deliberately separate from
`vite.config.js`, which Vitest would otherwise reuse — that one loads the
Laravel, React and Tailwind plugins, and the Laravel plugin expects a serving
application.

Checked the suite can actually fail: removing a single `.trim()` from
`docToText` turned 9 tests red.

**Still uncovered:** the components themselves. Rendering `EntryForm` or
`ModuleBuilder` needs jsdom, so the module form and the editor round-trip are
still verified by running the app.

### Dependency advisories

- **12 Composer advisories** across `guzzlehttp/guzzle` (one high:
  CVE-2026-69246) and `league/commonmark`. Cleared with a scoped update of
  six packages, all within their major version; `laravel/framework` did not
  move. Checked rather than assumed that nothing under `app/`, `routes/` or
  `resources/js/` references Guzzle, the `Http` facade or CommonMark.
- **2 npm advisories** in `postcss` and `nanoid`, pre-existing rather than
  introduced by the Vitest install. The dry run was misleading — it printed
  the *pre-fix* state after reporting a change — so the published versions
  were checked directly. Since postcss is the CSS pipeline, the build output
  was inspected rather than the build merely run: the `prose` rules,
  `.tiptap-editor` overrides, `mark` highlight and preflight all survive.

---

## 12. Accepted, not fixed

Recorded here rather than left in a task list, because the reasoning is the
useful part.

### Slugs are unique across the installation, not per owner

A user naming a module `Products` while another account holds `products` gets
`products-2`, and can infer the other exists. Modules are otherwise strictly
per-owner, so this is the one place cross-tenant state is observable.

**Accepted while there is one user** — there is nobody to leak to. Also
recorded in `ARCHITECTURE.md`, because whoever adds a second account needs to
see it: the fix is a composite unique on `(user_id, slug)` plus owner-scoped
route binding, and it is far cheaper before real accounts exist.

> **Superseded (2026-08-30) — do not apply the fix described above.** The
> product was decided to be single-tenant: one installation per client site,
> several users, one shared content space (`TASKS.md` → Decisions). A second
> account therefore *shares* the modules rather than partitioning them, which
> makes installation-wide uniqueness **correct** rather than a compromise. A
> composite unique on `(user_id, slug)` would allow two `products` modules on
> one site — the bug, not the fix. There is no cross-tenant leak because there
> are no tenants.

### The typography plugin ships to a page that does not use it

Measured: **12.3 kB raw, about 1.5 kB gzipped** of a 15.11 kB stylesheet.
`welcome.blade.php` loads it and does not use `prose`.

Both remedies cost more than the problem. Splitting the stylesheet per page
gives each its own bundle, but both need Tailwind's base, so visiting both
pages downloads ~144 kB instead of ~78 kB — optimising the placeholder at the
product's expense. Replacing `prose` with hand-written rules saves ~11 kB but
trades a maintained plugin for bespoke CSS covering headings, list markers,
blockquote and code, with real visual risk, for ~9% of one asset.

The cleanest resolution is not a CSS one — see **Should `/` exist?** in
`TASKS.md`.

> **Settled (2026-08-30), and it reverses this entry's premise.** `/` now
> serves the client site's home page, rendered in Blade, and
> `welcome.blade.php` is removed by `TASKS.md` #59. So the plugin stops
> shipping to a page that does not use it — the public pages render rich text
> (#55), and `prose` is precisely what they need. The measurement stands; the
> problem it measured disappears along with the placeholder.

---

## 13. Phase 0 of the MVP

The three items that blocked everything else, plus one defect the tests found
on the way. See `TASKS.md` → The MVP for why these three and nothing else.

### The seeder died before writing anything

`DatabaseSeeder` called `User::updateOrCreate` with no `use App\Models\User`.
In namespace `Database\Seeders` that resolves to `Database\Seeders\User`, which
does not exist — so `php artisan migrate --seed`, **step one of the README**,
ended in a class-not-found error. A fresh checkout could not be started, and
nothing covered the seeder at all.

**Decision: import it, and move the whole seeder onto the models.**
`DB::table()->updateOrInsert()` does not fill timestamps, so the seeded rows
had a null `created_at` — the column `latest()` orders by, which left them
sorting unpredictably against everything created afterwards. The models also
cast `schema`, so it no longer has to be hand-encoded.

Two things were wrong in the same method and are fixed with it:

- the language was seeded as `gr`; **`el`** is the ISO code for Greek, the
  example the migration itself gives, and the key translations are stored under
- no language was flagged `is_default`, so a fresh install had no default at
  all and the panel fell back to whichever row came first by id (#49)

Checked by `DatabaseSeederTest` — seven tests, including that the credentials
the README hands out actually sign in, and that running the seeder twice does
not duplicate anything.

### Nothing in the application was rate limited

Laravel puts a limiter in the `api` middleware group only when
`bootstrap/app.php` calls `throttleApi()`. It did not, and no route declared a
throttle of its own — so `/api/login` accepted unlimited password guesses as
fast as Apache would serve them. Having a single account makes that easier to
attack, not harder: there is only one email to guess against.

**Decision: a generous limit on the API, a tight one on signing in.**

- `api` — 120/minute per user or address. It exists to stop a runaway client,
  not to police ordinary use of the panel, where saving one entry is several
  requests.
- `login` — **5/minute keyed by email *and* address**, plus 20/minute by
  address alone. Keyed by email alone, an attacker working through addresses
  against one account would lock its real owner out of their own panel; keyed
  by address alone, working through many emails from one place would be missed.
  Both keys are needed and each covers the other's blind spot.

Checked by `LoginRateLimitTest`, including that the lockout holds even when the
correct password arrives after the limit — guessing until the right one lands
is the whole attack.

`throttleApi()` itself is covered by no test, because the login test passes on
the route-level throttle regardless. It was verified separately: `throttle:api`
is present in the group and both limiters resolve.

### A correct password answered 500 from anywhere but the panel

Found by writing the rate-limit test, not by review. `AuthController::login`
called `$request->session()->regenerate()` unconditionally, and Sanctum only
starts a session for an origin listed in `SANCTUM_STATEFUL_DOMAINS`.

From anywhere else — curl, another site, the test suite — a **correct**
password threw `Session store not set on request` and produced a 500, while a
**wrong** one produced a clean 401. That difference is readable straight off
the status code, so credentials could be confirmed without ever holding a
session.

**Decision: guard the regeneration with `hasSession()`.** It defeats session
fixation and stays, but only where there is a session to regenerate. Fixed here
rather than logged, because rate limiting the login while leaving an oracle
behind it would have shipped the change half-done.

### Ownership hid every module from the client's own staff

`ModuleController::index` filtered with `where('user_id', $request->user()->id)`
and `ModulePolicy` answered "does this user own this Module?".

Under the single-tenant model (`TASKS.md` → Decisions) that is the wrong axis:
one installation serves one site, Modules are created only by the master admin,
and the client's users are colleagues sharing one content space. The second
account the client is given would have opened the panel and seen **nothing at
all** — invisible only because there had never been a second account.

**Decision: any signed-in user reaches every Module.** `Module.user_id` stays
as a record of who wrote the row and stops being an authorization input. The
policy is kept rather than deleted: it is the one place every authorization
question passes through, and group permissions land there and nowhere else.

`EntryAuthorizationTest` used to pin the opposite model and was rewritten to
pin this one. The two boundaries that remain are tested unchanged and both
still hold: authentication, and the scoped route binding that stops an Entry
being addressed through the wrong Module — which, with ownership gone, is now
the only structural limit on which Entry a request can name.

**88 → 99 tests.**

### Three defects the review of the above found

A code review of this section's own commit. All three are in code it added,
and the first two are worse than what they replaced.

#### A non-string `email` made the login endpoint answer 500

The `login` limiter builds its key from `$request->input('email')`, and throttle
middleware runs **before** validation — so the value is whatever the client
sent. Casting an array to string raises a warning, Laravel promotes warnings to
`ErrorException`, and the only endpoint anybody can reach without signing in
answered **500** to a one-line request.

Confirmed live before the fix: `{"email":["a","b"],"password":"x"}` → 500, with
`ErrorException: Array to string conversion at AppServiceProvider.php:52` in the
log. Before rate limiting existed, that same body reached validation and
returned a clean 422 — so this section had introduced it.

**Decision: read the value once and key as empty unless it is a string.** A
non-string then falls through to validation and is refused there, which is what
should have happened all along. All three shapes — array, object, integer — now
answer 422 live.

#### Every visitor would have shared one rate-limit bucket behind a proxy

Both limiters key on `$request->ip()`, and no proxy was trusted anywhere, so
that is the address of whatever connects — the reverse proxy, once this is
deployed the way `BUSINESS.md` §4 plans. The 120/minute API limit would have
become 120/minute for the entire site, and one busy client would have locked
everybody out.

**Decision: `TRUSTED_PROXIES`, empty by default.** Deliberately *not* `'*'`,
because the wrong direction here is worse than the problem: trusting a proxy
that is not in front of the application lets anyone send their own
`X-Forwarded-For` and mint a fresh bucket per request, removing the limit
entirely. Set it only for a proxy that exists — `127.0.0.1` for nginx on the
same host — and it is documented in `.env.example`.

`test_a_forwarded_header_cannot_split_the_rate_limit_bucket` pins it. That test
passed from the moment it was written, so it proves nothing on its own; it was
**mutated to check it bites** — hardcoding `at: '*'` made the sixth attempt
return 401 instead of 429, which is exactly the evasion.

#### The seeder created a second default language

`Language::updateOrCreate` set `is_default => true` unconditionally. Exactly one
row may carry it, nothing in the schema enforces that, and `defaultLanguage()`
takes whichever `/api/languages` returns first.

So running `migrate --seed` — the README's setup step, and documented here as
re-runnable — against an install that already had a default left **two** rows
flagged and moved the panel to a different language. The working database has
`en` flagged, which is how this was noticed: the seeder was deliberately not run
against it during the live check.

**Decision: claim the flag only when no other language holds it.** A fresh
install gets a default; an existing choice is left alone. `test_it_is_idempotent`
could not have caught this — `RefreshDatabase` always starts from an empty
table, the one case where setting the flag unconditionally is safe.

**99 → 102 tests.**

### The rest of the same review

Eight more findings, none of them breaking anything today. Grouped because
they share one cause: this section's work moved a decision without moving what
guarded it.

#### Re-seeding overwrote content somebody had edited

`updateOrCreate` passes its second argument as *update* values, so every
re-seed reset the module's `name` and `schema` and switched a deliberately
disabled language back on. Resetting a schema is not cosmetic: any value
already stored under a field somebody added stays in `data` under a key the
schema no longer mentions, which is exactly the orphaning `TASKS.md` warns
about for renames.

`test_it_is_idempotent` counts rows, so it passed throughout.

**Decision: `firstOrCreate` everywhere.** These rows are a starting point, and
once an install exists they belong to whoever has been editing them. The seeder
now never overwrites; delete a row to have it seeded afresh.

#### Three guards that nothing would have missed

Each of these could have been deleted with a green suite:

- **`$this->authorize(...)` in `EntryController`.** The policy answers "yes" to
  everything, so no assertion against the real one can tell a route that
  consults it from a route that does not — and the seam group permissions will
  land on could have been tidied away as dead code before it was ever used.
  Now covered by swapping in a policy that refuses everything and asserting 403
  on all five entry routes.
- **`throttleApi()`.** Every rate-limit test passed on the route-level
  `throttle:login` regardless, so removing the call would have left everything
  except the login endpoint unlimited again. Now covered by asserting the
  `X-RateLimit-Limit` header is present — presence, not value, so the number
  stays free to change.
- **The `orderByDesc('id')` tie-break in `ModuleController::index`.** The only
  test listing several modules sorted the slugs before comparing, discarding
  the very thing the tie-break exists for. Now asserted in the returned order.

**All three passed the moment they were written, which proves nothing**, so
each was mutated to check it bites: removing the `authorize` call gave 200
instead of 403, commenting out `throttleApi()` dropped the header, and dropping
the tie-break flipped the listing to insertion order.

A fourth assertion was removed rather than fixed: `assertDatabaseMissing` for
language `gr` held on any empty table, since nothing in the codebase creates
that row — it would have passed with the seeder writing no language at all.

#### Three that only a reader would have noticed

- **`?:` where the repo had already decided on `??`.** `ModuleController`
  carries the reasoning in a comment — `"0"` is falsy in PHP, and a falsy test
  discards a value the client actually supplied. The rate limiter had
  reintroduced the pattern; a falsy identifier would key by address and merge
  that account's quota with every anonymous request from the same place.
- **A comment claiming more than its change delivered.** The `hasSession()`
  guard was justified by saying a 500-versus-401 difference is readable off the
  status code — but afterwards it is 200-versus-401, which is just as readable,
  and true of every login endpoint ever written. What the guard actually fixes
  is that the endpoint stops erroring; **the rate limit is what holds off brute
  force**, and the comment now says so.
- **`return true` three times in `ModulePolicy`.** Correct, deliberate, and
  indistinguishable from a stub somebody forgot to finish — which invites a
  "fix" that silently changes who can reach what. A named
  `ANY_SIGNED_IN_USER` constant carries the decision at the point of return,
  and records why both parameters stay unused: they are what the group check
  will ask about when it replaces the constant.

**102 → 106 tests.**

---

## 14. Several images on one entry

The first item of Phase 1, and a blocker rather than a feature: `image` holds
one URL and no field type repeated, so an entry could carry a single
photograph. For tourist accommodation that is the product missing — a room
needs eight to fifteen, and nobody books an apartment from one picture. The
"rooms" module built without a line of code in the existing builder and came
out unusable.

### The shape, and why it nests

```
data.photos = [ { url: '…', alt: { el: '…', en: '…' } }, … ]
```

**A gallery is never translatable, and refuses the flag.** Translations
otherwise live at `data.{field}.{lang}`, and a translatable gallery would
therefore store *a different set of photographs per language* — which nobody
wants. The photographs are one set; only their description differs.

So the translation sits one level down, on each image. This is the single place
in the schema where a per-language map appears anywhere but at
`data.{field}.{lang}`, and it is deliberate. Alt text had to be translatable:
selling multilingual SEO while shipping images whose alt text cannot be
translated would contradict the pitch.

Ticking **Lang** on a gallery is refused when the Module is created — where the
author is watching — rather than ignored. Silent acceptance is what this schema
has had removed from it repeatedly. The module form disables the checkbox too,
and clears it when a field's type is changed to gallery, so the form cannot
assemble a schema the API will reject.

### What the rules describe

```
data.photos       the list, from the field's own rules
data.photos.*     one image, an object rather than a bare URL
data.photos.*.url required
data.photos.*.alt optional, keyed by language code
```

Only these keys have rules, and Laravel keeps only what was validated — so a
key nobody declared cannot ride along into the JSON column. Verified live: a
smuggled `caption` did not survive the round trip.

Two things fall out of the shape rather than needing code:

- **`required` bites here**, unlike on a rich-text field (#36), because an
  empty gallery really is an empty array rather than a non-empty document.
- **Size rules mean what they say.** `max:5` counts images, which is what an
  author writing it intends — unlike rich text, where it would count document
  nodes and is refused for exactly that reason.

### The rest of it

`GALLERY_FIELD_TYPES` sits next to `SUPPORTED_TYPES` so there is one place to
look for what a type is, and `schema:sync-field-types` carries it to the
frontend like the others — `FieldTypeConsistencyTest` gained a check that every
gallery type is creatable, and that no type is both rich text and a gallery,
since the two editors would fight over the value.

The editor is its own component rather than more of `EntryForm`, which is
already the largest file in the app. It uploads several files at once through
the existing single-image endpoint, and does so with **`allSettled` rather than
`all`**: one rejected upload would otherwise discard every file that succeeded
alongside it. Reordering is up/down buttons — drag-and-drop is a great deal
more work for a list of ten.

`toGallery()` filters what it is given rather than trusting it. A schema can be
edited straight in the database, so a field that used to be an `image` still
holds a bare string, and spreading that would render one thumbnail per letter.

Verified live on MySQL: a module with a gallery field, an entry with three
images in order, Greek alt text surviving the round trip, and 422 for an empty
required gallery, an image with no URL, and a translatable gallery.

**120 PHP tests, 92 JS tests.**

### What the review of it found

Eleven findings, all fixed. Three were visible to a user, and the worst was
not in the editor at all.

#### The entries table showed `[object Object]`

`EntriesTable` had branches for rich text and for booleans, and a gallery fell
past both into `String(value)` on an array of objects. Every row of the first
market's central module read
`"[object Object],[object Object],[object Obj..."` in the photos column - the
only place a saved gallery appears outside the edit form.

**Decision: a `galleryPreview()` helper, and a count rather than thumbnails.**
The table renders it the way it renders `docToText()` for rich text. No
derivative images exist, so the stored file is the full upload: fifteen rows of
those would be tens of megabytes to draw a list. Thumbnails belong with the
media library, where the derivatives will.

#### Uploads discarded whatever was done while they ran

`handleFiles` closed over the list as it was when the handler was created, so
appending after the await overwrote anything changed meanwhile - a removed
image came back, typed alt text vanished. Uploading fifteen photos over a slow
connection is the intended use, so the window was wide.

Fixed by passing a function rather than a value, with `setStaticField`
applying it to the list as it stands. The synchronous handlers still pass
values; those are computed inside the event and cannot be stale.

#### A field changed from `image` showed empty, then failed to save

`toGallery()` defended what was drawn but not what was submitted, so an entry
saved before the type change showed "No images yet" over a photograph that was
still there, and saving returned a 422 that nothing on screen explained.

`fromStored()` now normalises on the way *into* the form and **carries a bare
URL over as the first image** rather than filtering it away - the photograph
survives the type change instead of being dropped and then overwritten.

#### Two fields could share a name, and nothing said so

Not a gallery problem, found through one. A name is the key its value is stored
under, so two fields sharing one fight over the same value: the later field's
rules replaced `data.{name}` while the earlier one's sub-rules stayed behind.
With a gallery first and a string second, the wildcards then expanded against a
string, matched nothing, and **the entry saved with the gallery rules doing
nothing at all**.

Refused now in `build()`, which is the one gate both module creation and entry
validation pass through. Checked first that no stored module has duplicates.

#### `build()` now knows which field to complain about — closing #39

Its three throws were keyed `schema` or `data` by guesswork, and `build()`
serves two requests that carry different fields. `TASKS.md` #39 recorded it;
the gallery added a fourth instance before it was fixed.

`build()` takes the attribute to report against: `schema` when a Module is
being created, `data` from the Entry FormRequests. #39 is resolved and removed.

#### The rest

- **A gallery was unbounded** - the first repeating type, so "how many" had no
  answer. A backstop of 100 images, applied only when the schema sets no
  stricter limit of its own, and 2048 characters on a URL that in practice is
  about fifty.
- **The upload contract had two copies.** `uploadImage()` in `lib/api.js` now
  owns the path, the field name and the multipart header, beside `signIn()`
  which owns the sign-in ordering for the same reason. #50 and #51 both change
  that contract, and the second copy is the one that gets missed.
- **The list key carried the index**, so moving an image re-keyed every one
  below it and React rebuilt those rows instead of moving them, losing focus in
  an alt box mid-edit. Keyed by URL alone; each upload is stored under its own
  generated name.
- **Gallery was only ever tested through POST.** An update carries a list that
  came back out of the database through the same rules; two tests now cover it.
- Field-kind predicates sit in two classes, and the rule is now written down
  rather than inferred: a predicate lives beside the constant that lists its
  types, which is why rich text's is on `RichTextDocument` - that class owns
  the readable-versus-creatable distinction and does the normalising.

**130 PHP tests, 104 JS tests.**

### Three more the next review found

The first two are in the fixes above, which is the point of running it again.

#### `min:1` removed the ceiling it was meant to sit under

`GALLERY_MAX_IMAGES` stood down whenever the schema carried a size rule, and
`SIZE_RULES` contains `min`. So writing *"at least one photo"* - the most
natural thing to put on a room's gallery - silently removed the upper bound.
Verified by building the rules: no validation gave
`[nullable, array, max:100]`, `min:1` gave `[nullable, array, min:1]`.

**Decision: ask for an upper bound, not for any size rule.**
`UPPER_BOUND_RULES` is `max`, `size`, `between` - a `min` is a floor and says
nothing about how many are too many. A schema naming its own `max` is an
explicit decision and still wins in either direction, which is what makes the
default a backstop rather than a policy. The docblock said "stricter" and the
code never checked that; both now say the same thing.

#### The editor's list key rested on an invariant nothing enforced

`key={item.url}` came with a comment asserting that two images in one gallery
cannot share a URL. True of anything the upload endpoint produces, and not
enforced anywhere - a hand-written payload was free to repeat one, and two rows
with the same key make React reuse the wrong node, so removing one image hits
the other.

`distinct` on `data.{name}.*.url` makes the comment true. One word.

#### A full gallery upload could exhaust the API rate limit

`GALLERY_MAX_IMAGES` (100) and the `api` limiter (120/minute) were set in
different pieces of work and never checked against each other, and **an upload
is one request per image**. That left about fifteen requests of headroom for
the panel's own traffic and the entry save that follows, so a second batch
inside the same minute began answering 429 - which reaches the author as images
that "could not be uploaded", reading as a problem with the files.

Raised to 300. Not chunked on the client: browsers already cap concurrent
requests per origin, so the count per minute was the constraint, not the
parallelism. `LoginRateLimitTest` now asserts the *relationship* rather than
the number, so raising either one without looking at the other fails there.

Also folded in: the rule-name parsing that `hasUpperBound()` and
`assertCustomRulesFit()` each did by hand is now one `ruleName()` helper, which
is where the comment about `explode`'s limit of 2 belongs.

**130 → 134 PHP tests.**

### And the eight the same review left

None user-visible; the first two were the only ones that could go wrong again
quietly.

**The #39 fix was held in place for one throw out of three.** `build()` has
five ways to refuse a schema, and the attribute-keying change touched all of
them, but only the gallery one had a test - `SchemaValidationRulesTest` asserts
`422` and never a key. Either of the other two could have been reverted to its
old hardcoded string with a green suite. `SchemaErrorKeyTest` now walks every
refusal `build()` can raise under both callers; mutating one throw back to
`'schema'` fails it with *"Reported against the wrong field when the caller
sent 'data'"*.

**A test was an exact duplicate of another.** Same module, same three images,
same assertion, a hundred lines apart - while its docblock claimed to cover
the interaction with the default ceiling, which it never touched. The two
tests written for the `min:1` fix cover that properly, so the duplicate is
gone.

The rest:

- **An upload that returned no URL was treated as a success**, becoming an
  image nothing can display and a list row keyed `undefined`. `uploadImage()`
  now rejects it, so both callers report it where they already report a
  refusal - one place, and testable, which the same check inside the editor
  would not have been.
- **`files.map(uploadImage)`** passed the index and the array as extra
  arguments. Harmless while the signature takes one, a silent wrong-argument
  bug the day it takes two. Wrapped in an arrow.
- **`api.js` had no trailing newline**, which is half of #45 and was free to
  fix while the file was open.
- **`GALLERY_URL_MAX_LENGTH` was protected** while its sibling was public, for
  no reason beyond which one a test happened to reference - and that test
  hardcoded 3000 rather than the constant. Both public, and the test uses it.
- **`assertNamesAreUnique()` guarded `is_array()`** where `build()`'s own loop
  does not. The guard bought nothing (`??` uses isset semantics, so a string
  offset by a non-numeric key is simply not set); removed, with the reason
  written down instead.
- **The findings list had an unexplained gap** where #39 had been. It now says
  which three numbers have left and why.

**134 → 142 PHP tests, 104 → 106 JS tests.**

---

## 15. Rich text reaches a page

`#55`, and the first item of Phase 1 that the public side actually needs: rich
text was stored as a Tiptap document and **nothing turned one into markup**.
The admin table rendered a plain-text excerpt and that was the whole of it, so
no rich text could appear on a client's site at all.

### The counterpart to the normaliser, not a second copy of it

`RichTextRenderer` **normalises before it renders**, rather than keeping its
own allowlist. That costs one walk of a small tree and buys two things: a
single definition of what a document may contain, and the guarantee that the
renderer only ever walks a tree already rebuilt from it. A document written
straight into the database, or stored before the normaliser existed, is
therefore no more dangerous than one saved through the API.

**Decision: the structure is safe by construction, the text is not.** There is
no node type in the vocabulary that could emit a script tag, so nothing needs
stripping afterwards. But text is stored **verbatim on purpose** - `<script>`
typed as text is content - so every string reaching the output is escaped, and
that is the one thing this class must never get wrong.

`ENT_SUBSTITUTE` is not decoration: without it `htmlspecialchars` returns an
**empty string** for malformed UTF-8, so one bad byte would silently delete a
paragraph rather than mangle a character of it.

### It returns an HtmlString, so no template writes `{!! !!}`

Blade renders an `Htmlable` unescaped from `{{ }}`, which means the claim that
this output is safe is made **once, here**, instead of at every call site. That
is the same reasoning that keeps `dangerouslySetInnerHTML` out of the React
side: the dangerous-looking construct should not be something a template author
types by habit.

### Checked by attacking it

Four of the twenty-one tests are attempts to get markup out: a script tag typed
as text, every character that matters, a quote trying to close an `href` early,
and a `javascript:` link. The escaping was then **mutated away** to prove they
bite - with `escape()` returning its argument the suite produces
`<p><script>alert(1)</script></p>` and an `href` broken open by
`onmouseover="alert(1)`, and all four fail.

Then rendered against the real database rather than only the fixtures. It
already held the attack: an entry in `test3` where somebody had typed
`<script>console.log('123')</script>` into the editor. It comes out as
`&lt;script&gt;console.log(&#039;123&#039;)&lt;/script&gt;`. Six stored
documents rendered, Greek text, headings, marks and alignment intact.

### Left deliberately

An empty document renders `<p></p>` rather than nothing. The normaliser's empty
document is one childless paragraph and that is what it is; whether a field
should have been empty at all is #36, not this class's guess. To ask whether
there is anything worth rendering, `RichTextDocument::toPlainText()` already
answers it.

**142 → 163 PHP tests.**

### What the review of it found

#### A translatable field rendered as an empty paragraph

`toHtml()` could not tell an empty document from the wrong shape, and a
translatable rich-text field holds a **map of language code to document** -
which is the common shape here: every rich-text field in the real database is
translatable. Handed one, the normaliser saw something that was not a document,
returned the empty one, and the page showed a blank section with nothing
anywhere to say why. The scratch script written to render real content had to
unwrap the map by hand, which was the same trap arriving early and going
unnoticed.

**Decision: take the language as a second argument, and refuse a map without
one.** `toHtml($value, $language)` renders that translation; a language nobody
has written yet is *data* rather than a mistake, so it renders empty. Passing
the whole map is a mistake in the template itself and now raises on the first
page load.

The language is **ignored on a field that is not translatable**, so a template
passes the language it is on without first asking which kind of field it has.
And only a map of *documents* counts: anything merely malformed keeps rendering
empty, because a template author cannot fix bad stored data by being shouted at
on a live page.

#### The two vocabularies could drift apart in silence

`RichTextDocument` decides what may exist; this class decides how it looks. The
lists have to name the same things and nothing checked that - a node type added
to the normaliser and not here fell through to a branch that returned an empty
string, so the content sat in the database and never appeared, with no
exception and a green suite.

This is the drift `FieldTypeConsistencyTest` exists to stop between the PHP
field types and their generated JS copy, and it was written because those two
had already diverged once.

**Decision: check the lists, and make the fallthrough throw.** `NODES` and
`MARKS` are public now - they are the vocabulary, not an implementation detail -
and the test walks both. The unknown-type branch raises instead of returning
`''`, so the drift cannot ship even if somebody deletes the test: silence was
what made it dangerous.

Proven by mutation in both directions: adding `'image'` to the normaliser alone
fails with *"Node type 'image' is kept by RichTextDocument but RichTextRenderer
cannot render it"*, and removing `underline` from the renderer alone fails the
same way for the mark.

**163 → 170 PHP tests.**

#### And the four the same review left

All coverage or naming; none changed behaviour.

**The Blade claim was asserted by a type check.** `assertInstanceOf(HtmlString)`
proves the return type, not that Blade honours it — that lives in Laravel's
`e()` helper, which nothing exercised. `Blade::render('{{ $html }}', …)` now
asserts both halves in one line: the `<p>` this class produced survives, and
the `<b>` an author typed stays escaped. Mutated to check it bites, and the
mutation had to be done properly — returning a plain string from a method
declared `: HtmlString` is a TypeError that fails every test and isolates
nothing. With the signature loosened too, the new test fails showing the
double-escaped output, which is the consequence the type check cannot show.

**`ENT_SUBSTITUTE` had never been isolated.** The earlier mutation removed the
escaping wholesale, and that test passed under it — the raw bytes still contain
both words — so its specific claim was unverified. It now asserts
`assertNotSame('<p></p>', …)` first, which is exactly what dropping the flag
produces, and fails with *"One bad byte emptied the whole paragraph."*

**Nested lists and `mailto`.** Both worked; neither was pinned. Nesting is where
a recursive renderer usually breaks, and `mailto` is a third of the scheme
allowlist and the only member that is not http-shaped. Removing it from
`LINK_SCHEMES` now fails one test and nothing else.

**`TAGS` read as a complete list of node types and was not one.** Renamed
`PLAIN_TAGS`, with the rule written down: types needing more than a tag —
`heading` builds its own, `codeBlock` wraps in two elements, `orderedList`
carries `start`, `hardBreak` and `horizontalRule` are void — live in
`renderNode()`. That is why `bulletList` is in the map and `orderedList` is not,
which reads as an omission until you know it.

**170 → 173 PHP tests.**

---

## 16. Structural columns: publication, order, and URLs

`#56`, `#57` and `#58` are one piece of work. All three are things that mean
the same for **every** Module and that routing, filtering and ordering run on -
so they are real indexed columns rather than keys inside `data`, which cannot be
indexed without generated columns. Content stays in the JSON.

### Everything was public the moment it was saved

No draft, no publication date, no Publish action: a half-written text was live,
which is the first call an unhappy client makes.

`status` is `draft` or `published`, and **new entries are drafts** - the safe
direction. `published_at` records when an entry *first* went out and is never
moved afterwards: editing a live entry, or republishing one that was pulled,
must not rewrite that history, and unpublishing keeps the record of what
happened rather than erasing it.

Rows written before the column existed are backfilled to `published` with
`published_at` from `created_at`. They *were* live - the site had no other
state - and marking them drafts would hide a client's content the moment public
pages arrive.

The admin listing keeps showing drafts. An author being able to see what they
have not published is the whole point.

### "These four rooms, in this order" could not be said at all

`sort_order` is ascending, so position 1 is the top of the page.

**The default is 100000, not 0**, and a test caught why. With 0, ordering
ascending meant that setting an entry to position 1 pushed it *below* every
entry nobody had positioned - the exact inverse of the intent. A sentinel
beyond any hand-set position keeps "unpositioned sorts last" true without a
computed `ORDER BY` that no index could serve, and positions are capped at it
so one can never sort after an unpositioned entry.

Everything starts unpositioned, so a Module nobody has ordered keeps its old
newest-first behaviour rather than being silently rearranged. The `id`
tie-break stays: entries saved in the same second tie on both other columns,
and without a total order a paginated list can repeat or skip rows.

### A public URL resolves an entry by a translated value

`/el/rooms/thea-sti-thalassa`. Inside `data` that would be an unindexed scan on
every page view of every page, so slugs are rows in `entry_slugs` with a real
index. **This is the storage complaint's valid core in miniature**: the rule is
not "everything in tables", it is *whatever you search by goes in a table*.

`module_id` is copied onto the row rather than reached through the entry, for
two reasons that both need it there. Uniqueness has to be per Module - the
module slug is already in the path, so `/el/rooms/about` and `/el/pages/about`
are different pages and both are legitimate. And the public lookup is then one
read of one index instead of a join.

`language_code` is a plain code rather than a foreign key, matching how
`Entry.data` keys its translations.

`Entry::forSlug()` is a **scope**, not a finder, so it composes: the public
side asks for `forSlug(...)->published()->first()` while a preview leaves the
second half off.

Sending `slugs` replaces the whole set, so a language left out loses its URL -
which is what "these are the addresses of this entry" has to mean. Leaving the
key out entirely changes nothing, so an update touching only `data` need not
restate them.

### Where the rules live

`status`, `sort_order` and `slugs` are not derived from the schema, so
`SchemaRuleBuilder` knows nothing about them: a `ValidatesStructuralFields`
trait describes them and both Entry requests use it, which also keeps the
slug-collision check from existing twice. Uniqueness is checked per Module and
per language - which `Rule::unique` cannot express, since the language is the
wildcard key and has to be read off the attribute name. The database index
stays the real guarantee; the check exists so an author gets a 422 naming the
language rather than a 500 from a constraint violation.

### Checked

173 → 205 tests, across three files named for what each pins.

Then the migration was run against an **exact copy of the real database** -
schema and all 23 rows - rather than an empty one, so the backfill was
exercised on content that exists: 23 rows to `published`, `published_at` taken
from `created_at`, both composite indexes present, and the unique index on
`(module_id, language_code, slug)`. The copy was dropped and the migration then
run for real.

Live afterwards: a draft defaulting correctly, a published entry stamping its
date and carrying two slugs, `published()` returning one of two, and
`forSlug('el', …)` resolving while the same slug under `en` does not.

### The panel

A **Publication** section in the entry form: Draft or Published as two
buttons, with the date it first went out shown beside them once there is one.
Below it an **Address** section - one slug box per language, because a language
left empty simply has no page in it.

**Reordering is in the list**, where the order is visible, rather than a number
box in the form. Up and down arrows on each row send **the whole order in one
request** to `PUT /entries/order`: a move is one round trip rather than two
writes that could half-fail and leave the list in an order nobody chose. The
ids arrive in the body, where the scoped route binding cannot reach them, so
that endpoint is the one place the Module is checked by hand - otherwise a
request could renumber another Module's entries through one it may write to.

The table gained a status badge, so a draft is obvious without opening it.

#### The sentinel does not leave the backend

`sort_order` reads as **`null`** everywhere above the database, through an
attribute that maps it to and from 100000. The sentinel exists so ordering
stays a plain indexed ascending sort; letting it out would have meant the panel
restating a PHP constant in JavaScript, which is exactly the drift
`fieldTypes.json` is generated to prevent. Verified on MySQL: the column holds
100000 while the model says null.

The status values are generated into that same file for the same reason, with
`FieldTypeConsistencyTest` checking they match `Entry::STATUSES`.

**Not done: slugs are typed, not suggested.** Deriving one from a title would
mean the backend knowing which field is the title, and it cannot be done in the
browser - `Str::slug` transliterates Greek differently from anything JavaScript
would, which was a real bug once (§5). Left for when the demo shows whether it
matters.

**173 → 210 PHP tests, 106 → 120 JS tests.**

### What the review of it found — fourteen, and this section is not finished

A review of this work the day it landed returned **fourteen findings**, kept in
`TASKS.md` as **#75–#88** under a `## P0` heading that outranks the MVP list.
This section stays as written because it records what was decided and why, but
**do not read it as a description of working code until that block is closed.**

Three are wrong in the browser:

- **Reordering renumbers only the ids it is sent** (#75). The table holds one
  page of fifteen, so a move on page 2 writes positions 1–5 over page 1's. Every
  ordering test sends the module's whole set, which is why the suite is green.
- **A `slugs` key is never validated** (#76). `language_code` is `varchar(5)`;
  a longer key answers **500** on MySQL. The suite runs on SQLite, which does
  not enforce varchar limits, so **no test could have caught it** — the trap
  CLAUDE.md already documents, walked into again.
- **`syncSlugs` deletes before it inserts, outside a transaction** (#77). A
  failed insert leaves the entry with **no URLs at all**, so a 500 during a save
  takes the live pages with it.

The other eleven are smaller: an accessor that returns 0 where it promises null
(#80), a 201 that omits the columns the database defaulted (#81), status
constants read out of the generated file **by array index** (#79) — which
quietly undoes the drift protection this very section claims — and a comment in
`EntryController::index` that still says the default is 0 (#83).

Three were verified live against MySQL rather than argued from reading. The
lesson worth keeping: **the tests being green was never the check.** Two of the
three serious findings are invisible to the suite by construction, one because
of the database it runs on and one because every test happened to exercise the
whole list.

---

## 17. The three P0 findings that were wrong in the browser

`TASKS.md` → `## P0` holds fourteen findings against §16, and three of them
were wrong in the browser rather than merely untidy. Those three are closed
here; the other eleven are not, and §16 still should not be read as a
description of working code until they are.

### Reordering renumbered only the ids it was sent

`PUT .../entries/order` writes positions `1..N` over exactly the ids in the
body, and its docblock said "the whole list". `EntriesTable` holds one page —
`paginate(15)` — so the panel could only ever describe fifteen of them. On a
module of twenty: order page 1 and those fifteen take positions 1–15; page to
the last five, press ↑, and they take 1–5. They now sort ahead of and
interleaved with page 1, in an order nobody chose.

The endpoint was not computing anything wrongly. **It was accepting a promise
the client could not keep**, which is why every test in `EntryOrderingTest`
passed: each one happened to send the module's whole set.

**Two answers were possible and the choice was a product decision.** Offsetting
by `($page - 1) * 15` is one line and wrong the moment a filter or a different
page size exists, and it cannot express a move across a page boundary at all.
The other is for the panel to describe the whole module. That was chosen, with
an addition: **the server now enforces it.**

- `GET /modules/{module}/entries/order` returns every id in listing order. One
  `select id`. A list somebody hand-orders is a menu or a set of rooms, so it
  is small by the nature of the thing.
- `PUT .../order` refuses anything that is not the complete set — a 422, not a
  silent rearrangement. That also covers a repeated id for free, since the same
  id twice would consume two positions and write one row.
- The panel fetches the order alongside the listing and moves within it, so the
  arrows now reach a neighbour on the previous or next page. `reorderedIds`
  takes ids and an entry id rather than a page of rows; `positionInOrder` tells
  each arrow whether it is at an end **of the module**, not of the page.

Enforcement is the part that matters beyond the fix. The completeness rule
makes the defect impossible to reintroduce quietly, and it gives the honest
answer when somebody else has added or deleted an entry meanwhile: the list
being described no longer exists, so refuse it rather than apply a stale order.

Both endpoints order through one `Entry::inListOrder()` scope, because the
arrows swap an entry with the row above it *on screen* — if the two ever
disagreed, a move would target a neighbour it is not next to. A test pins them
equal across two pages.

### A slug key was never validated, and MySQL answered 500

`ValidatesStructuralFields` validated every slug *value* — shape, length,
collision — and no slug *key*. `entry_slugs.language_code` is `varchar(5)`, so
`{"slugs": {"en-GB-oxendict": "probe"}}` passed validation and MySQL threw
`SQLSTATE[22001] 1406 Data too long`: a 500 where the author should get a 422.

The same hole in its other direction: `{"zz": "about"}` was accepted and
created a public URL in a language the site does not have.

The key is now checked for membership in the active languages, which closes
both — every code the site has fits the column, because `languages.code` is
`varchar(5)` too. It is written as a closure rather than `Rule::in` on
`slugs.*` because Laravel's wildcard reaches values, not keys.

**No test could have caught the first half.** The suite runs on SQLite, which
does not enforce varchar limits; the trap is recorded in CLAUDE.md under
Environment and was walked into anyway. What the suite *can* pin is the rule
that makes it unreachable, and that is what the new tests do — plus the
languages themselves, which `EntrySlugTest` now creates, because a slug key is
a language and the tests should say so.

### A failed slug write destroyed the entry's live URLs

`syncSlugs` runs `$entry->slugs()->delete()` and then creates the new rows,
with nothing wrapping the pair. "Sending `slugs` replaces the whole set" is the
intended behaviour, so the delete is right — but an insert that threw left the
delete committed on its own. An entry live at `/el/rooms/thea` and
`/en/rooms/sea-view` came back with **no URLs at all**: the author saw a 500
and two pages went dead. `store()` had the same shape one step earlier, the
entry row committed before the slugs, so a slug failure left a saved entry the
client was never told about.

`store()` and `update()` now wrap the entry and its slugs in one
`DB::transaction`. Fixing the key check removes the common trigger; it does not
make the sequence correct, and a race on the unique index still reaches it.

The tests force the failure **on the insert itself** rather than through a
particular constraint, because what has to hold is "the write happens whole or
not at all". Every collision the request rules already catch never reaches the
write, so testing one of those would have passed without the transaction.

### Checked

Failing test first for all three, each confirmed to fail for the stated reason
— the subset returning 204, the over-long key returning 201, the entry coming
back with `[]` where two URLs had been. Afterwards the fixes were mutated back
out one at a time: removing the completeness rule, the ordering scope, the key
check and the transaction each failed the tests that name them, so none of the
eight new tests is decorative.

221 PHP tests, 122 JS tests, build clean.

### Verified live against MySQL

Laragon was down when the fixes landed, so this was done once it was up, on
2026-09-04. Requests were dispatched **through the HTTP kernel in-process**
rather than over HTTP, because `mini-cms.test` is served by Laravel Herd's
nginx on this machine and answers "Site not found" — the connection under test
is the dev `mini_cms` MySQL one either way, which is the whole point.

- **#76, the half no test can reach.** A raw insert of a 14-character
  `language_code` answers `SQLSTATE[22001]: 1406 Data too long` on MySQL — the
  error the review reported, reproduced. The same key through `POST /entries`
  now answers **422**: `'en-GB-oxendict' is not one of this site's languages.`
  `{"zz": "about"}` likewise; an active language still returns 201.
- **#75.** Nineteen entries over two pages. `GET .../order` returned all
  nineteen. Sending only the page-2 tail — four ids — answered 422 and left
  every entry unpositioned. The complete set reversed answered 204, read back
  reversed, and the listing across both pages matched the order endpoint id for
  id. A duplicated id answered 422.
- **#77, both ways round, on InnoDB.** With the transaction: the forced insert
  failure returns 500 and the entry keeps `{"gr":"zz-live-url"}`, with no
  transaction left open. With the transaction mutated out and nothing else
  changed: the same 500, and the entry's slugs come back **`[]`**. The defect
  reproduces on the real engine, and the fix is what stops it.

The probe module was removed and no rows were left behind.

**What the probe turned up on the side** is recorded as `TASKS.md` #89: this
database's Greek is coded `gr`, not `el`, and the default language is English.
The code is doing as it is told — the language list has no write API (#52), so
it is whatever was typed into MySQL by hand. It is worth settling before #59
turns the code into the first segment of every public URL.

---

## 18. Greek is `el`, and it is the default

Found while verifying §17 against MySQL, and settled before #59 rather than
after. The dev database held `gr`, `en`, `fr`, with **English** flagged as the
default.

`gr` is not the code for Greek. ISO 639-1 is `el`; `gr` is the ISO 3166 code
for the *country*. This was never a code defect — the seeder writes `el` and
carries a comment saying why, `DatabaseSeederTest` asserts it, and the
languages migration gives `el` as its own example. Only the database had
drifted, which is exactly what #52 predicts: with no write API for languages,
the list is whatever somebody typed into MySQL by hand.

### Why it could not wait

The language code stopped being cosmetic when §17 landed. It is now the
**key of a slug**, validated against this table, and #59 is about to make it
the **first path segment of every public URL**. A demo site would have shipped
`/gr/rooms/…`, with `hreflang="gr"` — not a valid value, so search engines
ignore it. Changing that after launch breaks every indexed link.

The cheapest moment was this one: `entry_slugs` was empty, so not one public
URL existed yet.

### It was not three lines of SQL

`entry_slugs` was empty, but **23 entries carried `gr` as a translation key**
inside `data`. A blind search-and-replace over the JSON would have been wrong:
`gr` is a plausible *value* as well as a key, and a Tiptap document is full of
short keys — a first scan turned up `type`, `text`, `level` and `iii` alongside
the real language codes.

So the rename is driven from each **Module's schema**, which knows the only two
shapes that carry a language key:

```
translatable field   data.{field}.{lang}
gallery alt text     data.{field}[].alt.{lang}
```

The value under the key is never inspected — it may be a string or an entire
Tiptap document, and neither needs touching. Run as a dry run first, it
reported the same 23 entries the blind scan had found: no more, which would
have meant over-reach, and no fewer, which would have meant a missed shape.

Greek was flagged default in the same transaction, with every other row
cleared, because nothing in the application enforces "exactly one default"
(#49) and doing it in two statements could leave two.

### Checked

`mysqldump` of `entries`, `languages` and `entry_slugs` taken first. Afterwards:
zero entries hold a `gr` key and 23 hold `el`; exactly one language is flagged
default and it is Greek; `GET /api/languages` returns `el` first with
`is_default: true`; a sampled entry's rich-text document is intact under its
new key. A slug written in `el` is accepted, and one written in `gr` is now
refused by §17's own rule — `'gr' is not one of this site's languages.`

There is no artisan command for any of this. Editing languages is a hand-run
script by design until #52 gives them a writer.

---

## 19. The other eleven from the same review

§17 closed the three findings that were wrong in the browser. These are the
remaining eleven, and with them `TASKS.md` → `## P0` is finished and #59 is
next.

They are smaller, but two of them are the same *kind* of defect as the three:
something that is correct only by accident and fails silently when the
accident stops holding.

### The two that were waiting rather than broken

**Statuses were read out of the generated file by array index** (#79).
`fieldTypes.json` exists so the panel never restates a PHP constant, and
`entries.js` then took `STATUSES[0]` and `STATUSES[1]` — which is a positional
read of a generated list, and **reintroduces the exact drift the file
prevents**. Add a third state at the obvious place,
`['draft', 'scheduled', 'published']`, and `FieldTypeConsistencyTest` still
passes, the build still succeeds, and `STATUS_PUBLISHED` silently becomes
`'scheduled'`: the Publish button writes the wrong status and every badge is
mislabelled.

The generator now emits a map keyed by the value itself, so the panel looks a
status up by name and a key that moved is `undefined` — loud, at the point of
use. Mutating the generator back to a list fails four tests.

**The `sortOrder` accessor cast before it compared** (#80). `(int) null` is 0,
0 is not the sentinel, so an Entry that had never been saved read as position
**0** — "pinned to the top" — where the docblock promises `null`. That is the
inversion the sentinel was introduced to prevent, waiting for the first code
that builds an Entry before saving it. The check for `null` now comes first.

### Bounds that admitted the values they guard

`sort_order` was capped at `Entry::UNPOSITIONED` **inclusive** (#82), so a
client could send 100000, receive a 200, and read the entry back as `null` — a
position that silently became "no position". The floor was `0` while every
comment in the code, and `reorder` itself, starts positions at 1. Both bounds
are now exclusive of what they guard: `1` to `UNPOSITIONED - 1`.

### One resource, three shapes

`store()` returned the model straight from `create()`, which never reads the
row back (#81). The 201 therefore omitted `sort_order` and `published_at`
entirely and carried `status` only when the client had happened to send one —
so a panel creating an entry read `status` as `undefined` and showed Draft
whatever the database had chosen. `show()` loaded `slugs`; `store()` and
`update()` did not. All three now answer through one `asResource()`.

### Correct only because a column does not exist yet

`scopePublished` filtered a bare `status` (#87), while `scopeForSlug`'s own
docblock advertises `forSlug(...)->published()` — a where clause against a
joined query. It works only because `entry_slugs` has no `status` column
today. Add one — a per-language publication state is the obvious next request
for a multilingual CMS — and every public lookup becomes
`ambiguous column 'status'`, failing in the read path rather than where the
column was added. `entries.status` costs nothing. The test asserts the
compiled SQL, since the column cannot be added from a test.

### Measured, not asserted

**Reordering was 32 queries for one swap** (#84): one `exists` per id and one
`UPDATE` per id. Existence is now the completeness rule's job — it already
compares the body against the module's own ids, so nothing foreign survives it
— and the write is a single `CASE`. **Measured at 3**, one of which is
resolving the module by slug. `Entry::MAX_REORDER` caps the array at 1000,
which is also an honest ceiling on how large a list can be and still be
hand-ordered.

**`slugFor` lazy-loaded the relation per model and per call** (#85). Fifteen
entries with a link each was fifteen `SELECT`s, thirty with hreflang
alternates. `Entry::withSlugs()` makes it two, whatever the row count, and
`slugFor` on an unloaded model now asks for the one value instead of pulling
every slug into memory. This is the read path #59 is about to build on, which
is why it was worth doing before rather than after.

**#88 was measured and found not to matter.** `attributes()` and `syncSlugs()`
each called `$request->validated()`, and the finding described that as walking
the full rule set twice. It is a re-*extraction*, not a re-*validation*: on a
schema of eight fields in three languages — 17 rule attributes — a second
`validated()` costs **133 microseconds and zero queries**. The refactor was
kept because passing the array down is plainly simpler than passing the
request to two methods that each unpack it, not because it bought anything.
Recording the number is the point: the finding overstated the cost.

### The panel

**Rapid clicks raced on a stale list** (#78). `handleReorder` had no in-flight
guard and the arrows stayed enabled, so a second click computed its order from
the list the first `PUT` had not yet refreshed — it sent the same swap again,
the row moved one place instead of two, and out-of-order responses could leave
either state on screen.

The review offered two remedies: disable the controls while a request is in
flight, **or** apply the order locally so the next click computes from it. The
first was written and then thrown away after a human tried it, because it fixes
the race by removing the clicks — pressing the arrow three times quickly still
moved the row one place, having silently discarded the other two. That is the
symptom the finding itself describes, left in place.

What shipped is the second, with the serialisation the first was reaching for:

- the move is applied to the id list at once, so the next click computes from
  the order being written rather than the one on the server, and `sortByOrder`
  puts the visible rows in that order so the row moves under the cursor;
- `createLatestWriteQueue` keeps exactly one request in flight and **coalesces
  what arrives behind it**. It can coalesce because each payload is the whole
  order rather than a description of one move, so an intermediate order is
  already superseded by the next one. Three quick presses are two requests and
  three places moved.

A failure drops the queue and reverts to the last order the server confirmed:
anything waiting was computed on top of an order that was refused, so writing
it would build on a state that never existed.

**Saving could silently revert a publish** (#86). `EntryForm` included
`status` in every payload, taken from what it loaded when it opened. An author
opens a draft to fix a typo; the entry is published from somewhere else
meanwhile; the author saves, and the form writes `status: 'draft'` over it —
the live page disappears with nothing said. The rules are `sometimes`, so
omitting the key is already how "I did not change this" is expressed. On create
it is always sent: there is nothing to revert and the author has just chosen
it.

### And a comment that lied

`EntryController::index` still said "Everything starts at 0" (#83), while the
migration in the same commit defaults `sort_order` to 100000 and explains at
length why 0 was wrong. The next reader who trusted it would reason about
ordering backwards — precisely the mistake the sentinel prevents.

### Checked

Failing test first for each finding that can carry one, then every fix mutated
back out and the tests that name it confirmed to fail:

| Put back | Failed |
|---|---|
| #79 generator emits a list | 3 JS tests + `FieldTypeConsistencyTest` |
| #80 cast before compare | `test_an_unsaved_entry_has_no_position` |
| #81 return the model from `create()` | all three shape tests |
| #82 bounds back to 0 and the sentinel | both bound tests |
| #84 one `exists` and one `UPDATE` per id | the query-count test |
| #85 `withSlugs` eager-loads nothing | the read-path test |
| #86 status always sent | the payload test |
| #87 bare `status` | the SQL test |
| #78 the queue sends every push straight away | 3 queue tests |
| #78 `sortByOrder` does not sort | 3 of its tests |

**One mutation did not bite, and the code changed rather than the claim.** The
queue's failure path cleared what was waiting inside a `catch`; putting that
back changed no test, because a rejection leaves the drain loop anyway and the
next `push` overwrites the slot regardless. It was dead defensiveness, so it
became two lines in the `finally` with a comment saying exactly that. Recording
it matters more than the code did: a mutation that bites nothing is either a
missing test or an unnecessary line, and pretending otherwise is how dead code
accumulates behind a green suite.

**What still has no automated cover** is the wiring inside `EntriesManager` —
there is no component-test harness in this repo, so the queue is tested as a
pure module and the component that uses it was checked by hand in the browser.

All five browser checks were run by a human and passed: a move crossing a page
boundary in both directions, the arrows knowing the ends of the module rather
than of the page, a text-only save leaving a published entry published, and the
201 carrying all nine keys.

236 PHP tests, 138 JS tests, build clean.

**`## P0` is closed. #59 is next.**

---

## 20. Four the review of §17–§19 found

A review of this week's own work, run against `60fa687..HEAD`. Two of the four
are real defects a user would hit; the other two are limits that behave badly
at the edge.

### The form deleted URLs it was never asked to touch

`entryPayload` always included `slugs`, taken from what the form loaded when it
opened — **the identical defect §19 had just fixed for `status`, one line
above it and missed.**

Author A opens an entry to correct a typo. Author B adds a French slug
meanwhile. A saves without touching a slug box; the payload restates
`{el, en}`; `syncSlugs` deletes all three rows and writes back two. The French
page 404s and neither author is told.

Both fields now leave the payload when the author did not change them. The
comparison is made **after** normalising, so trailing whitespace and a cleared
box are judged as what would actually be written rather than as what was typed,
and the key order the form happens to produce does not count as a change.

That this was missed the first time is the interesting part. §19 fixed
`status` because the finding named `status`; the same reasoning applied
unchanged to the field on the next line, and nobody followed it there.

### A failed reorder left the panel unable to recover

`handleReorder`'s catch reverted to the last confirmed order and stopped. The
most likely rejection is the completeness rule reporting that somebody else
added or deleted an entry — its message ends "Reload the list and try again" —
and the panel never reloaded: it kept the ids the server had just refused, so
every later move failed identically, with no way out but leaving the module.

The catch now refetches as the success path does.

### A module too large to reorder still offered the arrows

`max:Entry::MAX_REORDER` caps the request while the completeness rule demands
the module's whole set, so past a thousand entries reordering is impossible by
construction. `GET .../order` still returned every id, so the arrows rendered
enabled and answered 422 on every click with nothing to explain why.

The endpoint now answers `{"ids": [], "reorderable": false}` above the cap. An
empty list disables the arrows on its own; the flag is there so the panel can
say *why* rather than looking like an empty module.

### Reordering restamped every entry in the module

`Eloquent\Builder::update()` adds `updated_at`, so moving one row rewrote the
modification time of all of them. Not a regression — the per-row loop §19
replaced did the same — but the single statement cemented it, and **#59 is
about to key a public page cache on that column**, where one reorder would
invalidate every page in the module. It also made "last modified" meaningless
to the author.

The write goes through `Entry::withoutTimestamps()`.

### Checked

Failing test first for the three that can carry one; the timestamp test failed
by exactly the minute the test travelled, which is what proved it was measuring
the restamp rather than the clock.

Confirmed live against MySQL: an update omitting `slugs` returns both URLs
intact, a reorder leaves every `updated_at` unchanged while writing positions
1–5, and a module of 1006 entries answers `reorderable=false` with no ids.

239 PHP tests, 143 JS tests, build clean.

**The panel wiring still has no harness.** The failed-reorder recovery is
verified by reading, like #78 before it — reproducing it needs a second client
deleting an entry mid-flight.

### And four the cloud review of §20 found

Twenty-nine agents over the four fixes above. One was a real defect **created
by one of them**; the other three were quality.

**The error banner appeared for one frame.** The refetch added to
`handleReorder`'s catch was the fix for a stuck panel — and the entries effect
it triggers opens with `setError(null)`. So the message announcing the failure
was cleared by the very refetch that announced it, one commit after being
added.

The two concerns were sharing one `error` variable: the listing clears it on
every run by design, and the reorder path deliberately causes a run. Splitting
them into `error` and `orderError` makes the collision impossible rather than
merely fixed. The message now also says the list was reloaded, since it was.

**`reorderable` was returned and never read.** §20 justified the flag with
"the flag is there so the panel can say *why*" — and the panel read only
`ids`, so an oversized module still looked like an empty one. It is now read,
and the table says the module is too long to order by hand. A claim in a
changelog is not an implementation.

**`order()` still hydrated every id before counting them.** The cap was added
to stop oversized modules being reordered, and the query that decides it had
no limit — so a module of fifty thousand pulled fifty thousand ids on every
listing load, to discard them and return `[]`. One id past the cap answers both
questions, so the query takes `limit(MAX_REORDER + 1)`. A test asserts the
compiled SQL carries a limit, and removing it fails that test.

**`initialSlugs` was rebuilt on every render** rather than captured once like
the `slugs` state beside it. Harmless — the comparison is by content — but it
read as memoised when it was not.

The lesson worth keeping: **the one real defect was in the fix, not in the
code the fix was about.** Three of the four review findings before it were
also in the panel's wiring rather than in the pure helpers, which is now
filed as `TASKS.md` #94.

240 PHP tests, 143 JS tests, build clean.

---

## 21. Content reaches the public

#59. The CMS now serves the site it holds: Blade from this same application,
reading through Eloquent, with no API in between. Phase 1's last mechanism.

### The addresses

```
/                          302 to the default language
/{lang}                    the home page
/{lang}/{module}           a module's published entries
/{lang}/{module}/{slug}    one entry
/sitemap.xml
```

**The language prefix is not optional, the default language included**, and
`/` redirects rather than serving the home page itself. Both follow from the
same rule: one page, one address. Serving Greek at `/rooms/thea` *and*
`/el/rooms/thea` would put the same content at two URLs and split whatever
ranking it earned, which is the opposite of what the hreflang work is for.

A draft is a 404. So is a slug asked for under the wrong language, an entry
with no slug in the language asked for, and a language that exists but is not
active — each of them a way the same page could otherwise have been reachable
twice or reachable when it should not be.

### hreflang, which is the point rather than a detail

Every page declares the languages it **actually exists in**, and no others. An
entry translated only into Greek does not claim an English alternate, because
that would point a search engine at a 404.

`x-default` points at the default language. The sitemap carries the same
alternates as `xhtml:link` elements, built from the same array the page's own
`<link>` tags come from — so the two cannot disagree.

Without this Google does not know the Greek and English pages are one piece of
content in two languages, and the multilingual advantage — the entire sales
argument in this market — is invisible to it.

### The cache, and the requirement that shaped it

The first version looked the entry up and *then* cached the render. It passed
every test that asked "is the page cached", and it was wrong: a hit still cost
three indexed queries, while #59 asks for finished HTML **without a query**.

So the lookup comes first. Each action hands `PageCache` a path and a closure,
and the closure — which resolves language, module and entry — runs only on a
miss. A test counts queries on a warm page and asserts **zero**; the earlier
shape fails it.

**Invalidation is by version, not by key or tag.** `CACHE_STORE` is
`database`, and that driver has no tag support, so "forget everything under
this module" cannot be expressed. Tracking keys instead is a list to maintain
and a second thing to get wrong. Instead every key carries a counter and
publishing increments it: O(1), no bookkeeping, and correct for the case
key-based invalidation gets wrong — a **renamed slug**, whose old URL nobody
can compute afterwards because the row that held it is gone. A test pins
exactly that: rename a slug, and the old address is a 404 while the new one
serves.

The counter is site-wide, and that is a **trade rather than an oversight**.
Keying on the path alone is what buys the zero-query hit, and a path on its
own does not say which module it belongs to without a query. So any write
drops every page. For an accommodation site — a few dozen pages, edited a few
times a month — a handful of re-renders costs far less than three queries on
every visit for ever. A catalogue with thousands of pages would want finer
invalidation, and a catalogue is a domain module rather than this path
(Decisions, 2026-09-05).

**Model events do not cover everything.** `EntryController::reorder` writes
one mass `UPDATE`, which fires none, so the observer never runs — the listing
would have kept its old order until the cache expired. The endpoint
invalidates by hand, and a test reorders through the API and reads the public
listing back.

### The templates, deliberately thin

`resources/views/site/` is plain HTML with a few dozen lines of CSS. The bought
theme replaces all of it in #62, so anything decorative written now would be
thrown away. What had to be right today is the head — canonical, hreflang,
`lang` — and the mechanism underneath.

`EntryPresenter` is what lets a template loop over a schema it has never seen:
it resolves each field to the language being rendered and says what kind it is
— rich text as an `HtmlString` the renderer produced, a gallery as a list of
images, everything else as escaped text. The type rules stay in PHP, so no
public template writes `{!! !!}`.

### Two pieces of Laravel scaffolding removed

`welcome.blade.php` is gone — 72 KB with an inlined Tailwind stylesheet that
cost about 36k tokens to read, kept only because `/` needed something. `/` now
redirects.

`ExampleTest` went with it. It asserted `/` answers 200, which is now wrong by
design, and it has no database so it answered 500. It was the stock placeholder
and covered nothing; `PublicPageTest` covers `/` with two tests that say what
the redirect is for.

### Checked

Failing tests first: 17 for the pages and 11 for the cache, every one of them
failing for the stated reason before the code existed.

The cache tests change the row **behind the model's back** before asserting the
page is unchanged. A test that only checked "the page shows the new value"
would pass with no cache at all.

Verified live over real HTTP against MySQL and the `database` cache store,
which the suite does not exercise — it runs on `array`:

- every route answers as it should, `/admin` included, which is what the route
  ordering is for;
- an entry page carries its canonical, both alternates and `x-default`, and
  renders its rich text as `<p>` with the Greek intact;
- a draft is absent from the page, the listing and the sitemap;
- warm the cache, rewrite the row straight in the table, and the old title is
  still served; save through the model and the new one appears — the version
  going 5 to 6.

The probe module was removed and the cache flushed.

267 PHP tests, 143 JS tests, build clean.

---

## 22. `required` means the default language

Found by a human clicking through the demo content #59 was built to show, which
is the only way it could have been found: **every existing test ran against a
database with no languages in it**, so the per-language wildcard only ever saw
the keys the test itself had sent.

Opening a room, changing nothing, and pressing Save answered:

```
The data.title.fr field is required.
```

Three separate defects, one on top of another.

### The rule was wrong

`required` on a translatable field built `required` into `data.{name}.*`, so
**every active language** was mandatory. Adding French to a site therefore made
every existing entry unsaveable until somebody translated it — an author could
not fix a typo in Greek without first inventing French.

It now means the **default language**. The other translations may be empty, the
map itself is still required, and the rule follows whichever row carries the
flag rather than the first one.

The explicit key and the wildcard both apply to the default language, which is
deliberate and works: `required` is one of Laravel's *implicit* rules, so it is
still evaluated on a null value even though the wildcard marks the attribute
nullable. The wildcard's `required` is replaced by `nullable` rather than
merely dropped — without it a null would fail the type rule behind it, and "not
translated yet" has to be expressible.

`Language::default()` is now the one answer to which language that is.
`PageController` had written the same fallback out for itself; two statements
of one rule that could have drifted, and now do not.

**This was a decision, not a bug fix** — recorded in `TASKS.md` under
Decisions. The stricter reading is defensible for a product that promises full
translation; what is not defensible is that adding a language breaks editing.
The better answer, deferred, is to demand every language **at publish** and let
a draft be half-translated: `status` already exists for exactly that, but the
rule builder would have to know it, which changes its signature and every
caller. Not MVP.

### The message was filed against the wrong input

`messagesForField` returned every language's message, so the complaint about
French was rendered under the **Greek** box — telling the author the Greek
field was wrong when it was not.

The comment above it explained why: *"Messages for every language, not just the
visible tab — otherwise an error on a tab the user is not looking at is
invisible."* The concern was right and the remedy was not: it solved *invisible*
by making it *misplaced*.

### Nothing took you to the language that failed

Now the form switches to the first language that failed, and the language tabs
carry a red dot for each one that has errors — which is what keeps a hidden
error discoverable, the job the old behaviour was doing badly.

A gallery's keys nest deeper than one segment (`data.photos.0.alt.en`), so
filtering by language would have hidden them. Fields that are not translatable
pass no language and still get everything; a test pins it.

### Checked

Failing tests first. The three new rule tests seed **three active languages**,
which is the thing every earlier test was missing, and each failed for its own
reason: French demanded, an empty default accepted, the flag ignored. Putting
the old rule back fails exactly those three.

Verified live against MySQL with `el`, `en` and `fr` active: saving a room with
only Greek filled answers **200** where it answered 422, and clearing the Greek
title answers **422 on `data.title.el`** — which the panel now opens on. The
probe ran inside a transaction and rolled back, so the demo content survived.

273 PHP tests, 150 JS tests, build clean.

### And the listing was showing a translation that does not exist

Found the same way, one screen along. `EntriesTable` picked a cell's value as:

```js
rawValue[currentLangCode] || Object.values(rawValue)[0] || ''
```

so switching the table to French showed the **Greek** text for anything not
translated. The listing claimed a translation that does not exist, and — worse
for a CMS whose selling point is translation — **the rows that most needed
attention were the ones that looked finished.**

An untranslated cell is now empty, which the table already renders as a muted
dash. That is the honest answer, and it turns the language switcher into a way
to see at a glance what is still missing.

The one exception is the moment before `/api/languages` resolves, when the code
is null and the listing has already rendered (#40). A blank column would flash
there, so the first translation stands in until the real language is known.

**The fix introduced a runtime error that the build and 155 tests did not
catch.** Narrowing `let value` to `const` collided with a later
`if (value === null || value === undefined) value = '';` fifty lines down —
assignment to a constant, which throws in a module's strict mode. It was found
by reading the surrounding code rather than by any check.

That is `TASKS.md` #94 for the fifth time: the pure helper had six new tests
and the component that uses it has no harness at all. The count is now more
persuasive than the argument.

### The panel remounted itself on every hot update

Surfaced by the same browser session, in the console rather than on the page:

```
You are calling ReactDOMClient.createRoot() on a container that has already
been passed to createRoot() before.
```

`app.jsx` ended in an unguarded `createRoot(rootElement).render(<App />)`, and
Vite re-executes that module on every hot update — so each save mounted a
second root over the first. Harmless in a production build, where the module
runs once. Not harmless while working on the panel, which is when it happens:
the form throws away whatever was typed on each edit, and two trees answer the
same events.

The root is now kept on the element and re-rendered. Four lines, and it makes
the browser checks this project keeps relying on actually usable.

---

## 23. A Module can be a page rather than a list

#60. "About" is one entry; "Blog" is many. Until now both were collections, so
a client opening About met a table with a single row and an **"add entry"
button that must never be pressed** — and if they pressed it, the site had two
About pages and no way to say which one was the About page.

`modules.is_singleton`, defaulting to false so nothing that already exists is
reinterpreted. A column rather than a key inside `schema`, for the same reason
`status` is one: it means the same thing for every Module and it is asked about
on the read path, while `schema` describes an Entry's *fields* rather than the
Module's own shape.

### Enforced on the server, not only in the panel

`StoreEntryRequest` refuses a second entry with a 422 that names the module and
says what to do instead. Hiding the button would have been the whole feature —
and it would have held only until somebody used the API.

That is **#75's lesson applied before it was paid for**: an endpoint that
accepts whatever it is sent because the client promises not to send anything
else. The rule now lives where the write happens.

Updating the one entry still works, and deleting it makes room for another —
neither is a rule anybody asked for, but a singleton that could be written once
and never corrected would be worse than no singleton at all.

### One page, one address

`/{lang}/{module}` serves the entry itself, and `/{lang}/{module}/{slug}`
answers **301** to it. A 404 would be simpler; it would also break every link
that exists if a Module is turned into a singleton after it has been indexed.
That transition is a **hand-written database edit today** — there is no
endpoint that updates a Module at all — so the argument is about the manual
case rather than about anything the panel can do.

The alternates are the Module's URLs in each language rather than the entry's,
so the canonical the page advertises is the address it is actually served at —
they are read out of the same array, so they cannot disagree.

**The sitemap lists the Module's address and not the entry's.** Advertising a
URL that redirects wastes the crawl on a hop and claims two pages where the
site has one. Found by looking at the live sitemap after the redirect worked —
it listed the old address four times.

`PageCache::remember` now stores what the page *is* rather than only its
markup: `['html' => …]` or `['redirect' => …]`. That keeps the redirect free of
queries on a cache hit, which was the point of §21's ordering and would have
been quietly given up by resolving the module first.

An empty singleton, or one holding only a draft, is a 404. There is no page
until there is something published to put on it.

### The panel

A checkbox in the module builder, worded as the decision rather than the flag —
*"This module is a single page"* — and the panel then opens straight into the
one entry, or into a blank form for the first one. There is no list and no add
button, and leaving the form leaves the module, because there is nothing to go
back to.

### Checked

Failing tests first: seventeen, of which eight failed before the feature
existed. Two of the others passed **for the wrong reason** — a one-item list
happens to contain the entry's title — so the page test was tightened to
require an `<article>` and the *absence* of a link to a second address.

Verified live against MySQL over real HTTP with a Σχετικά singleton in three
languages: `/el/sxetika`, `/en/sxetika` and `/fr/sxetika` serve the article,
the entry address 301s to the Module's, a second entry answers 422, and the
sitemap carries the Module's URL once and the entry's not at all — while the
Δωμάτια collection still lists entry by entry.

290 PHP tests, 155 JS tests, build clean.

**The panel needs a human.** It has no component harness (#94), so the
open-straight-into-the-entry behaviour is verified by reading.

### Ten the review of it found

Two would have shown up in front of visitors, and one of those on the **deploy
itself**.

**Every warm page would have 500'd after release.** `PageCache::remember`
changed its return type from `?string` to `?array`, and the version counter
that invalidates the cache moves on a **write**, not on a deploy — so every
page cached by the previous shape stayed under a key the new code reads, and
handing a string back through an `?array` signature is a TypeError. The whole
public site would have been down until somebody published something or the
seven-day TTL ran out.

I met this locally through the sitemap while building the feature and cleared
it with `cache:clear`, which is exactly how a deploy-only fault gets hidden
during development. The stored shape is now part of the key — `page.v2` — so
old entries are unreachable rather than mis-read.

**Every made-up address under a singleton was a 301.** The redirect was
returned *before* the entry was looked up, so `/el/sxetika/anything-at-all`
answered 301 rather than 404 — a soft 404 to a crawler, and, because a redirect
is not `null`, **one cached entry per invented slug**. `PageCache`'s own
docblock says an unknown URL must not be able to fill the cache; this made it
possible. The entry is resolved first now, so a slug matching nothing is a 404
and a draft's slug does not become a public redirect either.

### The rest

- **The singleton limit was a read before a write.** Two concurrent creates
  could both find nothing and both insert. Re-checked inside the transaction
  `store()` already opens, holding the rows — the request rule stays, because
  it is what turns the ordinary case into a 422 that names the module.
- **The 301 dropped the query string**, losing the campaign a visitor arrived
  on. Appended when the response is built rather than baked into the cached
  target: the cache key carries no query, so a stored redirect would have
  handed one visitor's `utm_source` to the next.
- **An unrecognised cached shape served an empty 200.** Worse than a fault —
  monitoring stays green, the blank is cached and indexed. It now throws.
- **Saving a singleton threw the author out of the module.** They could not see
  the result, and a second correction meant navigating back in, on the screen a
  client edits most. Saving keeps them on the content; cancelling leaves.
- The justification for 301-over-404 cited "a Module made a singleton after the
  fact" — a transition **no endpoint can perform**, since there is no module
  update. Corrected in both documents to say it is a hand-written edit.
- `Module::isSingleton()` cast a value the model already casts, and the panel
  read the flag with `=== true`.

### Checked

Five tests written first, each failing for its own reason — the stale-format
one failing with the TypeError itself. Then each fix mutated back out.

**One mutation did not bite at first**, and the test changed rather than the
claim: the empty-200 case asserted a 500, which the fall-through also produces
*in tests only*, because PHPUnit escalates the "undefined array key" warning
into an exception. In production that warning is not fatal and the visitor gets
a blank page. Asserting the exception **type** is what tells the two apart.

295 PHP tests, 155 JS tests, build clean.

---

## 24. The line between core and one client

#61, and the last structural item of Phase 1. Core code and per-client code now
sit on opposite sides of one directory, so client #2 is a copy of that
directory rather than a fork of the application.

```
site/
  theme/        the public templates, as `theme::layout`, `theme::entry`, …
  routes.php    what this one site needs beyond the generic pages
  README.md     what belongs here, and what is core work instead
```

No packaging, no Composer changes, no tooling — the item asked for the line and
nothing else. Two moves and a mount: the templates left `resources/views/site`
for `site/theme`, and the theme is registered as a **view namespace** rather
than another path in the finder, so a client's template cannot shadow a core
one by being named the same and the whole directory can be swapped.

### Core knows where the door is, not what is behind it

That distinction is the whole design, and it took a failing test to state it
properly. The first version of the boundary check said "core must not name the
site directory" and immediately caught `AppServiceProvider` — which is right by
the letter and wrong about the rule. **Something has to register the namespace,
or nothing on the client's side is reachable at all.**

So the rule is: exactly **two mount points** may name the directory —
`AppServiceProvider` for the views, `routes/web.php` for the routes — and both
do it by location. Everywhere else, core refers to the theme only through
`theme::`, which is not a path but a contract.

### The contract, made checkable

Writing that down produced the test worth more than the move: **every
`theme::` name core renders must exist in the theme**. The list is read out of
core itself, so a theme author for client #2 has the exact set they owe —
`layout`, `home`, `module`, `entry`, `sitemap` — instead of finding out when a
page nobody opened during the build 500s in front of a visitor.

### One rename

The public controllers moved from `app/Http/Controllers/Site` to `…/Web`. They
are core machinery that renders whatever theme is mounted, and a core namespace
claiming the word `Site` contradicts what `site/` now means — worth fixing
while it was two files. A test asserts the old directory is gone.

### Checked

Six boundary tests written first, four failing before the move existed. Then
core was made to name a file inside `site/` — the test failed and named
`EntryPresenter`, which is the behaviour that matters, since the fix when it
fails is almost never to loosen it.

301 PHP tests, 155 JS tests, build clean. Verified live: every public route and
the admin still answer 200 after the templates moved and the compiled views
were cleared.

`CLAUDE.md` gained the line as its own short section, since a fresh session
needs it before touching either side.

### Eleven the review of the line found

None broke anything today. Three undermined the boundary the commit had just
drawn, which is worse in the way that only shows up later.

**The sitemap was in the theme.** It moved with the page templates, so every
client's theme became responsible for emitting valid sitemaps.org XML - and
the contract test *required* them to. A theme is a client's design; a sitemap's
structure is fixed by a protocol and by the hreflang work, and a theme that
mangled it would break indexing silently, the one failure invisible from inside
the panel. It is core now, in `resources/views`, where a client cannot reach
it.

**Site routes were loaded last, so they could never win.** The comment called
that "additional rather than a replacement" without saying how little was left:
`/{language}/{module}` claims `/el/epikoinonia` before a hand-written contact
page ever sees it, and any two-letter first segment is taken outright. A
client's own side of the line that could only add addresses nobody had thought
of is a poor kind of ownership. The file is loaded **before** the core pages
now - after the admin panel, which a client may not take over.

**Nothing checked that the routes mount works.** The views half was proved by
resolving `theme::layout`; the routes half was a `require` that no test
exercised, so deleting it would have left the suite green while a client's
routes silently stopped existing. It is now proved the only way a file read at
boot can be: give it a route, rebuild the application, ask for the route.

### The rest

- **The contract test read comments.** `theme::` matched anywhere in a file, so
  a name written in prose became a requirement and a requirement outlived the
  call that made it. It matches `view('theme::x')` now.
- **The boundary scan covered only `app/` and `routes/`.** A seeder reading a
  client's file, or a config default pointing into it, welds core to one
  installation exactly as a controller would. `bootstrap/`, `config/` and
  `database/` are scanned too.
- **Core route names still took the `site.` prefix** - the same word collision
  the commit fixed by renaming the controller namespace. They are `web.*`, and
  the boundary test now fails if any core route claims `site.`.
- **`site/README.md` promised theme assets that nothing builds.** Vite's inputs
  are under `resources/`; nothing compiles `site/` and nothing under it is
  web-reachable. It says so plainly now, and names #62 as where that gets
  decided - which is the item that will trip over it.
- Tailwind is told to scan `site/theme` explicitly rather than relying on
  automatic detection, since a purged utility class renders unstyled in
  production while looking right in dev.
- The unused `Route` import went, `route:cache` is documented, `File::allFiles`
  replaces a hand-rolled directory walk, and the `SITE` constant is used
  everywhere it applies rather than beside three hardcoded copies.

### Checked

Three new tests written first, each failing for its own reason, then each fix
mutated back out: moving the routes mount after the core pages, deleting it
entirely, and putting the `site.` prefix back all fail the tests that name
them.

**One mutation did not bite and no test was manufactured for it.** Loosening
the contract regex back to matching `theme::` anywhere still passes, because
the only such string in a comment names `layout`, which exists. The trap is
latent rather than sprung: a comment naming a template that does *not* exist
would fail the suite, and a requirement would outlive its render call. Writing
a misleading comment to prove it would cost more than it is worth, so it is
recorded here instead.

303 PHP tests, 155 JS tests, build clean. Every public route and the admin
still answer live after the sitemap moved back to core.

### Nine more, and one of them taught me how Laravel loses a route

The review of the previous fix found nine. Two were the same irony: the commit
that drew the line then crossed it.

**The boundary test rewrote a tracked file to run.** To prove `routes/web.php`
really loads the client's routes, it overwrote `site/routes.php` with probe
routes and restored them in a `finally` — which does not run on a fatal error
or an interrupted process. A cancelled test run left the repository dirty
**and the application serving `/zz-boundary-probe` and `/el/zz-probe-module`**,
the second shaped like a real page.

The right depth was the mount, not the test. `config/site.php` now holds the
two paths core knows — the theme directory and the routes file — so a test can
point them at a temporary file and nothing under version control is written.
That makes it a third mount point, which the boundary test allows by name.

**And a client could take over `/sitemap.xml`.** The same commit moved the
sitemap template out of the theme because "its shape is a protocol rather than
a design", then loaded the client's routes ahead of the sitemap's own
declaration. The guarantee was handed back with the other hand.

### What the test taught me

Fixing that revealed something I had asserted without checking. The comment
said declaration order was "the whole of the enforcement". It is not:

- **dispatch order** decides between *overlapping* patterns — the first route
  whose pattern matches wins, so a client's `/{page}` would answer `/admin`
  unless the panel is declared first;
- **the lookup map** decides between *identical* URIs — `RouteCollection`
  stores routes as `[method][uri] => route`, so a later route with the same
  path **replaces** the earlier one, and declaring the panel first does nothing
  against a client writing the same string.

Each position defends against one. The protected routes are therefore declared
on **both** sides of the client's file, from one closure so the repetition
reads as deliberate. The test that found it asserts both: a client declaring
`/admin/{any?}` and `/sitemap.xml` verbatim gets neither.

That is #75's shape again — a rule believed to hold because of an arrangement
nobody had tested.

### The rest

- **Site routes were loaded before the `Route::pattern` calls**, and Laravel
  merges global patterns into a route *as it is created*
  (`Router::addWhereClausesToRoute`). A client's `/{language}/epikoinonia`
  would have matched `/anything-at-all/epikoinonia`. The patterns moved above
  the load.
- **The `site.` prefix check asked the router**, which holds the client's
  routes too — so a client naming a route `site.contact`, exactly what the
  prefix was reserved for, would have failed a core test. It reads core's own
  files now.
- **Nothing pinned that the panel survives a client route.** It does now, in
  the same test as the sitemap.
- `site/README.md` claimed the contract test derives `layout`; it derives
  `home`, `module` and `entry`, and `layout` is covered by the namespace test
  because the templates extend it themselves rather than core naming it.
- Directory walks are memoised — three tests were re-reading five trees each —
  and `relative()` uses `Str::after`.

**`CLAUDE.md`'s "Where we are" was four commits stale**, which matters more
than any of the above: it is the file that loads into every fresh session, and
it said three defects were "wrong in the browser now" that had been fixed and
verified live days earlier, that `## P0` was next when it is closed, and that
nobody had clicked the panel when a human had run every check. Rewritten, along
with the test counts and the "not verified by a human" section, which now
records what a person *has* checked and points at #94 for what still needs one.

305 PHP tests, 155 JS tests, build clean. Every public route and the admin
answer live.

---

## 25. Enquiries, and the first inbound path in the application

#66. Until now the public side could receive **nothing**: every write sat
behind `auth:sanctum`, so the demo was a brochure. This is the one route an
anonymous visitor may POST to, and the item was right that it brings validation,
rate limiting, spam handling and GDPR with it.

A hand-written table rather than a Module's JSON schema, by the rule in
Decisions: it needs a chronological listing, deletion in bulk when the
retention period bites, and it grows without limit.

### The order of operations is the design

**The row is written first.** An accommodation owner who loses an enquiry loses
a booking and blames the website, so nothing downstream may cost it: the owner
notification is wrapped, its failure logged, and a mail server that is down
produces a stored enquiry and a quiet log line rather than a 500 the visitor
reads as "it did not send" — after which they send it again, or give up.

Nobody having configured a notification address is the same case: the enquiry
is the record, the email is a courtesy on top of it.

### A honeypot, and why it is not a rule

Checked in the controller rather than validated, so a filled trap answers
**exactly as a real submission does**. A validation error naming a hidden field
is precisely how a bot learns to stop filling it, and a visitor with an
over-eager autofill would get an error they could not act on.

A captcha was rejected in the item itself: at this volume it costs conversions
and buys nothing.

### GDPR, decided rather than assumed

Consent is stored as **the moment it was given**, not a boolean somebody could
flip afterwards — without it there is no lawful basis for the row, so there is
no row.

The retention period is **24 months**, chosen because it covers two seasons:
last summer's visitor is still on file when they write again. It is stated on
the form, and `enquiries:prune` enforces it daily — a stated period that
nothing keeps is a claim made to every visitor who ticked the box.

Deletion from the panel is **permanent, with a confirmation**. A "deleted"
enquiry still sitting in the table is hard to explain to anybody asking what
happened to their data; the confirmation is what catches the wrong click.

### The defect the live probe found

Posting the real form against MySQL answered **419**, and the suite was green.

The public pages are cached whole (§21), and a CSRF token belongs to one
session — so the cached HTML carried the first visitor's token and everybody
after them was refused. **A form that silently never works**, which for an
enquiry form means the owner never learns the enquiries are not arriving.

The suite could not see it: it renders each page fresh, so the token always
matched. The test that pins it now asks for the page twice with the session
flushed between.

`PageController` replaces any `_token` value with a placeholder on the way into
the cache and with the current session's on the way out. Done in core rather
than by giving themes a special directive, because a theme writing `@csrf` out
of habit would then break the form for everybody but the first visitor after a
cache clear — a fault that looks intermittent and is not.

### The review of it, and the same defect one field along

Nine findings. The first was the CSRF fix above, **at the wrong depth**.

A token was substituted because a token has a fixed shape. But `session()`,
`$errors` and every `old(...)` in the same template are session state too, and
they are arbitrary content that nothing can substitute — so the visitor was
redirected back to a cached page that told them nothing had happened, showed no
validation errors, and had emptied every box they had typed in. Worse than the
419, because it looks like it worked.

**The rule is now the page, not the token: a page carrying a form is not
cached.** `PageCache` decides it from the rendered HTML, and the CSRF token is
the marker — any form posting back to this application carries one, or the
submission is refused, so a theme cannot forget to declare itself and a theme
that adds a form to a page is covered the moment it does. The placeholder
machinery is gone.

The cost is that such a page is rendered on every visit. That is the client's
decision and is made by where their theme puts the form; this one puts it on
the home page, so the home page is uncached and a site that minds gives the
form a page of its own.

#### And the deploy fault underneath it, again

The live probe answered **419 on every submission** with 335 tests green: the
warm cache still held pages written by the previous release, with the
placeholder baked in, and nothing substitutes it any more. The version counter
moves on a **write**, not on a deploy — the same trap as §22, one release
later. `PREFIX` is now `page.v3`, which retires them all at once.

The rule is written into the constant: bump it when the stored shape changes,
**including when what is stored changes from something to nothing**.

#### The rest

- **Markdown in the message became a live link.** `[Confirm your booking](…)`
  in an enquiry arrived as a real link in an email the owner's client trusts,
  because their own site sent it. HTML escaping does not touch Markdown syntax
  and Laravel's mail templates are Markdown.
  `Markdown::withSecuredEncoding()` is the framework's own answer and is now on
  for the whole application, not for this one mailable — the next mail added
  would otherwise have to remember.
- **The inbox asked no policy**, alone among the admin endpoints. `EnquiryPolicy`
  now answers, with the same "anybody signed in" the route group already
  establishes. It is a hook, not a fix: group permissions are what will make an
  inbox of names, addresses and phone numbers something not every account
  should open, and they land in policies.
- **The prune could overlap itself** and now cannot.
- **The form partial needed `$current`**, so a client route in `site/routes.php`
  that included it answered 500. It falls back to the default language.
- **The tests stopped at `assertRedirect()`** and never looked at the page the
  visitor lands on. That is precisely why the first finding was not caught.
- **`RateLimiter::clear('enquiries|127.0.0.1')` in `setUp` cleared nothing** —
  the middleware hashes the key. Deleted rather than corrected: tests run on
  the `array` store, which is empty at the start of each one.

One was closed without a change. **The limiter keys on `$request->ip()`, and
`TRUSTED_PROXIES` is empty by default**, so behind nginx every visitor would
share one bucket. That is recorded as a decision in §13 and stated in
`bootstrap/app.php`, `.env.example` and ARCHITECTURE §*rate limiting*: trusting
a proxy that is not there is worse, because anyone could then mint a bucket per
request. The deployment sets it; nothing here changes.

### Checked

22 tests written first, 20 of them failing because nothing existed. Then the
whole path over real HTTP against MySQL, with a session and a token read out of
the served page: a real submission stored with its Greek intact, the honeypot
answering 302 and storing nothing, a submission without consent refused — one
row in the table at the end, and a POST with no token answering 419.

The review's fixes were checked the same way and then **mutated back out one at
a time**, seven of them, each one failing the test that pins it — including the
over-fix, where caching nothing at all fails the test that a page without a
form still comes out of the cache. The live probe ran two independent sessions
against one URL: different tokens, the errors and the typed values coming back
to the visitor who submitted and to nobody else, and a quiet rename still
hidden on a page with no form.

335 PHP tests, 155 JS tests, build clean.

**The panel screen needs a human.** There is still no component harness (#94),
so the inbox and its delete confirmation are verified by reading.

---

## 26. Site settings, and the argument that chose a table

#67. The values a client changes about their own site: phone, address, opening
hours, social links, a logo, the booking URL — and the two this application
reads about itself, the enquiry notification address and the language the panel
opens in.

The point is not the fields. `BUSINESS.md` puts the ceiling of the whole
business at **support minutes per client**, and a phone number living in a
template is a call on a Sunday that only you can answer.

### Why it is not the singleton the item described

`TASKS.md` said "a singleton (#60)", and that was reconsidered rather than
followed. A singleton is the client's **content**: they create it, they name
it, and they can rename or empty it. Two of these values are not theirs to
lose. An enquiry can arrive on the first day of an installation, **before any
module exists**, and the panel has to resolve a language before anybody has
signed in — core cannot read either out of a row that might not be there.

So the storage is core's: one table, one row, declared in PHP.

### What was reused instead

The fields are declared in **the same shape a Module's schema uses**, so
`SchemaRuleBuilder` validates them — the two-level translatable rules included,
which is what lets an address be Greek on the Greek page and English on the
English one. There is no second set of rules to keep in step with the first.

The panel builds its form from `GET /api/settings`, which hands over the schema
alongside the values, so adding a field is one edit in `SiteSettings` and none
in JavaScript. The same reasoning as the generated `fieldTypes.json`, one layer
up. Labels are literal `__()` calls translated server-side (#96), so the wording
is core's and the language is the reader's.

### `config/site.php` became the default rather than the previous home

A key nobody has saved falls back to the config, so a fresh copy of the
application works before anybody opens the panel and `.env` still means
something. A key that **is** saved wins even when it is empty: an owner who
cleared the notification address meant to clear it, and falling back would have
gone on mailing an address they removed.

### Two things the suite caught that the design had not

**The panel stopped opening without the table.** Adding a settings read to
`InterfaceLocales` — which runs on the login screen and on every API request —
meant an unpacked-but-unmigrated copy answered 500 where the sign-in form goes.
That is the argument for a table failing one step earlier than it was made: core
has to work before anybody has *migrated* anything too. The read now treats a
missing table as an answer, and asks `Schema::hasTable` only after a query has
already failed, so a real database fault still surfaces.

**And it added two queries to every API request.** `EntryOrderingTest` pins the
count for a reorder at four, and it went to five. `resolve()` now asks
`users.locale` first and only reaches the settings row when the reader has
expressed no preference — once per request, for a value that changes once a
year. The count sits **exactly on the bound**, and the test says so: the next
addition fails there, and the answer is to ask why, not to raise the number.

### What the review of it found

Eleven findings, and the first was the config fallback working against itself.
`save()` replaced the row, so a client sending three fields sent the other nine
back to `.env` — the very thing the fallback is documented as preventing, one
layer up. It merges now, and clearing still works because a key present with a
null wins.

Two more came from borrowing the Entry rules wholesale: `SchemaRuleBuilder`
opens with `data` **required**, which is right for an entry and wrong here —
Laravel's `required` rejects an empty array, so "clear everything" answered
"the data field is required". And the row was addressed as "the first one
there is", which is how two simultaneous saves become two rows and half the
settings vanish; it is a fixed key now.

The two findings interacted, which is worth recording: `$validated['data'] ??
[]` was reported as dead code under `required`, and became **reachable** the
moment `required` was relaxed to `present`, because Laravel drops an empty
array from `validated()`. Removing it turned the fix for one finding into a
500 for the other.

### Checked

21 tests written first, then five mutations each failing the test that pins it.
One of those mutations did not bite at first: the stray-row test created the
settings row as well, so it passed whether the read addressed a fixed key or
took whatever came back. It creates only the stray now. Then live over HTTP against
MySQL with a real session: the schema and its translated labels came back, a
bad URL was refused as *"The Facebook page field must be a valid URL"* rather
than naming the request key, an undeclared key was refused, and the public
footer read the address in Greek on `/el` and in English on `/en`. The probe
row was deleted.

373 PHP tests, 165 JS tests, build clean.

**The screen needs a human.** There is still no component harness (#94), so
`SettingsManager` — the image upload and the per-language inputs especially —
is verified by reading.

---

## 27. The form became an island, so the page could become a file

#97, first half. §25 established that **a page carrying a form may not be
cached**, because everything a form needs belongs to one visitor: the CSRF
token, the confirmation, the errors, the values to type back in. That was found
by posting the live form and reading 419.

It was right about the cause and wrong about which half to keep. The page a
form sits on is the home page, and #97's measurement put a cache *hit* at four
queries in production while the test claiming none ran on `array` stores that
exist only in `phpunit.xml`. "The most important page is never cached" was not
a rule worth defending.

**So the session state left the form instead.** The markup is still rendered by
the server, in the visitor's language; only the submit is JavaScript. Nothing
on the page differs between two visitors, so the page can be stored — and, in
the second half of #97, written to disk.

### What the client side is, and what it deliberately is not

`public/forms.js`, 200 lines, no dependencies:

- **One submitter for every form**, opted into with `data-cms-form`. The owner
  chose this at the stop: a client's home page will carry an enquiry, a
  newsletter box and a search, and three scripts that each fetch a token the
  same way is three places to fix it.
- **Not built, and served from a fixed path.** A cached page is a file, and a
  hashed asset name baked into one is a script that disappears on the next
  `npm run build` while the page pointing at it survives. The public site
  already had no bundle; giving it one would have added a deployment
  dependency to the exact item that warns about deployment dependencies.
- **No wording in JavaScript.** The confirmation arrives in the JSON, already
  translated; the one line the script owns — "it did not send" — is an
  attribute on the form. A catalogue in the bundle would ship every language to
  every visitor to say one sentence, which is what #96 took out of the panel.
- **The first cookie is set on interaction**, not on load. Somebody who only
  reads a page is never given one, which is most of #70 before it starts.

The framework's own messages are deliberately **not** shown for a 429 or a 419:
they are English until #99 lands, and a Greek visitor reading "Too Many
Attempts." reads a broken site.

### Two things found on the way

**`shouldRenderJsonWhen` had been narrowed to `api/*`.** Passing a callback
*replaces* Laravel's default rather than adding to it, so no route outside
`api/*` could answer JSON however it was asked — the enquiry endpoint answered
a 302 to `postJson`. The clause was written in §2 to force JSON for an API URL
opened in a browser, and taking it away from everything else was a side effect
nobody had asked for and no test pinned. Now both: forced for `api/*`, and
Laravel's `expectsJson()` restored for the rest.

**The suite was reading the developer's `.env`.** `SITE_LOCALE` is unset in
`config/site.php`, so two tests changed their answer the day it was set on this
machine — one asserting `app.fallback_locale` where it meant the installation's
locale, one asserting an English label. Pinned in `phpunit.xml` and both tests
now say what they depend on; the settings one asserts the schema's own label,
so it is right in any language. Same family as the `array` cache store above:
**a test is only as honest as the environment it names.**

### Four tests were rewritten rather than deleted

`test_a_page_with_a_form_is_not_cached` became `..._is_cached`, and the three
that read the token, the confirmation and the errors out of a rendered page
became one test that renders the partial **directly** with a flash, an error
bag and old input in the session, and asserts none of them appear. Directly,
because the page is cached now: a GET after a submission would answer with
something rendered before the session had any of this in it, and would pass
with the template unchanged.

### Checked

Six tests written first, all six failing for their own reason. Then six
mutations — and one survived: removing `data-cms-form` from the form stops
every submission, and the assertion stayed green because `data-cms-form-sending`
contains the same substring. Tightened to the bare attribute, re-mutated, it
bites.

Then live over HTTP against MySQL: a submission refused for a departure before
the arrival showed *«Η ημερομηνία αναχώρησης πρέπει να είναι μετά την άφιξη.»*
in place with no reload; a corrected one showed the Greek confirmation and
emptied the form; and with the `XSRF-TOKEN` cookie deleted the sequence was
`GET /sanctum/csrf-cookie` → 204 → `POST` → 200, which is the path every real
visitor takes. `home:el` is in the cache, 5498 bytes, with no `_token` in it —
the first time the home page has ever been cached. The two probe enquiries were
deleted.

383 PHP tests, 168 JS tests, build clean.

### The review of it found ten, and one of them mattered

**`PageCache::carriesSessionState()` had stopped being tested at all.** The
only test that exercised it was the one this change inverted, and deleting the
guard outright left all 383 tests green — a mutation, not a reading. It is the
single thing standing between a client's own `@csrf` form and a repeat of §25,
and it was being kept alive by a docblock. Three tests now pin it in both
directions, through `remember()` rather than through a route: refuse a token,
refuse a `csrf-token` meta tag, and **store an ordinary page**, because without
the third "cache nothing" would satisfy the first two.

Four were in `forms.js`, and all four were about it being a *shared* mechanism
rather than the enquiry form's:

- `[type="submit"]` does not match `<button>Send</button>`, whose default type
  **is** submit, so such a form got no disabling — and with it no protection
  against a second submission. There is now a `WeakSet` guard as well, because
  Enter in a text field submits without touching a button at all.
- A missing `data-cms-form-error` rendered a **visible, empty** alert box.
- `form.action` and `form.reset` are replaced by any control of that name:
  `HTMLFormElement` is `[LegacyOverrideBuiltIns]`, so named controls win over
  methods too. Checked in Chrome rather than assumed — `f.action` came back an
  `HTMLInputElement` and `f.reset` was not callable. Read as an attribute and
  called off the prototype now.
- A 2xx carrying no `message` emptied the form and said nothing, which reads as
  failure; `data-cms-form-sent` is the floor.

**And the file had no test at all.** It has sixteen now, in
`resources/js/public-forms.test.js`, which loads `public/forms.js` from disk
and evaluates it — the file that ships is the file under test, which is the
whole point of it not being built. `jsdom` arrived with them, and is what #94
has been waiting for.

That harness immediately earned itself: **jsdom does not implement the named-
property override**, so the first two shadowing tests passed whether the fix
was there or not — one of them was detecting a relative-versus-absolute URL and
claiming to detect shadowing. The property is now replaced by hand, which is
what the browser does one layer down, and both bite.

The rest were documentation telling the next session the opposite of the truth:
ARCHITECTURE §5 still said "a page carrying a form is not cached at all" while
§5b, added in the same commit, said it was; a `PageCacheTest` docblock still
called the home page exempt; and `site/README.md` — the file client #2 is built
from — did not mention `data-cms-form` or that `@csrf` silently costs a page its
cache.

386 PHP tests, 184 JS tests, build clean.

---

## 28. The public site became files, and PageCache was deleted

#97, second half. `StaticPages` writes every public page to
`public/cache/{lang}/{module}/{slug}.html`, and two rewrite rules in
`public/.htaccess` hand them over **for GET only, before PHP starts**.

The claim being replaced was in ARCHITECTURE: that a cache hit "touches the
database not at all". Measured through the real kernel against the real `.env`
it cost **four queries** - a `sessions` read, two `cache` reads, a `sessions`
write - and the test that said none ran under `CACHE_STORE=array` and
`SESSION_DRIVER=array`, which exist only in `phpunit.xml`. #59 asked for
finished HTML without a query; a file is that sentence taken literally.

Verified live against Apache: `ETag` and `Last-Modified` present, **no
`Set-Cookie` and no `X-Powered-By`**. The framework did not boot.

### The address comes from rows, and the dangerous direction is deleting

Each render closure composes its address next to the rows it just resolved, and
`StaticPages` checks every segment again before touching the filesystem.

The obvious worry is a crafted URL writing a file somewhere it should not - and
that turned out to be the *protected* direction: every segment a page is baked
under has already passed a route pattern, because that is how the row was
found. **Invalidation has no such protection.** `forgetModule` composes
addresses straight from a slug column and hands them to `File::delete`, so a
row holding `../../x` reaches outside the directory entirely. The first version
of that test set an unsafe slug and asked for the page, which 404s - it proved
nothing, and a mutation said so.

Not hypothetical: `pages:warm` on the development database baked 60 of 63 pages
and **named the three it refused**, all belonging to a module whose slug is
`τεστ κεις`. Recorded as #113 - those pages have answered 404 since #59 and the
bake only made it visible.

### Invalidation got more precise, and the ordering is what makes it work

The version counter existed because a *visitor's* path cannot be mapped to a
module without a query. An *author* saving has the rows in hand, so the pages
to remove are computable - including the renamed slug, the one case the counter
could not handle. Measured live: touching one entry took 61 files to 51 and
left another module's pages alone.

Three places where model events do not cover it, and one of them is subtle:

- `reorder` writes one mass `UPDATE` and fires nothing, so it calls
  `forgetModule` by hand - as it always has.
- `entry_slugs` cascades on delete, so the observer acts on **`deleting`** for
  an Entry: by `deleted` the rows naming its files are gone.
- `syncSlugs` deletes those rows en masse, also firing nothing. The first fix
  was an explicit `forgetEntry` call there - and a mutation showed it changed
  nothing, because `EntryController::update` **saves the entry first**, so the
  observer has already read the old addresses. The dead call was removed and
  the ordering it depended on written down; swapping those two lines does fail
  a test, so the dependency is pinned rather than merely commented.

### There is no expiry any more

`PageCache` carried a seven-day TTL underneath its explicit invalidation, which
quietly cleaned up after anything nobody thought to drop. A file does not
expire, so **anything that changes a page must say so** - which is why
`Language` is observed now and never was: switching one on changes the hreflang
set of every page, and a wrong one would have sat on disk for ever rather than
for a week.

### The guard that nearly did not survive

**A page carrying a CSRF token is still never written**, and it was almost lost
here. Replacing `PageCache` took `carriesSessionState()` with it, and the three
tests pinning it went with the test file that was replaced too - so the suite
stayed green with the guard gone. That is the *same* defect the review of the
first half had found and fixed two commits earlier, arriving by a different
route. It is back in `StaticPages::write`, pinned in both directions in
`StaticPagesTest`, and mutation-checked.

### The deployment dependency fails silently, so a command asks

`.htaccess` covers Apache; nginx needs `try_files` in its server block, which an
`.htaccess` cannot reach and no test can see. A missing rewrite breaks nothing -
every page is quietly served through PHP and the site looks entirely normal.
`pages:doctor` fetches a page known to be on disk and reads the answer's own
account of where it came from: a `Set-Cookie` means the framework ran. It prints
the nginx block when it fails.

`pages:warm` fills the directory by **walking the sitemap**, which *is* the list
of public addresses - so the bake and the sitemap cannot grow two different
ideas of what the site has. `pages:flush` empties it, and the two stay separate
commands because emptying and filling are different decisions.

### Checked

20 tests written first, 8 failing because nothing wrote anything. Then twelve
mutations - **two survived**, and both were right to: the address guard was
pinned by a test that never reached it, and the `syncSlugs` call was dead code.
Both fixed, re-mutated, and every mutation now bites.

One more defect came out of the live check, and only because `pages:doctor`
refused to run straight after `artisan test`: **the suite was deleting the
development machine's baked site.** Every Module write calls `flush()`, which
deletes the whole directory, and with the default configuration that directory
is `public/cache` - the one the machine is serving. Nothing broke, because
pages rebuild on the next visit, but on an installation where `public/cache`
*is* what visitors get, running the tests takes the site offline for a moment.
`Tests\TestCase` now points the path at `storage/` for every test. Same family
as the `SITE_LOCALE` leak in §27: **a suite is only as honest as the
environment it names.**

Live: `pages:warm`, then `pages:doctor` answering *"Served from a file. PHP did
not run."*; the enquiry form submitted successfully **on a page served by
Apache** (`GET /el` static, then `/sanctum/csrf-cookie` 204 and `POST` 200),
which is the point where both halves of #97 meet. The probe enquiries were
deleted.

393 PHP tests, 184 JS tests, build clean.

### The review of the file half found ten, and two of them were serious

**A cache that could not be written took the site down.** `write()` runs before
`serve()` returns the response, and `File::ensureDirectoryExists` and
`File::put` call `mkdir` and `file_put_contents` unguarded - Laravel turns those
warnings into exceptions. Probed: an unwritable path throws
`ErrorException: mkdir(): No such file or directory`, so **every public page
answers 500**. The trigger is the ordinary deployment, where the tree belongs to
the deploy user and php-fpm runs as somebody else. That inverts the rule the
whole switch is built on: no cache means slower, never broken. It is caught and
logged now.

**Nothing invalidated a deployment.** The shape prefix went with `PageCache` and
the seven-day TTL went with it, and a grep of every file mentioning
`pages:flush` found not one telling anybody to run it on a release. That is the
third time this trap has appeared, and the mechanism that half-caught it twice
had just been deleted.

The fix was a `.stamp` holding a fingerprint of the templates - and **checking
it live is what showed the fix did not work**. Touching a template on the
running site and asking for the page left all 62 files exactly as they were: the
check runs from `write()`, `write()` runs only when PHP renders, and after a
deployment every page is already on disk so Apache answers and PHP never starts.
The stamp is a net, not the mechanism. **`pages:warm` is the deploy step** - it
renders through PHP, so its first write finds the moved fingerprint and takes
the stale release with it - and `pages:doctor` now refuses outright when the
stamp is stale, which is the case where somebody deployed and warmed nothing.

Two more were live findings against the web server:

- **Every baked page had a second address.** `GET /cache/el.html` returned 200
  with the full page, because the directory is inside the document root - the
  one thing #59 exists to prevent. Refused now, and the serving rules had to
  move from `[L]` to `[END]`: in per-directory context `[L]` restarts the
  ruleset, so the internal rewrite to `cache/el.html` would have come back round
  and been refused by that same rule.
- **HEAD bypassed the files.** `=GET` matches GET exactly, and crawlers and
  uptime monitors ask with HEAD before fetching - each one booting the framework
  to render a page the file already held.

And one that was mine from two commits earlier: **the owner's `page_cache`
switch had no widget.** `SettingsManager` special-cases `select` and `image` and
lets everything else fall through to a text input, so the switch appeared as a
box containing the word `true`, and typing in it made the value a string that
Laravel's `boolean` rule refuses for anything but "1" and "0". The screen was
never opened after the field was added - #94, again.

The rest: `pages:doctor` checked the local disk while asking a possibly remote
server; `deleting` and `deleted` both dropped an Entry's pages; `TestCase`
pointed every test at one shared directory it never emptied; half-written
`.writing` files were left behind and were web-readable; and `pages:warm` never
terminated the kernel it handled with.

**One fix was itself a bug.** The fingerprint was memoised per instance, which
looked free - and silently disabled the whole mechanism, because the service
outlives a single request and carried the stale hash with it. Removed after
measuring what it saved: the scan is twenty files on a path that has already run
a full render. **Measure before optimising**, including when the optimisation is
one line and obviously harmless.

Six mutations, one of which survived and was right to: the HEAD assertion was
satisfied by the sitemap rule on its own, so narrowing the page rule back to GET
stayed green. Counted rather than found now.

Live afterwards: `/el` still served from a file with no cookie, `/cache/el.html`
**403**, `HEAD /el` served from the file, `sitemap.xml` still `application/xml`,
and the whole deploy story - touch a template, doctor refuses and names the
command, warm rebuilds, doctor passes.

399 PHP tests, 184 JS tests, build clean.

**The settings screen needs a human.** The checkbox is in the shipped bundle but
has not been clicked; there is still no component harness (#94).

---

## 29. A Module became translatable, because the URL said it was not

#114, step one of three. Raised by the owner from three live addresses:

```
/el/ypiresies/proino
/en/ypiresies/breakfast
/fr/ypiresies/petit-dejeuner
```

The entry was translated and the thing containing it was not. `modules` held
one `name` and one `slug`, so every language carried the Greek transliteration
in the middle of its URL - and checking the French page showed it was worse
than the address: `<title>` and `<h1>` read **Υπηρεσίες**, and the French home
page listed the Greek name of every module.

That is this product's one differentiator failing in the shop window.
BUSINESS.md puts the whole argument on multilingual-by-data-model against a
cheap WordPress build, and a French URL reading `ypiresies` is the first thing
a client sees in a demo.

### `module_slugs`, and what `modules.slug` now means

Rows rather than a JSON column, for the reason `entry_slugs` are rows: the
public side resolves a module by a translated value on every cache miss, and
#58 already settled that this has to be one read of one index. The rule is not
"everything in tables", it is "whatever you search by goes in a table".

`modules.name` and `modules.slug` **stay, with a narrower meaning**: they are
the panel's. The admin API resolves `/api/modules/{module}` by slug, and that
key cannot depend on a content language because the panel does not have one.
Everything a visitor reads or types now comes from `module_slugs`.

### Two rules, both the owner's

**No translation means no page.** A module nobody has translated into French
has no French address, is not in the French menu and is not in the sitemap. The
alternative - falling back to the default language's slug - is exactly what
produced `/fr/ypiresies`, and it tells a search engine that a Greek address is
a French page. It follows through: an entry translated into a language whose
*module* is not has no address there either, because there is no first segment
to hang it on, so `alternatesForEntry` checks both.

**A new module exists in every active language at once**, seeded on the model's
`created` event rather than in the controller - a rule only the panel honours
holds until somebody uses the API, the same reasoning `isSingleton()` rests on.
"No translation" is about a language the owner has not reached yet, not about
the moment of creation. The full suite said so before any of this was written:
thirty-two tests create a Module directly, and every one of them went dark.

### Checked

Eleven tests written first, all eleven failing because nothing existed. Then
eight mutations - **two survived**, and both were tests that never reached the
code they claimed to cover: the alternates check only mattered for an entry
whose module lacks a language, and the seeding was invisible inside a file that
deletes the seeded rows. Two tests added, re-mutated, all eight bite.

Then the migration on the live MySQL database: 39 rows for 13 modules across
three languages, and **all three of the addresses this item was raised about
still answered 200** - the backfill's whole job. Translating `ypiresies` by
hand afterwards gave `/fr/prestations/petit-dejeuner`, titled *Petit-déjeuner*,
with three `hreflang` alternates all pointing at addresses that exist.

And `/en/ypiresies/breakfast` answered **404**, which is not a defect but the
argument for step three: renaming a slug changes every URL beneath it, and #69
stops being *first real client* work.

413 PHP tests, 184 JS tests, build clean.

**Steps two and three are not done.** There is still no endpoint that updates a
Module - `ModuleController` has `store` and `index` and nothing else - so
translating one means a hand-written UPDATE. That is next.

---

## 30. The panel learned to name a section in each language

#114, step two. The owner went to add a module and found nowhere to put a
second language - no per-language name, no per-language address, and a slug
generated automatically. Their objection was the sharp one: **how is PHP
supposed to translate?**

It is not, and it must not try. `Str::slug` **transliterates**: from Υπηρεσίες
it produces `ypiresies` whatever language you ask it for, which is exactly how
`/fr/ypiresies` came about. The resolution is that translation is not the
machine's job. The person types the name in each language, and the derivation
runs once per language on that language's own words - `Prestations` gives
`prestations`. Automatic generation stays; it just stops being asked to do
something it cannot do.

### The first endpoint that has ever edited a Module

`ModuleController` had `store` and `index` and nothing else, so translating one
meant a hand-written UPDATE. `PUT /api/modules/{module}` is deliberately
narrow - names and addresses only. The schema is not editable there: what
editing one means for the entries already written against it is an open
question (TASKS.md, *To discuss*), and a rename endpoint is the wrong place to
answer it by accident.

Three rules came with it. A language left out of the payload **loses** its
translation, the same rule `syncSlugs` follows for an entry - that is how a
client removes a section from a language. An explicit slug still means "exactly
this", and a duplicate is a 422 rather than a silent rename, **per language**,
since `/el/services` and `/en/services` are different pages. And `modules.slug`
never moves after creation: it is the panel's route key, and a key that changed
under a rename would break every address the panel is holding at that moment.

### One endpoint was answering two audiences

`LanguageController::index` filtered `is_active`, and that quietly blocked a
**paid** workflow. Adding a language is a service the agency performs
(BUSINESS.md 5, TASKS.md #52 - there is deliberately no endpoint for it), and
the client then fills it in. But an active language puts a link in the public
switcher to a half-empty site while they work, and an inactive one is invisible
in the panel so they cannot work at all. Neither is usable.

The filter is gone. The public side never asked this endpoint anything -
`PageController` and `SitemapController` query `is_active` themselves - so what
a visitor sees is untouched, and the panel now shows each language with its
state, marking one that is not published yet.

### Two things the checking caught

**A rename left the old pages on disk**, and the live probe is what found it:
after renaming the French section, its old address still answered 200.
`syncTranslations` deletes the slug rows en masse, which fires no model events,
and the module row is never saved, so `StaticPageObserver` never runs. Nothing
had any reason to remove the file. That is precisely the trap
`EntryController::syncSlugs` carries a comment about, walked into again in an
endpoint written a day later. It flushes now, and a test renames a section and
asserts both the module page and an entry page under it are gone.

**`TranslationTest` refused a translation key.** The new per-language label was
`Name`, which the *theme* already translates for the enquiry form - and core
translating it too is exactly what `test_core_and_the_client_do_not_claim_the_same_key`
forbids, because which catalogue wins would be an accident of load order. The
panel has its own word for this and now uses it.

### Checked

Ten tests written first, eight failing because the endpoint did not exist and
two because the derivation used one name for every language. Then six
mutations, all of which bite.

Live over HTTP: a module created in three languages answered on all three
addresses, renaming the French one moved it and **retired the old address to
404**, and asking for an address another section already holds was refused
`422` with the field named. The probe module was deleted and the deletion
verified rather than assumed - the previous two cleanups in this session
reported success and left rows behind.

424 PHP tests, 184 JS tests, build clean.

**The screen itself has not been clicked.** There is still no component harness
(#94), so `ModuleBuilder`'s per-language block is verified by reading and by the
API underneath it.

### The endpoint had nothing that could reach it

Reported by the owner an hour after the above landed: they created a module,
left French blank, and then could not change it - there is no edit on a module
row and never has been. `PUT /api/modules/{module}` had shipped with no screen
calling it, so the item was half done and looked finished.

That is the failure worth naming: **an API nothing can reach is not a feature**,
and the test suite cannot tell the difference. Every test written for step two
passed, and the endpoint was unreachable from the product.

- `ModuleTranslator` is the screen, opened from **Rename** on each row.
- `ModuleTranslations` is the per-language block itself, now **shared** by the
  create and rename screens rather than copied - two copies would drift the
  first time one gained a field.
- `GET /api/modules` carries each module's translations, so the list can show
  which languages a section is missing without a request per row. That is the
  half that would have prevented the report: the owner could not see that
  French was blank.

425 PHP tests, 184 JS tests, build clean. **The screens still need a person**
(#94): the browser pane cannot reach the running Vite dev server, so what is
verified here is that the bundle builds and the panel boots, not that the
button does what it says.

---

## 31. A schema can be edited, up to where it would reshape stored data

#115, and the owner's objection an hour after #114's edit screen landed: *"why
can I only rename? I might want to add a column. Leave out deleting a column or
renaming one or changing its type - what harm do the rest do? Why can I not
make a field required after creating a module?"*

None, and the objection was right. The rule had been "editing a schema is
dangerous, so there is no editing", which is a category answer to a question
that is really asked once per change:

> does this change the shape of what is already in `entries.data`?

**No** for adding a field, reordering, `required`, `validation` and a select's
`options`. Nothing stored becomes unreadable - `EntryPresenter` reads
`$entry->data[$name] ?? null`, so a field nobody has filled renders empty, and
an entry written before it existed keeps working.

**Yes** for renaming a field, removing one, changing its type, and one the
owner did not list: **`translatable`**. It looks like a checkbox and is a type.
It decides whether the stored value is a scalar or a map of language to value,
and nothing migrates what is already there. `EntryPresenter` guards with
`is_array`, so turning it on does not crash - it leaves the scalar in place and
**prints the Greek text on the French page**, which is worse than a crash
because nobody is told.

Those four stay a hand-written migration. That settles TASKS.md → *To discuss* →
*What does editing a Module mean for its Entries?*, which had listed exactly
this as the first of three shapes: **additive edits only**.

### The consequence that is accepted rather than solved

A field made `required` leaves every existing entry that lacks it unsaveable
until it is filled. Nothing is lost and it is recoverable by un-requiring it -
and it is what "required" means. The old analysis listed this as an argument
*against* allowing the edit; it is really an argument for saying so out loud.

### Refused in the API and disabled in the form

`refuseReshaping()` answers 422 with the field named - *"The type of title
cannot change once entries have been written against it"* - and `ModuleFields`
disables those controls on a field that already exists, so nobody fills in a
form that will be rejected. `ModuleFields` and `ModuleTranslations` are both
shared by the create and edit screens; extracting the first one is what made
the edit screen possible at all rather than a second copy to keep in step.

### One defect the extraction introduced and the build did not see

The extracted component read `fieldTypes.types`. The generated file calls it
`supported`, so the type dropdown would have been **empty** on both screens -
and `npm run build` is perfectly happy with a property that does not exist.
Caught by reading the diff against the file it came from.

### Checked

Thirteen tests written first, eleven failing because the endpoint ignored
`schema` entirely. Six mutations, all of which bite - including one that skips
the reshaping check and one that never saves.

Live over HTTP against a module with an entry already written against it: add,
require and reorder all answered 200, and rename, remove, retype and flip
`translatable` all answered 422 naming the field. The entry written before the
new field still served its page with its title intact. The probe module was
deleted and the deletion verified.

438 PHP tests, 184 JS tests, build clean.

**The screens need a person** (#94): the browser pane cannot reach the running
Vite dev server, so the locking is verified by reading and by the API refusing
the same four underneath it.

### The review of it found ten, and one it did not

**The module update was not a transaction.** `syncTranslations` deletes every
slug row and re-inserts them one per language, so a failure part way through
left the module with fewer addresses than it had — measured before the fix, a
staged failure on the second insert took a module from two addresses to one.
Since #114 that means a section that simply stops having a public page. It is
TASKS.md #77 one level up, and `EntryController` has wrapped the identical
delete-then-insert since then. Now `DB::transaction`.

**And an eleventh the review missed**, found while working out how the insert
could fail at all: **nothing validated the keys of `translations`**.
`module_slugs.language_code` is `varchar(5)`, so a longer key was a 500 on
MySQL rather than a 422, and a short unknown one silently created an address in
a language nothing will ever serve. That is CHANGELOG §17 exactly, one level
up, written without it. Membership of **any** language rather than the active
ones, because the panel has to translate into one that is not published yet.

Three were in the screen shipped an hour earlier, and all three came from the
same root: **the field logic lived inside a component, where nothing could
test it.**

- The lock keyed on `lockedNames.has(field.name)` — the text being typed rather
  than the row. Adding a field and typing a name that already existed disabled
  its own input mid-word, and it could then be neither corrected nor removed.
- `_id: (nextId += 1) + fields.length + schema.length` repeats: add three,
  remove two, add again and the new row takes an id a surviving row holds. Two
  rows with one React key means text typed into one appears in the other.
- Options round-tripped through `join(', ')` and `split(',')`, so a stored
  option reading *Ημιδιατροφή, με πρωινό* was torn into two — on **any** save,
  including one that only changed a translation, because the screen posts the
  schema every time.

All three are gone into `resources/js/lib/moduleFields.js` as pure functions
with twelve tests: a row carries its own `locked`, `nextFieldId` derives from
the rows themselves, and a `select` option is only re-split when somebody
actually edited the text. That also removed the copy-pasted `addField` /
`removeField` / `updateField` trio, which the extraction of `ModuleFields` had
been supposed to prevent and had not.

The rest: the double flush is gone — one `$module->save()` covers both halves
now, and `syncTranslations` no longer flushes on its own; `SchemaRuleBuilder`
runs before `refuseReshaping`, so the guard no longer depends on a later check
to catch a payload naming one field twice; and the accepted cost of `required`
is asserted rather than only written down.

**Two of the ten were wrong, and saying so is the point of checking.** The
claim that `schema: []` was silently ignored was false — the test written to
prove it passed immediately, because Laravel keeps the empty array here. And
the `keyBy` collapse was never reachable: `SchemaRuleBuilder::build` refuses a
duplicate name unconditionally, so nothing could have landed. The reorder makes
the guard self-sufficient rather than fixing a live defect.

Verified live against MySQL afterwards: an option containing a comma survived a
rename intact, and `this-is-not-a-language` answered **422** with the key
named. The probe module was deleted and the deletion checked.

444 PHP tests, 196 JS tests, build clean.

---

## 32. The panel's language now decides which content language it opens on

#116, and the owner's report: the panel had el/en, the site had el/en/fr, and
switching the panel to English still listed every module and entry in Greek.
*"If I am an English speaker and I switch the panel to English to find my way
around, I want the listings in English too."*

#96 separated the two axes for a good reason — the panel's language is a file
in `lang/`, the content's is a row in `languages`, and a German owner may well
run a Greek and English site. Nothing about that argues they should be
*ignored* where they overlap. Translating the interface and leaving the content
on the default is the half of the job nobody asked for.

The rule is the owner's own: **follow the panel when the site has that
language, fall back to the site's default when it does not.** A panel in German
over a site of el/en/fr opens on Greek; the same panel in English opens on
English.

`contentLangCode(languages, panelLocale)` decides it, with two limits worth
naming. It decides the **initial** language only - the selector still switches
it by hand, and changing the panel's own language reloads the page, so the two
cannot drift apart while somebody is looking at them. And it ignores an
**inactive** language: one is offered in the panel so it can be translated
ahead of going live (#114), which is not a reason for a listing to open on it.

### Four places, and the fourth was found by looking

The module list, the entries table and the entry form's opening tab were the
obvious three. The fourth was the **heading of the entries screen**, which went
on reading `module.name` - so the first live check showed an interface entirely
in English above a section still titled *Υπηρεσίες*. That is precisely the
inconsistency being fixed, one line further down the page, and only opening the
screen showed it.

### Checked

Five tests written first, all five failing because the function did not exist.

Live, both directions, on a site with three content languages and a panel with
two:

| Panel | The module list reads |
|---|---|
| **EN** | The team, Services |
| **EL** | Η ομάδα, Υπηρεσίες |

The Slug column beside them does not move: it stays `h-omada` and `ypiresies`,
the panel's own key. The first version of this changed that column as well, and
the review put it back — below.

and the entries table under *Services* opened on **EN** with English titles.
Modules nobody has translated - *το χωριό*, *Σχετικά*, *Δωμάτια* - show what
they have, which is what the fallback is for.

The mismatch case (a panel language the site does not have) is covered by the
unit test rather than live: this installation has no `lang/de.json`, so the
panel cannot currently be set to a language the site lacks.

444 PHP tests, 201 JS tests, build clean.

### The review of it found eight

**The rule held for one of the function's two branches.** `contentLangCode`
filtered `is_active` when matching the panel's language and then fell through
to `defaultLangCode`, which never looked at it — so with the default
deactivated, or with nothing flagged default and an unpublished language first
by id, a listing could open on a language the public site does not serve at
all. It is three steps now, narrowing: the panel's own if the site publishes
it, the published default, and only when *nothing* is published the plain
default, because a site still being set up has to stay editable.

Beside it, a null panel locale compared equal to a row carrying no `code`, and
the function answered `null` instead of falling back. Not reachable from the
panel — `locale` defaults to `'en'` — but the signature offers `null` and a
test asserts that case.

**The module list flashed the wrong names.** It rendered the moment `/modules`
resolved, while the language to read those names in came from a second request:
every visit to the panel's landing screen showed the untranslated names and
then flipped, a visible flicker of exactly what this change set out to remove.
One `Promise.all` now, with the languages allowed to fail on their own.

**The Slug column had stopped being the slug.** It showed the per-language
public address, which is not what `/api/modules/{module}`, Edit or Entries
resolve by — and it fell back to the panel key for an untranslated module, so
one column mixed a public address and an internal identity row by row. Back to
`mod.slug`, which is what the heading always meant.

**Five screens each fetched `/api/languages`.** `lib/languageStore.js` asks
once per page load. Measured live with `performance.getEntriesByType`, a list
→ entries → list round trip is now **one** request where it was three. A
rejection is deliberately not cached: one screen's dropped connection should
not follow somebody around the panel.

And the empty-list message still read *"No active languages. Add one before
writing content."* Since #114 that endpoint returns unpublished languages too,
so the branch now means "this site has none at all" — and either way it asked
the reader to do something there is deliberately no endpoint for (#52).

Two findings were cleanup with a point behind them: `nameOf` and `addressOf`
scanned the same row twice, and nothing pinned that the screens *use*
`contentLangCode` — which is how the entries screen's heading went the whole
of this change reading `module.name`, and was caught by opening the panel
rather than by the suite. Both are answered by `lib/modules.js`, where the
decision is a tested function that two screens call.

One mutation survived, and was right to: the line it changed was not the one
doing the work. What stops a null panel locale matching a codeless row is the
null check below the coercion, not the coercion itself; re-mutated there, the
test bites.

Verified live in the panel: the list reads *The team* and *Services* over
`h-omada` and `ypiresies`, and one `/api/languages` covers a list → entries
→ list round trip.

444 PHP tests, 214 JS tests, build clean.

## 33. An address that moved says where it went (#69, step three of #114)

#114 gave a Module a name and an address per language, and step two put a
Rename screen in front of it. Together they made a defect the item had already
predicted: **renaming a section moves every URL underneath it**, and until now
the old ones simply died. Translating `ypiresies` to `services` turned
`/en/ypiresies/breakfast` into a 404 at the moment the owner pressed a button
in their own panel — and for a live site that is the rankings the client had,
lost by a delivery we performed. That is why the owner made #69 step three
rather than *first real client* work.

#69's own case is the same table from the other end: a client's previous
website has URLs Google already knows, and on the day the new site goes live
they must not answer 404.

### The table

`redirects` — `from_path`, `to_path`, `status`, 301 by default, both paths 512
characters because a language code, a module slug and an entry slug are about
518 at their widest and `from_path` is a unique index InnoDB caps at 3072
bytes. A path too long to record is logged and skipped: a redirect that cannot
be written must not cost the author their rename, the same rule
`StaticPages::write` follows for a page it cannot bake.

**No endpoint.** Renames write their own rows; the client's old site is rows
the agency writes by hand, exactly like adding a language (#52). A client
editing redirects is a support call about a redirect loop.

### It runs from the 404, not from a middleware

#69 said "one middleware", and that is not what shipped. `bootstrap/app.php`
asks `Redirects::answer` while rendering a `NotFoundHttpException`, which is
better on three counts:

- it is the only moment the question is worth asking, so no request pays for a
  lookup it does not need;
- **a stale row cannot hide a live page.** By the time this runs the router and
  the controller have both declined, so a row can only ever add an answer where
  there was none. A middleware asking first would let one hand-written row take
  a working page off the site;
- it catches both kinds of miss. A renamed module still *matches*
  `/{language}/{module}` and 404s inside the controller, while
  `/rooms/deluxe.html` from the old site matches no route at all. A route-level
  hook covers only the second.

### A 404 stays a 404 when the lookup fails

Found by the suite within minutes: `CoreSiteBoundaryTest` boots the router
without a schema, and the new query turned its 404 into a **500**. In
production the same shape is a database that is down, or a deployment where
nobody ran the migrations — and this is the last thing between a visitor and
the page saying there is nothing here. The lookup is wrapped and logged, and a
test drops the table to keep it that way.

### Chains are flattened when they are written

So serving is one lookup, and a client who cannot settle on a name does not
build a queue of hops:

| After | The table holds |
|---|---|
| `services` → `facilities` | `/en/services` → `/en/facilities`, plus one row per entry page |
| `facilities` → `amenities` | `/en/services` → `/en/amenities`, `/en/facilities` → `/en/amenities` |
| renamed back to `services` | only `/en/facilities` → `/en/services` |

The third row is the loop case: repointing turns the first rename's row into
`/en/services` pointing at itself, and it is deleted rather than left inert.
`answer()` refuses to serve a self-reference anyway, but a table filling with
them is one hand-written edit away from being read as a real destination.

### The destination is a path on this site

Never a URL, and never `//host` — which starts with a slash, passes a naive
check and sends every visitor who hits that address to somebody else's server.
Rows are written by hand, so an open redirect here is one UPDATE away rather
than hypothetical. Checked when a row is written **and** when it is served,
because only the second covers a row that never went through the service.

### Entries too, deliberately

Step three was written for module renames, and an entry rename is the same
defect through the same door — more common, since an entry is renamed far more
often than a section. `EntryController::syncSlugs` records its own moves, in
the same place and for the same reason `StaticPageObserver` reads the old
addresses *before* the rows are replaced: a mass delete fires no model events,
and afterwards nothing can say where the pages were.

A module rename also writes a row for **every entry page** in that language,
not just the listing, because those are the addresses a client actually has
links and rankings for.

### What is not done

Nothing reads a client's old site to produce their rows. That is an import
against a URL list, and it belongs to the first delivery that needs one.

### Checked

Thirteen tests, written first and failing for the right reason (404 where a 301
was expected, and no such model). Nine mutations, and two of them are worth
recording:

- removing the loop-guard delete **survived**, because the address it protects
  is live and never reaches the 404 at all. The guard was real but nothing
  could see it, so the test now asserts the row is gone rather than only that
  the page still serves. It bites;
- catching `RuntimeException` instead of `Throwable` also survived — a
  `PDOException` *is* a `RuntimeException`, so the mutation changed nothing.
  Re-aimed at `LogicException`, it bites.

Live, over Apache against MySQL, with a `zz` probe module and one entry:

| Asked for | Answer |
|---|---|
| `/en/zz-services` | **301** → `/en/zz-facilities` |
| `/en/zz-services/zz-breakfast` | **301** → `/en/zz-facilities/zz-breakfast` |
| `/en/zz-facilities/zz-breakfast` | 200 |
| `/el/zz-ypiresies/zz-proino` (untouched language) | 200 |
| `/en/zz-nothing-here` | 404 |

The probe was removed afterwards and the removal checked rather than assumed:
zero `zz` modules, module slugs, entry slugs and redirect rows, 15 modules and
54 entries left — all the owner's own. The site was re-baked with
`pages:warm` (72 pages, and the three `τεστ κεις` failures of #113, which is
recorded and older than this).

457 PHP tests, 214 JS tests, build clean.

### The review of it found twelve

Three were bugs on the path that had just been built and verified.

**A hand-written status that is not a redirect answered 500.** Symfony's
`RedirectResponse` throws on anything that is not 3xx, and this code runs *while
a 404 is being rendered* — so `status = 200`, or `30` typed for `301`, turned
an address that used to answer 404 politely into a server error. The column
accepts 0 to 65535 and the rows are written by hand: that is the same threat
model that had already earned the open-redirect check twenty lines above, and it
had been applied to the destination and not to the status. Anything unrecognised
is served as 301 now.

**A Greek address never matched its row.** `getPathInfo()` is percent-encoded
and a person writing a row types what they read. Verified rather than reasoned:
`Request::create('/el/δωμάτια')->getPathInfo()` answers
`/el/%CE%B4%CF%89%CE%BC%CE%AC%CF%84%CE%B9%CE%B1`, and `/rooms/deluxe suite.html`
answers `/rooms/deluxe%20suite.html`. #69 exists for a client's previous
website, and the first market is Greek accommodation — a Greek WordPress site
with Greek permalinks is the *normal* case. The agency would have inserted the
row, tested it, seen a 404 and had nothing in the logs to explain it. Both ends
are decoded now, a row written either way matches, and the `Location` header is
encoded again on the way out. Decoding happens before the safety checks, so
`/%2Fevil.example` is still refused.

**Query strings were ignored at both ends.** An old site addressed by query —
`/index.php?p=17`, which is every pre-permalink WordPress — collapsed to one
key, so it could not be expressed at all; and a live link carrying
`?utm_source=` to a renamed page arrived stripped, so the client's own campaign
reporting went blank on exactly the pages that moved. A row may now be keyed by
its query, the most specific key wins, and the visitor's query is carried across
unless the row was matched by it.

**A rename cost three statements per address.** Two hundred entries in three
languages is six hundred moves, so about 1,800 statements and 600 savepoints
inside the request holding the panel's Rename button — and the failure mode is
a timeout that rolls the rename back, which looks to the owner like nothing
happened. It is three statements per chunk now: one bound `CASE` to repoint the
chain, one delete, one upsert. Measured at 21 moves: **63 writes became 3**, and
a test pins it the way `EntryOrderingTest` pins reordering.

**The migration restated 512** while `Redirect::PATH_MAX_LENGTH` had been added
in the same commit precisely so the width lived once — #98's own defect, on the
day it was written about. It reads the constant.

**MySQL and SQLite disagreed about case.** MySQL's default collation folds it
and SQLite's does not, so `/Rooms` and `/rooms` were one row in production and
two in the suite: a client's old site holding both would have been a
duplicate-key 500 no test could see. `utf8mb4_bin` on both path columns, named
only where it exists — SQLite rejects the name outright, which the suite said
immediately.

**Nothing removed a row when the page it pointed at was deleted.** Rename an
entry, then delete it, and the old address answered 301 into a 404 — which is
worse for the client than the address simply being gone, because a crawler
follows it and records the *new* address as broken. `RedirectObserver` handles
it on `deleting`, for the same reason `StaticPageObserver` does: the slug rows
cascade.

**Drafts were recorded too**, so a site being written over a winter collected a
dozen rows per rename per language, each a redirect from a 404 to a 404.
Published entries only.

The last three were the shape of the code rather than its behaviour. Addresses
were composed by string interpolation, making this the third place that knew
what a public URL looks like — it goes through `route()` now, so `routes/web.php`
decides the shape and `StaticPages` and this both follow it. `entryMoved`
queried `slugFor` once per language on a relation that is never loaded, which is
one `loadMissing`. And the two `moved` methods were the same loop twice, with
the subtle part — *a language missing from the new map means there is no page
there, which is #114's decision rather than an oversight* — explained on only
one of them; one private helper says it once.

**Nothing pinned the method guard.** Only the `api/*` half had a test, so
deleting the GET/HEAD check or the `expectsJson()` half passed the whole suite —
which is exactly how `carriesSessionState` was lost (section 27). Both are
pinned now: a POST to a moved address stays a 404, and so does a request that
wants JSON.

Twelve mutations, all biting, including one per fix above. Live over Apache
against MySQL: an encoded request matched a Greek row, a row whose status was
200 answered 301, a query-keyed row answered without carrying the query on, a
visitor's `?utm_source=` survived the move, `/ZZ-OLD` stayed a 404 where
`/zz-old` redirected — which is the collation, and the one thing the SQLite
suite cannot prove — and a destination off the site stayed a 404. Five rows
written, five removed, none left.

470 PHP tests, 214 JS tests, build clean.

## 34. A Greek visitor is refused in Greek (#99, and #109 with it)

`php artisan lang:publish` had created `lang/en/` only. Laravel falls back
**per key** to `APP_FALLBACK_LOCALE`, so the two messages this project had
written by hand were Greek and every framework one — `required`, `email`,
`max`, `date`, `integer`, which is the majority of what anyone ever reads —
stayed English:

```
The email field must be a valid email address.
Παρακαλούμε συμφωνήστε να κρατήσουμε τα στοιχεία σας για να σας απαντήσουμε.
```

This is the product's one differentiator failing at the moment a prospect
tests the demo's contact form. The panel had the same gap from the other side,
because #67 had already fixed the half that names the field:
*"The Σελίδα Facebook field must be a valid URL."*

### What shipped

`lang/el/validation.php`, **partial on purpose**: the rules the enquiry form
declares plus everything `SchemaRuleBuilder` emits for the settings and entry
screens. The per-key fallback covers the rest, so a rule nobody uses is not a
gap — and copying all 120 of Laravel's would have been 120 lines for a future
translator to work through for nothing, which is the same argument that
deleted `auth.php`, `pagination.php` and `passwords.php` (#109). Nothing reads
those three, and Laravel's `FileLoader` searches the framework's own `lang/`
underneath the application's, so English is unchanged.

**The names are the other half.** Every framework line interpolates
`:attribute`, which is the request key — a translated file alone produces
*«Το πεδίο arrives_on είναι υποχρεωτικό»*, a Greek sentence closing around an
English column. `StoreEnquiryRequest::attributes()` names them, in the request
rather than in each locale's `attributes` array, so one declaration serves
every language including one a client's site has and core has no file for.

The labels are **core's own words**, and that is a boundary decision rather
than a preference: `TranslationTest` fails when core and the theme translate
the same key, so `__('Name')` would have had core reading a string
`site/lang/` owns (#61). A client whose form says *Όνομα* gets a refusal that
says *Ονοματεπώνυμο* — two words for one field, which is the price of the line
being in the right place.

### The test that would have caught it, and did not

#99 was found by reading, not by the suite: `TranslationTest` asserted on the
**consent** message, which is the one that had been translated. *A test
written from the same understanding as the code cannot find what that
understanding missed.* So this one asserts over **every** message a response
carries rather than a chosen one, and separately over the rules the two
surfaces **declare** rather than the ones a payload happens to trigger.

And then it missed something anyway. Live, `/el/enquiries` answered:

```
Το πεδίο Άφιξη πρέπει να είναι ημερομηνία ίδια ή μεταγενέστερη της today.
```

`after_or_equal:today` interpolates `:date` with the rule's own parameter. The
test asked whether a message *contains* Greek — which is true of an English
sentence wrapped around a Greek label, and is the exact shape of the whole
finding. It now refuses any Latin word outside a named list of loanwords
(`email`, `JSON`, `Facebook`…), and the rule has a written-out message like
`departs_on.after` beside it.

A mutation had already made the same point: replacing the Greek `required`
line with Laravel's English one **survived**, because the rendered message
still contained the Greek attribute label. The structural test now reads the
catalogue rather than a response — where `:attribute` is still `:attribute`
and no label can stand in for a translation.

### Checked

Six tests, written first and failing for the documented reasons. Five
mutations, all biting after that repair. Live over Apache against MySQL:

| | |
|---|---|
| `/el/enquiries` | six refusals, every one Greek, fields named *Ονοματεπώνυμο*, *Διεύθυνση email*, *Μήνυμα*, *Άφιξη*, *Άτομα* |
| `/en/enquiries` | the same six in English |
| the panel in `el` | *Το πεδίο Σελίδα Facebook πρέπει να είναι έγκυρη διεύθυνση ιστοσελίδας.* |
| the panel in `en` | *The Facebook page field must be a valid URL.* |

The panel's language was borrowed for that check and put back to what it was.

**Still open, one screen over**: the entry form reports against `data.title`,
so a Greek reader gets *«Το πεδίο data.title είναι υποχρεωτικό»*. It reads
under the field it belongs to, which is why #99 scoped the `attributes` half to
the enquiry form; it is recorded there rather than fixed here.

476 PHP tests, 214 JS tests, build clean.

