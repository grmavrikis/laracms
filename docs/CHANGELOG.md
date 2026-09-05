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

