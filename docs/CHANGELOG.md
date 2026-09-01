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
