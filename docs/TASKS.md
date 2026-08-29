# Tasks → MVP

Priority checklist to get to a safe, consistent MVP. We work in order
**P0 → P1 → P2**: P0 is stuff that makes the system unsafe or unstable,
P1 is inconsistencies that will become expensive if the schema system
grows before they're fixed, P2 is polish.

Format: `[ ]` open, `[x]` done. File references = `path:line`.

---

## Done

- [x] 8 files with unresolved git merge conflicts (`Controller.php`,
  `bootstrap/app.php`, `routes/web.php`, `DatabaseSeeder.php`, `app.css`,
  `vite.config.js`, `package.json`, `composer.json`/`composer.lock`).
  The app wouldn't even boot before this.

- [x] **1. Decide the translation model.** Checked whether
  `entry_translations`/`EntryTranslation` is used anywhere outside its own
  migration/model file — it isn't. `SchemaRuleBuilder`, `EntryController`,
  and `EntryForm.jsx`/`EntriesTable.jsx` already agree end to end on a
  different shape: translatable content lives *inside*
  `Entry.data.{field}.{lang}`. **Decision: that's the canonical model.**
  No code changes were needed — the real data flow was already
  consistent, only the unused `entry_translations` table/model were the
  leftover of the path not taken. Documented in
  [`ARCHITECTURE.md`](ARCHITECTURE.md#2-domain-model). Removing the dead
  table/model is tracked as P2 item #18 below.

- [x] **2. Entry/Module authorization.** Closed the cross-user data
  access hole. Entries are now reachable only through a Module the
  authenticated user owns, enforced two ways:
  - **Scoped route model binding** (`Route::scopeBindings()` in
    [`routes/api.php`](../routes/api.php)): `{module}` resolves by slug,
    `{entry}` resolves *through* `$module->entries()`, so an Entry in
    another Module is a 404 — guaranteed by the framework rather than by
    a check each method has to remember. Replaced every
    `Entry::findOrFail($id)`.
  - **[`ModulePolicy`](../app/Policies/ModulePolicy.php)**: another
    user's Module is a 403. Called from the controller for read/delete,
    and from `authorize()` on both Entry FormRequests (which now run a
    real ownership check instead of `return true`) so the Module schema
    can't leak to users who can't write to it.

  Covered by 8 tests in
  [`tests/Feature/EntryAuthorizationTest.php`](../tests/Feature/EntryAuthorizationTest.php),
  including the exact original attack (own module slug + someone else's
  entry id) and a happy-path test proving the owner flow still works.
  Full suite green (10 passed). API URL shape is unchanged, so the React
  client needed no changes.

  Resolved as part of the same change: **#3** (removed the
  `DEBUG_PAYLOAD` log), **#6** (module lookup is now slug-only — this was
  a live bug: a module with slug `"2"` coexists with the module of
  `id=2`, and the old `orWhere('id', ...)` matched both ambiguously),
  **#7** (FormRequests read the bound Module — zero extra queries), and
  **#16** (entry routes grouped together).

- [x] **4. Rich-text XSS.** Solved by removing HTML from the system rather
  than by sanitizing it.

  First pass stored HTML and purified it with HTMLPurifier. That worked,
  but it meant accepting an open language and then trying to remove the
  dangerous parts of it. Replaced with the stronger option: rich-text
  fields now store the **editor's document as JSON**
  (`editor.getJSON()`), a closed vocabulary with no `script` node type,
  so unsafe constructs cannot be expressed in the first place.
  HTMLPurifier was removed as a dependency, and the app now contains no
  `dangerouslySetInnerHTML` at all — the admin table renders a plain-text
  excerpt.

  [`RichTextDocument`](../app/Services/RichTextDocument.php) rebuilds each
  incoming document from known node types, marks and validated attributes.
  Attribute *values* still need real checks, since a closed vocabulary
  does not cover them: link `href` is parsed and restricted to
  `http`/`https`/`mailto`, while `target`/`rel` are set server-side rather
  than taken from the payload. Depth and node count are capped.

  Covered by 20 tests in
  [`tests/Feature/RichTextDocumentTest.php`](../tests/Feature/RichTextDocumentTest.php).
  Verified live too: posting a document containing a `script` node, a
  `javascript:` link mark and `textAlign: "evil"` stored only the
  paragraph with its `bold` mark intact.

  Existing HTML values were converted by
  `php artisan entries:migrate-richtext`
  ([command](../app/Console/Commands/MigrateRichTextToDocuments.php)) —
  2 entries, verified with `--dry-run` first, idempotent on re-run.

