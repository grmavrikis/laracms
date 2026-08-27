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

- [x] **4. Rich-text HTML sanitization.** Rich-text values are now cleaned
  server-side, on write, by
  [`RichTextSanitizer`](../app/Services/RichTextSanitizer.php)
  (HTMLPurifier), called from `store()` and `update()` in
  `Api\EntryController`. Sanitizing on write rather than on render means
  the stored data is clean for *every* future consumer, not just the one
  `dangerouslySetInnerHTML` call in the admin table.

  The allowlist mirrors exactly what the editor can emit (StarterKit +
  Highlight + TextAlign), so real content is untouched:
  `style` is permitted only on `p`/`h1..h6`, and `CSS.AllowedProperties`
  narrows it to `text-align` alone. Only fields whose schema type is
  `text`/`richtext`/`textarea` are purified — other types are plain data
  that React escapes on render, and purifying them would corrupt
  legitimate text like `a < b`. Translatable fields are walked
  per-language.

  Covered by 12 tests in
  [`tests/Feature/RichTextSanitizationTest.php`](../tests/Feature/RichTextSanitizationTest.php)
  (script tags, event handlers, `javascript:` hrefs, iframes, svg onload,
  CSS-based payloads, plus the create/update HTTP paths). Also verified
  live: posting
  `<p>safe</p><script>alert(1)</script><img src=x onerror=alert(2)>`
  stored `<p>safe</p>`. Scanned existing rows first — 0 of 3 entries
  contained dangerous markup, so no backfill was needed.

  Note: sanitizing happens on write, so anything stored *before* this
  change is not retroactively cleaned. That's fine today (nothing dirty
  was found), but a backfill command would be needed if that ever changes.

---

## P0 — Security / correctness blockers

- [ ] **5. Unknown field type silently becomes `string`.**
  [`SchemaRuleBuilder.php:70`](../app/Services/SchemaRuleBuilder.php:70)
  `default => ['string']`. A typo in the module schema slips through
  silently instead of failing loudly. → throw/422 on an unknown type.

---

## P1 — Consistency before the schema system solidifies

- [x] **6. `moduleSlugOrId` contradicts the route contract.** Done with
  Done #2 — module lookup is now slug-only via route model binding.

- [x] **7. Duplicate Module/Entry lookups.** Done with Done #2 — the
  FormRequests read the already-bound Module instead of re-querying.

- [ ] **8. Slug generation in two places.** The frontend
  ([`ModuleBuilder.jsx:16-30`](../resources/js/components/ModuleBuilder.jsx:16))
  has its own `greekToLatin`/`slugify`; the backend does
  `Str::slug($validated['name'])`
  ([`ModuleController.php:27`](../app/Http/Controllers/Api/ModuleController.php:27)).
  Different rules = different slug for the same input. → the backend is
  the authority, the frontend only suggests.

- [ ] **20. Known vulnerabilities in dependencies.** `composer audit`
  reports 12 advisories across `guzzlehttp/guzzle` (one rated high:
  CVE-2026-69246, host-based check bypass) and `league/commonmark`. Both
  are transitive dependencies of `laravel/framework`, pre-existing and
  unrelated to app code. A partial update is blocked by the lock file —
  needs `composer update guzzlehttp/guzzle league/commonmark -W`, which
  also moves `guzzlehttp/psr7` and `guzzlehttp/promises`. Deserves its
  own commit plus a full test run, not a drive-by fix.

- [ ] **9. Field types inconsistent frontend/backend.** Frontend
  `FIELD_TYPES` in `ModuleBuilder.jsx:5-14` has no `textarea`, while the
  backend validation accepts it
  ([`ModuleController.php:20`](../app/Http/Controllers/Api/ModuleController.php:20)).
  One field-type list, shared by both sides.

---

## P2 — Polish

- [ ] **10. Pagination is wrong in the UI.** The backend does
  `paginate(15)`, but `EntriesTable.jsx:12` shows `entries.length` as
  "total" (only the current page) and there are no page controls —
  after the first 15 entries the user can't see the rest.
- [ ] **11.** `EntriesManager.jsx:41` sends a `lang` param to
  `GET .../entries`, but the backend `index()` ignores it entirely —
  every language is always fetched.
- [ ] **12.** [`Login.jsx:22`](../resources/js/components/Login.jsx:22)
  shows "Invalid credentials" for EVERY error (network, 500, CSRF) —
  a misleading message.
- [ ] **13.** Two axios instances (raw `axios` for the csrf-cookie vs
  the `api` client) — could become one centralized auth/api client.
- [ ] **14.** [`app/Http/Controllers/EntryController.php`](../app/Http/Controllers/EntryController.php)
  is dead code (an empty resource-controller stub, not wired to any
  route) — delete it.
- [ ] **15.** Migration
  [`2026_07_14_191839_add_user_id_to_modules_table.php`](../database/migrations/2026_07_14_191839_add_user_id_to_modules_table.php)
  does nothing (empty up/down, a no-op). Decision needed: keep as
  history or squash — not a functional problem, just cleanup.
- [x] **16.** Route organization — done with Done #2; the entry routes
  are now one `scopeBindings()` group.
- [ ] **17.** `/languages` is an inline closure route instead of a
  controller method — minor stylistic inconsistency with the rest of
  the API.
- [ ] **18.** Remove the dead `entry_translations` table,
  [`EntryTranslation.php`](../app/Models/EntryTranslation.php) model, and
  its migration — confirmed unused (see Done #1). Harmless to leave for
  now, but it misleads anyone reading the schema into thinking it's the
  active translation model.
- [ ] **19.** Hitting any `/api/*` route unauthenticated *without* an
  `Accept: application/json` header (e.g. pasting the URL in a browser)
  returns **500 `Route [login] not defined`** instead of 401 — Laravel
  tries to redirect guests to a named `login` route that doesn't exist in
  this API-only app. The React client always sends the JSON header so it
  correctly gets 401; this only bites manual/curl testing. Fix with
  `->redirectGuestsTo(fn () => null)` in `bootstrap/app.php`.

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
