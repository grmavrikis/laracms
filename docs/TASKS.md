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

---

## P0 — Security / correctness blockers

- [ ] **2. Entry/Module authorization — currently nonexistent.**
  [`app/Http/Controllers/Api/EntryController.php`](../app/Http/Controllers/Api/EntryController.php):
  - `show()` (L37-40), `update()` (L42-48), `destroy()` (L50-56): do
    `Entry::findOrFail($id)`, **ignoring** the `$moduleSlug` from the
    route. An authenticated user can read/change/delete another user's
    Entry if they guess the ID.
  - `index()` (L14-21), `store()` (L23-35): `Module::where('slug', ...)
    ->orWhere('id', ...)->firstOrFail()` doesn't filter by `user_id` —
    nothing checks that the Module belongs to the authenticated user.
  - [`StoreEntryRequest.php:12`](../app/Http/Requests/StoreEntryRequest.php:12)
    and [`UpdateEntryRequest.php:12`](../app/Http/Requests/UpdateEntryRequest.php:12):
    `authorize()` always returns `true`.
  → Needs a real authorization layer: Policy (`ModulePolicy`,
  `EntryPolicy`) + every query going through
  `Module::where('user_id', auth()->id())` and
  `$module->entries()->findOrFail($id)` (not a global
  `Entry::findOrFail`). Ideally via scoped route model binding so the
  framework guarantees it, instead of manual lookups in 4 different
  places.

- [ ] **3. Debug log with the entire request payload.**
  [`Api/EntryController.php:25`](../app/Http/Controllers/Api/EntryController.php:25):
  `\Log::info('DEBUG_PAYLOAD', $request->all())`. Remove it — it may
  write sensitive data to the logs.

- [ ] **4. Rich-text HTML has no sanitization anywhere.**
  Tiptap output is stored raw and rendered raw via
  `dangerouslySetInnerHTML` in
  [`EntriesTable.jsx:102`](../resources/js/components/EntriesTable.jsx:102).
  Stored XSS if someone passes HTML/JS directly through the API
  (without ever going through the Tiptap UI). → sanitize server-side
  before persisting (e.g. HTMLPurifier), or at least before rendering.

- [ ] **5. Unknown field type silently becomes `string`.**
  [`SchemaRuleBuilder.php:70`](../app/Services/SchemaRuleBuilder.php:70)
  `default => ['string']`. A typo in the module schema slips through
  silently instead of failing loudly. → throw/422 on an unknown type.

---

## P1 — Consistency before the schema system solidifies

- [ ] **6. `moduleSlugOrId` contradicts the route contract.**
  The route is `{moduleSlug}` and `Module` already has
  `getRouteKeyName() = 'slug'`
  ([`Module.php:17`](../app/Models/Module.php:17)), but the code
  everywhere also accepts a raw ID (`->orWhere('id', $moduleSlugOrId)`).
  Pick one (suggestion: slug-only, via route model binding) and drop
  the other.

- [ ] **7. Duplicate Module/Entry lookups.** The Controller and the
  FormRequest each run their own query for the same Module/Entry
  (e.g. `StoreEntryRequest::rules()` re-fetches the Module that
  `EntryController::store()` already found). This gets solved
  naturally alongside #2 and #6 if you move to route model binding.

- [ ] **8. Slug generation in two places.** The frontend
  ([`ModuleBuilder.jsx:16-30`](../resources/js/components/ModuleBuilder.jsx:16))
  has its own `greekToLatin`/`slugify`; the backend does
  `Str::slug($validated['name'])`
  ([`ModuleController.php:27`](../app/Http/Controllers/Api/ModuleController.php:27)).
  Different rules = different slug for the same input. → the backend is
  the authority, the frontend only suggests.

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
- [ ] **16.** Route organization: `DELETE .../entries/{id}` is placed
  among the Modules routes in `routes/api.php` instead of with the rest
  of the Entries routes — simple reordering.
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