- [x] **5. Unknown field type silently becomes `string`.** The `default`
  arm in `SchemaRuleBuilder::rulesForType()` now throws a
  `ValidationException` naming the field and the offending type, instead
  of quietly validating it as a string.

  The silent fallback was hiding a real defect: `datetime` was accepted by
  `ModuleController` but had no arm in the rule builder, so a `datetime`
  field validated as a plain string and accepted
  `"definitely-not-a-date"`. Fixed by giving `date`/`datetime` a shared
  arm and by introducing
  [`SchemaRuleBuilder::SUPPORTED_TYPES`](../app/Services/SchemaRuleBuilder.php)
  as the single list, which `ModuleController` now validates against via
  `Rule::in(...)` — the two lists can no longer drift. Dropped the
  unreachable `number`/`email`/`url` arms (no module in the database used
  them; they were not creatable through the API).

  Covered by 4 tests in
  [`tests/Feature/SchemaFieldTypeTest.php`](../tests/Feature/SchemaFieldTypeTest.php),
  including one that builds a module using *every* supported type, which
  pins the API's accepted list to the rule builder's.

  Fixed alongside, because that last test hit it: posting a module
  **without** a `slug` returned a 500. `slug` is `nullable`, so the key is
  absent rather than null, and `$validated['slug']` raised "Undefined
  array key". One-line fix in the method already being edited.

---

- [x] **Entry save errors reached nobody.** `EntryForm` collapsed every
  failure into `alert('Failed to save.')`, discarding
  `response.data.errors`. So the 422 that P0 #5 was built to produce —
  naming the field and the unsupported type — was invisible in the app and
  loud only for API clients.

  Added [`lib/apiErrors.js`](../resources/js/lib/apiErrors.js) and used it
  from both forms. `EntryForm` now shows messages beside the field they
  belong to (covering `data.title` and every `data.title.{lang}`) and puts
  anything that belongs to no field — a schema-level complaint keyed under
  `data` alone — in a banner, where it would otherwise be dropped.
  `ModuleBuilder` was rewritten onto the same helper rather than keeping
  its own copy, and gains the status handling it lacked. The image upload
  in `EntryForm` also stopped using `alert`.

  The helper distinguishes what the old code flattened: 401, 403, 404, 419,
  5xx and an absent response each get their own wording, since "please try
  again" is useless advice for a 403.

  Verified against the real response bodies rather than assumed ones: a
  missing-field 422 returns
  `{"data":[…],"data.r1":[…],"data.r2":[…]}` and the unsupported-type case
  returns `{"data":["Module schema field 'mystery' declares unsupported
  type 'bogus'…"]}`. 19 node checks cover the helper, including that a
  field named `title` does not swallow errors for `titles`.

---

## P0 — Security / correctness blockers

*(none open)*

---

## P1 — Consistency before the schema system solidifies

- [x] **6. `moduleSlugOrId` contradicts the route contract.** Done with
  Done #2 — module lookup is now slug-only via route model binding.

- [x] **7. Duplicate Module/Entry lookups.** Done with Done #2 — the
  FormRequests read the already-bound Module instead of re-querying.

- [x] **21. A generated slug bypassed the uniqueness check.** `slug` was
  derived with `Str::slug($name)` *after* validation, so the
  `unique:modules,slug` rule never saw it — posting the same module name
  twice without a slug returned 201 then **500** on the DB unique index.

  Resolved by splitting the two cases, which are genuinely different
  requests: an **explicit** slug that is taken stays a 422, because the
  client asked for that exact value; a **derived** slug means "pick one
  for me", so `ModuleController::generateSlug()` picks a free one
  (`products`, `products-2`, `products-3`).

  It also fixes a second way to get an unusable module: `Str::slug()`
  returns `''` for a name made only of punctuation, and since the slug is
  the route key an empty one makes the module unreachable. Such names now
  fall back to `module`. Greek names were already fine —
  `Str::slug('Εστιατόρια')` gives `estiatoria` — and a test now pins that,
  since #8 depends on it.

  Known limit, noted in the code: `generateSlug()` is a check-then-insert,
  so concurrent requests could still race. The unique index stays the real
  guarantee.

  Covered by 5 tests in
  [`tests/Feature/ModuleSlugTest.php`](../tests/Feature/ModuleSlugTest.php).
  Verified live: three posts of the same name gave `live-slug-probe`,
  `-2`, `-3`; an explicit taken slug gave 422; a Greek name gave
  `estiatoria-probe`; `"???"` gave `module`. Probe modules cleaned up.

- [x] **8. Slug generation in two places.** `ModuleBuilder.jsx` carried its
  own `greekToLatin`/`slugify` and *sent* the result, so the frontend's
  version was the one actually stored and the backend's `Str::slug` never
  ran. Measured the two against each other — they disagreed on 4 of 9
  sample names:

  | name | frontend | backend |
  |---|---|---|
  | Νέα & Ανακοινώσεις | nea-anakoin**o**seis | nea-anakoin**w**seis |
  | Ψυχαγωγία | ps**ych**agogia | ps**ikhagh**oghia |
  | Ξενοδοχεία 2026 | **x**enodo**ch**eia-2026 | **ks**enodo**kh**ia-2026 |
  | Café Münchén | **caf-m-nch-n** | cafe-munchen |

  The last one is the worst: the map only covered Greek, so accented Latin
  was stripped to hyphens.

  Removed the frontend implementation entirely rather than trying to keep
  two in sync. The slug box is now optional and blank by default; leaving
  it blank omits the key so the backend derives it (#21), and typing one
  sends it as an explicit request. No live preview is shown, because the
  only honest preview would have to come from the backend — showing a
  locally computed guess is what caused this.

  Verified live: posting `Ψυχαγωγία Probe` with no slug stored
  `psikhaghoghia-probe`, where the old frontend would have sent
  `psychagogia-probe`. **Not verified by clicking through the form** — see
  the note under #22.

- [x] **20. Known vulnerabilities in dependencies.** `composer audit`
  reported 12 advisories across `guzzlehttp/guzzle` (one rated high:
  CVE-2026-69246, host-based check bypass) and `league/commonmark`.
  Cleared with `composer update guzzlehttp/guzzle league/commonmark -W`,
  which moved six packages, all within their current major version:

  | package | from | to |
  |---|---|---|
  | guzzlehttp/guzzle | 7.14.0 | 7.15.5 |
  | guzzlehttp/psr7 | 2.12.4 | 2.13.1 |
  | guzzlehttp/promises | 2.5.1 | 2.5.3 |
  | league/commonmark | 2.8.2 | 2.10.0 |
  | nette/schema | 1.3.5 | 1.3.6 |
  | nette/utils | 4.1.4 | 4.1.5 |

  `laravel/framework` itself did not move, which kept the change
  contained. `composer audit` now reports none.

  Low risk by construction, and checked rather than assumed: neither
  package is a direct dependency, and nothing under `app/`, `routes/` or
  `resources/js/` references Guzzle, the `Http` facade or CommonMark —
  they are framework-level deps this CMS never calls.

  Verified with 43 tests passing and a live pass over `mini-cms.test`:
  login, `/api/modules`, `/api/modules/rest/entries`, `/api/languages`
  and `/admin` all 200, plus a create/delete round trip (201 then 204)
  whose document came back intact.

- [x] **9. Field types inconsistent frontend/backend.** The API accepted
  `textarea` and `richtext`; the form offered neither. The fix was not to
  add them to the form, because all three names behaved *identically* —
  each rendered the Tiptap editor and stored a document — and three
  dropdown entries doing one thing is worse than one. Collapsed to `text`
  as the single rich-text type, in `SUPPORTED_TYPES`,
  `RichTextDocument::FIELD_TYPES` and `richText.js`. Verified first that no
  module used either alias.

  Added [`FieldTypeConsistencyTest`](../tests/Feature/FieldTypeConsistencyTest.php)
  so this cannot drift again: it reads the two JS literals and compares
  them against the PHP constants. That is a workaround for having no JS
  test runner (#22) and is sensitive to reformatting of those literals —
  the test says so.

  Verified live: posting a module with `textarea` or `richtext` now
  returns 422, `text` returns 201.

  Note: the frontend list carries labels the backend has no notion of
  (`Datetime`, `Image`…). Only the type values are pinned; the labels
  stay a frontend concern.

- [x] **23. Dropping the type aliases left no migration path.** #9 removed
  `textarea` and `richtext` from `SUPPORTED_TYPES`, which broke any module
  already declaring one in two ways at once: entry writes threw
  "unsupported type", and
  [`MigrateRichTextToDocuments`](../app/Console/Commands/MigrateRichTextToDocuments.php)
  selects fields through `isRichTextField()`, so legacy HTML in such a
  field could not even be converted out. A regression from #9, not a
  pre-existing fault.

  Fixed by separating the two questions #9 had conflated. *Creatable* is
  still the eight types in `SUPPORTED_TYPES`. *Readable* now also includes
  `RichTextDocument::LEGACY_FIELD_TYPES` — the aliases only ever meant
  `text`, so the rule builder normalises them to it and
  `isRichTextField()` matches them. The module form is untouched and still
  offers one rich-text choice, which was the point of #9.

  `richText.js` mirrors the legacy list too, otherwise the form would
  render a document object into a plain text input.

  Covered by 6 tests: entries save on a legacy-typed module, the types
  still cannot be created, and both JS lists are pinned to the PHP
  constants. Verified live end to end: a `richtext` module holding
  `<p>legacy <strong>html</strong></p>` was picked up by the migration
  command and converted with its bold mark intact, and a POST to that
  module returned 201.

- [x] **24. A translatable field can never be optional.** A translatable
  field produces two levels of rules — the map of language code to value,
  and each value inside it — but only the inner level was built from the
  field's `validation` string. The outer key was hardcoded
  `['required','array']`, so every translatable field was mandatory
  regardless of configuration, while a non-translatable field of the same
  type was not.

  The outer level now follows the field's own rules: `['required','array']`
  when the field is configured required, `['nullable','array']` otherwise.
  Per-language rules are unchanged.

  **Behaviour change worth knowing about:** translatable fields with an
  empty `validation` box were *accidentally* mandatory and are now
  optional. That affects existing modules — verified live, posting to
  `rest` with `r2` omitted returned 201 where it previously returned 422.
  Requiredness is now something you opt into by typing `required` in the
  field's validation box, which is what that box was always for.

  Covered by 6 tests in
  [`TranslatableFieldValidationTest`](../tests/Feature/TranslatableFieldValidationTest.php),
  three of which reproduced the bug first.

---

## P2 — Polish

- [x] **10. Pagination is wrong in the UI.** `EntriesManager` read only
  `data` from the paginated response and dropped the rest, so the table
  counted the rows it held and called that the total, and nothing could
  reach past the first 15 entries.

  The response metadata is now kept and passed down:
  [`lib/pagination.js`](../resources/js/lib/pagination.js) reduces the
  paginator envelope to what the table needs, and `EntriesTable` shows the
  real total with Previous/Next controls and a "showing X to Y of Z" line.
  Requesting a page past the end — after deleting entries, or switching to
  a smaller module — falls back to the last page instead of rendering
  blank. Creating an entry returns to page 1, since the list is newest
  first; editing leaves the reader where they were.

  **Found while testing this:** ordering was not a total order.
  `EntryController::index` used `latest()` alone, and entries saved in the
  same second tie on `created_at`, leaving the database free to order them
  as it likes — which is how a paginated list repeats or skips rows. It was
  not hypothetical: 18 entries sharing a timestamp came back *oldest*
  first. Added an `id` tie-break. Fixed here rather than logged because
  page controls over an unstable sort would be a feature shipped broken.

  13 node checks cover the helper, 3 PHP tests cover ordering and the page
  boundaries. Verified live on MySQL: page 1 now starts at the newest
  entry, and the two pages together return 18 distinct ids for 18 rows.
- [x] **11. A `lang` param was sent and never read.** `EntriesManager`
  passed `lang` to `GET .../entries`; `index()` has no parameter for it.
  Confirmed against the live endpoint — `lang=gr`, `lang=en` and
  `lang=NONSENSE` all returned byte-identical responses.

  Removed rather than implemented. Language switching is deliberately
  client-side: an entry carries every translation and `EntriesTable` picks
  one to display, which is what makes switching instant. Filtering
  server-side would mean flattening `title: {en, el}` to a single value,
  changing the response shape and breaking both the table's language
  switcher and the edit form, which needs every language at once.

  The dead param had a real cost. `viewLangCode` was a dependency of the
  fetch effect, so every tab switch triggered a full refetch of an
  identical response. Entries no longer depend on the language at all, so
  switching now costs nothing. The effect also used the language as a
  "languages have loaded" gate, which is gone too — entries and languages
  now load in parallel, and the `setLoading(false)` calls in the languages
  handler went with it, since `loading` belongs to the entries request.

  Entries can now render in the brief window before languages arrive, so
  `currentLangCode` is momentarily `null`. Checked: the existing fallback
  (`rawValue[code] || Object.values(rawValue)[0]`) resolves that to the
  first available translation rather than crashing or blanking.
- [x] **12. Sign-in reported every failure as bad credentials.** The
  `catch` wrapped both the `/sanctum/csrf-cookie` request and the login
  call, so a server that was down, a 500 or a CSRF mismatch all read
  "Invalid credentials" — a user would go on retyping a correct password.
  Now uses `errorSummary` from `lib/apiErrors.js`.

  This needed one addition to the helper. Its default 401 wording is
  "your session has ended", which is right inside the app but wrong on the
  sign-in form, where a 401 *is* bad credentials. `errorSummary` therefore
  takes per-status `overrides`, and Login passes
  `{ 401: 'Wrong email or password.' }`. Checked that the override does not
  leak into the other two callers.

  Confirmed against the live endpoint first: a wrong password returns
  `401 {"message":"Invalid credentials"}` and a stale token returns
  `419 {"message":"CSRF token mismatch."}` — two cases the old code showed
  identically. 25 node checks now cover the helper, including that a failed
  csrf-cookie request reads as a connection problem rather than a rejected
  password.
- [x] **13. Two axios instances.** `Login.jsx` imported a bare `axios`
  alongside the configured client, purely to reach
  `/sanctum/csrf-cookie`. There is one client now: `lib/api.js` exports
  `signIn()`, and the form calls that.

  Three pieces of knowledge moved with it, none of which belong to a form:
  the cookie endpoint sits **outside** `/api`, it therefore needs the
  `baseURL` overridden for that one call — the reason the second axios
  existed — and it must happen **before** the credentials are posted.
  Verified live what the ordering is worth: posting to `/api/login` without
  fetching the cookie first returns **419**.

  Errors still propagate to the caller, because Login has to distinguish
  them (#12) — a failure of the *cookie* request must not read as bad
  credentials.

  6 tests in `api.test.js`, with `axios.create` stubbed. Reversing the two
  calls turns 4 of them red, so the ordering is genuinely pinned rather
  than merely described in a comment.
- [x] **14. Dead `EntryController` stub.** `App\Http\Controllers\EntryController`
  was an empty resource-controller stub — five methods with `//` for a
  body — sitting next to the real `Api\EntryController`, which is the one
  every route uses. Deleted after confirming nothing referenced it.
- [x] **15. No-op migration.** `2026_07_14_191839_add_user_id_to_modules_table`
  opened a `Schema::table` closure and did nothing, in both `up` and
  `down` — a duplicate of `2026_07_11_072149`, which is the one that
  actually added the column. Deleted rather than kept as history, since it
  records no history to keep.

  Its row stays in the `migrations` table. Checked what that costs before
  deciding: `Migrator::rollback` skips a row whose file is missing and
  reports "Migration not found" instead of failing, and `migrate:status`
  simply omits it. Confirmed both after deleting.
- [x] **16.** Route organization — done with Done #2; the entry routes
  are now one `scopeBindings()` group.
- [x] **17. `/languages` was an inline closure.** Moved to
  [`Api\LanguageController::index`](../app/Http/Controllers/Api/LanguageController.php),
  so every endpoint is now reached the same way and the handler is a place
  a test can name.

  Checked for a functional reason first and did not find one: closures are
  often said to block `route:cache`, but `php artisan route:cache`
  succeeded with the closure in place. So this was the stylistic cleanup it
  was filed as, nothing more.

  Added an explicit `orderBy('id')` while moving the query. It changes
  nothing observable — that is the order the database already returned —
  but the panel selects the *first* language it receives as the one to
  display, and leaving that to an unordered query means the default depends
  on the database's mood.

  3 tests added (auth required, inactive languages excluded, order stable
  across repeated calls). Verified live that the response is byte-identical
  to the closure's.
- [x] **18. The dead `entry_translations` table.** It belonged to the
  translation model this CMS did not adopt (see Done #1), and reading the
  schema suggested it was the live one. Dropped the table via
  `2026_08_28_120000_drop_entry_translations_table` and deleted the
  `EntryTranslation` model, which nothing but its own file referenced.

  Checked the row count first — **0** — since dropping a populated table
  would have been unrecoverable. The `down()` recreates the original
  structure exactly, so the step is reversible.

  The *create* migration is deliberately kept. Deleting a migration that
  has already run elsewhere makes the schema history unreproducible, and
  a create-then-drop pair states plainly what happened. Only the file with
  nothing in it (#15) was worth removing outright.
- [x] **19. Unauthenticated `/api/*` answered 500 without a JSON header.**
  Laravel redirects a guest to a route named `login`, which an API-only app
  never defines, so opening an API URL in a browser or reaching for curl
  returned `Route [login] not defined` instead of 401.

  Worth reading the mechanism, because it explains why the existing
  `shouldRenderJsonWhen(api/*)` did not already cover it:
  `Authenticate::unauthenticated()` builds the redirect **as an argument**
  to the `AuthenticationException` constructor
  ([`Authenticate.php:104`](../vendor/laravel/framework/src/Illuminate/Auth/Middleware/Authenticate.php)),
  so `route('login')` threw before an `AuthenticationException` ever
  existed. The handler never saw an auth failure to render.

  Fixed with `redirectGuestsTo(fn () => null)`. Checked the handler first
  rather than assuming null was safe: it returns 401 JSON when
  `shouldReturnJson`, and `response()->noContent(401)` when there is no
  redirect — no `?? route('login')` fallback lurking in either branch.

  Verified live: `/api/user` unauthenticated now returns
  `401 {"message":"Unauthenticated."}` with no Accept header, with
  `text/html`, and with `application/json`. Logged-in requests and `/admin`
  are unchanged.
- [x] **22. No JS test runner.** Every frontend change had been verified by
  `npm run build`, which proves the code compiles and nothing else, plus
  throwaway node scripts that were deleted as soon as they had run.

  Vitest now runs with `npm test`, over **56 tests** in three files beside
  the code they cover: `apiErrors`, `pagination` and `richText`. The
  throwaway checks are all in there, so they no longer have to be
  rewritten each time something near them changes.

  `vitest.config.js` is deliberately separate from `vite.config.js`, which
  Vitest would otherwise reuse — that one loads the Laravel, React and
  Tailwind plugins, and the Laravel plugin expects a serving application.
  The environment is `node`, since these are pure functions.

  Checked the suite can actually fail: deleting a single `.trim()` in
  `docToText` turned 9 tests red, and they passed again once it was put
  back. A suite that has never failed proves nothing.

  **Still uncovered:** the components themselves. Rendering `EntryForm` or
  `ModuleBuilder` needs jsdom and a heavier setup, so the module form and
  the editor round-trip are still verified by running the app. That is a
  smaller gap than before but not nothing.
- [x] **25. A missing `type` key still fell back to `string`.** `#5`
  removed the silent fallback for an *unrecognised* type but left
  `$field['type'] ?? 'string'` in place, so a field with **no** type
  resolved to one and never reached the throw. The API cannot produce that
  shape — `schema.*.type` is required — but the seeder writes schemas with
  `DB::table`, and a schema can be edited straight in the database, which
  is the one path the API does not guard.

  Dropped the default. Checked first that no existing module has a typeless
  field, since this turns silence into a 422.

  A missing type and a misspelled one now read differently, because they
  are different mistakes: *"declares no type"* rather than
  *"unsupported type 'null'"*. Verified live —

  > Module schema field 'mystery' declares no type. Supported types:
  > string, text, integer, boolean, date, datetime, select, image.

  2 tests, both confirmed returning 201 beforehand.
- [x] **26. Custom validation rules could contradict type rules.** The
  `validation` string was merged into the type's rules unchecked, and it
  went wrong in two different ways:

  - **Impossible.** A `text` field validates as an `array`, so adding
    `string` produced `['array','string']` — a pair no value can satisfy.
    Every entry would be rejected, with nothing saying why.
  - **Quietly different.** `max:255` on that same field is applied to an
    array as a *count*, so it limited the document to 255 **nodes** while
    reading as a character limit.

  `assertCustomRulesFit()` now rejects a rule that asserts a data type (the
  field's `type` already decides that) and a size rule on a rich-text field
  (it would measure the wrong thing). `required` and `nullable` are
  untouched, and `max:60` on a `string` — what the box is for — still
  works.

  Checked at **module creation**, not at the first entry save, by having
  `ModuleController` build the rules and discard them: a schema that cannot
  produce rules is not a usable schema. Reusing the builder keeps one
  definition of "usable" instead of a second copy that could drift, which
  is what #9 was about.

  7 tests, four confirmed returning 201 first. Verified live —

  > Field 'body' has validation rule 'max', which would count the nodes of
  > a rich-text document rather than its characters.
- [x] **27. Generated slugs reveal other users' slugs.** *(Accepted, not
  fixed.)* `generateSlug()` checks uniqueness globally, so a user naming a
  module `Products` while another account holds `products` receives
  `products-2` and can infer the other exists. Modules are otherwise
  strictly per-owner via `ModulePolicy`, making this the one observable
  cross-tenant detail.

  **Decision: accept for now.** There is one user, so there is nobody to
  leak to. Recorded in [`ARCHITECTURE.md`](ARCHITECTURE.md) as a known
  limit rather than left in a task list, because whoever adds the second
  user needs to see it: the fix is a composite unique on
  `(user_id, slug)` plus owner-scoped route binding, and it is cheaper
  before real accounts exist than after.
  `ModuleController::generateSlug()` checks uniqueness globally, so a user
  naming a module `Products` while another account holds `products` gets
  `products-2` and can infer the other exists. Modules are otherwise
  strictly per-owner via `ModulePolicy`, making this the one observable
  cross-tenant detail. Follows from the global unique index, so fixing it
  means deciding whether slugs should be unique per user instead.
- [x] **28. Slug generation ran one query per collision.** `products`
  taken, try `products-2`, taken, try `products-3` — the seventh module of
  a name cost seven selects, measured at exactly that before the change.
  Now one: read the slugs sharing the base as a prefix, pick a free one in
  memory.

  That needed a change of shape, not just of query. The base used to be
  truncated *per candidate* to make room for the suffix, so a long name's
  candidates did not all share a prefix and no single `LIKE` could have
  found them. Truncating **once**, with room kept up front, makes every
  candidate start with the same string. A 255-character name now yields a
  247-character slug rather than 255 — no practical loss, and it is what
  makes one query correct rather than merely fewer queries.

  `Str::slug` emits only `[a-z0-9-]`, so the base can never carry a `LIKE`
  wildcard. An unrelated slug caught by the prefix (`products-extra`) is
  harmless: it never equals a `products-N` candidate.

  Verified live: five modules named the same gave `zz-products` through
  `zz-products-5`, and a 255-character name twice gave slugs of 247 and 249
  characters. The query-count test failed at 7 first.
- [x] **29 + 30. Type lists were restated in JS and policed by regex.** Done
  together, because the second removes the first: with one source of truth
  the duplicated parser has nothing left to parse.

  The frontend no longer restates anything. `php artisan
  schema:sync-field-types` writes
  [`fieldTypes.json`](../resources/js/lib/fieldTypes.json) from the PHP
  constants, and `richText.js` and `ModuleBuilder.jsx` import it. Labels
  stay in JS, since they are wording; a type with no label gets its own
  name capitalised, so adding one on the backend now surfaces in the form
  without a second edit — verified by adding a `colour` type and watching
  it come through as `{value: 'colour', label: 'Colour'}`.

  The check is now a file comparison instead of a regex over JS source.
  Both approaches rely on a test failing when things drift; the difference
  is only whether that test can be broken by reformatting a literal. It
  fails with something actionable: *"fieldTypes.json is stale. Run: php
  artisan schema:sync-field-types"* — confirmed by changing the PHP
  constant without regenerating.

  Caught while doing it: the idempotency test called the command through
  `artisan`, so it **wrote the real tracked file** — and during the drift
  check it persisted the mutation another test was meant to report. It now
  asserts that `encode()` is deterministic instead, with no filesystem
  side effect.
- [x] **34. Two high-severity npm advisories.** `postcss <=8.5.22` (path
  traversal via `sourceMappingURL`, two advisories) and `nanoid <=3.3.17`
  (non-terminating loops). Pre-existing rather than introduced by the
  vitest install — `postcss` is a direct devDependency in `HEAD` and
  `nanoid` reaches the tree through it, with vitest in neither chain.

  Cleared with `npm audit fix`: postcss 8.5.16 → **8.5.26**, nanoid
  3.3.15 → **3.3.18**, both within the existing semver ranges.
  `npm audit` now reports none.

  The dry run was misleading — it printed "2 high severity vulnerabilities"
  *after* saying it had changed two packages, which reads as a failure but
  is the pre-fix state. Checked the published versions instead of trusting
  it, and 8.5.26 and 3.3.18 both sit above the vulnerable ranges.

  postcss is the CSS pipeline, so the build output was checked rather than
  the build merely being run: the `prose` rules survive with `h1` still at
  `2.25em`, along with the `.tiptap-editor` spacing overrides, the `mark`
  highlight and Tailwind's preflight. CSS grew 79.98 → 80.55 kB because
  the newer postcss emits more webkit prefixes.

  65 PHP and 56 JS tests pass, and a live pass returned 200 for modules,
  entries, languages and `/admin`.

- [x] **33. `languages.is_default` is ignored.** The column was set — `en`
  is flagged — but nothing read it, so the panel opened on whichever
  language came first by id, which is Greek.

  **Decision: honour the flag as it stands.** The panel and the entry form
  now both open on `en`. Done in the frontend rather than by ordering the
  endpoint, so ordering and defaulting stay separate concerns — a list
  sorted by name later should not silently change the default.

  Added [`lib/languages.js`](../resources/js/lib/languages.js), which also
  absorbed `getLangCode` — it was declared identically in `EntriesTable`
  and `EntryForm`. 10 tests, including that the flag wins over position and
  that an unflagged list still falls back to the first entry.

  To open on Greek instead, move the flag rather than changing code:
  `UPDATE languages SET is_default = (code = 'gr')`.

- [x] **32. The schema's `required` key is dead data.** It was written into
  schemas and never read; the only mechanism that worked was typing the
  word `required` into the free-text validation box — which **no field in
  the database had ever done**. The intuitive mechanism was dead and the
  working one was unused.

  **Decision: make the flag real.** `SchemaRuleBuilder` reads it,
  `ModuleController` validates it as an optional boolean, and the module
  form has a **Req** checkbox beside **Lang**. The validation box keeps its
  job for everything else (`max:60`, `email`…), and writing `required`
  there still works, so older schemas are unaffected. Setting both does not
  produce the rule twice.

  **Behaviour change:** the seeded `projects.title` carries
  `required => true` and is now genuinely required — verified live, posting
  to `projects` without a title returns 422 where it returned 201.

  8 tests, four of which reproduced the old behaviour first.

- [ ] **32b. Reject unknown keys in a module schema.** `ModuleController`
  validates the keys it knows and ignores the rest, so a typo like
  `requred: true` is accepted, stored, and silently does nothing — the same
  class of quiet failure #5 removed from field *types*. Needs a decision on
  strictness, since rejecting unknown keys would break any client sending
  extra metadata.
  [`DatabaseSeeder`](../database/seeders/DatabaseSeeder.php) writes
  `'required' => true` into module schemas, but nothing reads it:
  `SchemaRuleBuilder` derives requiredness from the `validation` string,
  and `ModuleController` does not even validate a `schema.*.required` key,
  so the API accepts and stores whatever is sent. Leftover from an earlier
  design, and misleading — the seeded `title` field looks required and is
  not. Either drop it or make it the real mechanism instead of `validation`
  containing the word `required`.

- [x] **31. The typography plugin ships to pages with no prose.**
  *(Measured, then accepted.)* Built the stylesheet with and without the
  plugin: **78.7 kB vs 66.4 kB raw**, so it costs **12.3 kB raw — about
  1.5 kB gzipped** of a 15.11 kB total. `welcome.blade.php` does load it
  and does not use `prose`.

  Both fixes cost more than the problem:

  - **Splitting the stylesheet per page** would give each its own bundle,
    but both need Tailwind's base, so someone visiting both pages
    downloads roughly 144 kB instead of 78 kB. It optimises the stock
    Laravel placeholder at the expense of the actual product.
  - **Replacing `prose` with hand-written editor rules** would save ~11 kB
    raw for everyone, but trades a maintained plugin for bespoke CSS
    covering headings, list markers, blockquote and code, with real visual
    risk, to save ~9% of one asset.

  Left as it is. Worth revisiting only if `/` stops being a placeholder,
  since the cleanest resolution is that the page which does not need
  `prose` also does not need to exist.

- [ ] **35. `welcome.blade.php` loads an empty JS bundle.** It pulls in
  `resources/js/app.js`, which is three bytes — a single `//`. The file is
  also a Vite entry point in `vite.config.js`, producing a 0.00 kB chunk in
  every build. Removing all three is dead-code cleanup in the family of
  #14/#15/#18; noticed while measuring #31 and left alone to keep that
  measurement's conclusion separate from an unrelated change.

---

## Backlog (deliberately out of scope for MVP for now)

- Tests: `tests/Feature|Unit/ExampleTest.php` are still the Laravel
  defaults — no real coverage. Write authorization/validation tests
  **after** P0 (otherwise we'd be testing behavior that's about to
  change).
- Select field options as `{value, label}` objects instead of flat
  strings — the current format works for MVP but is limited.
- Global state management / frontend routing — not needed at the
  app's current size.
