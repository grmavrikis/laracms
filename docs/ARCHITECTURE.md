# Architecture

Describes the **current** state of the system as it exists in the code.
This is not a wishlist — if something here no longer matches reality, fix
the doc, don't build on the assumption that it still holds.

For what's left to fix/build: [`TASKS.md`](TASKS.md).

## 1. High-level

```
React (Vite/Axios/Sanctum SPA)
        │  /api/*  (JSON)
        ▼
Laravel routes → Controllers → Form Requests → Models → DB (MySQL)
```

Backend: `app/Http/Controllers/Api/*`, `app/Http/Requests/*`, `app/Models/*`,
`app/Services/SchemaRuleBuilder.php`.

Frontend: `resources/js/components/*`, `resources/js/lib/api.js`.

## 2. Domain model

```
User (1:N) Module (1:N) Entry
                 Language  (flat list — no DB relation to Entry, see below)
```

- **Module** — `id, user_id, name, slug, schema(json)`. `slug` is the route
  key. `schema` defines which fields its Entries can have.

  Slugs come from one of two paths, and they behave differently on
  purpose. A slug the **client sends** is validated like any other input,
  so a duplicate is a 422 — it asked for that exact value. A slug the
  **server derives** from the name (when the client sends none) is a
  request to pick one, so `ModuleController::generateSlug()` appends a
  suffix until it is free (`products-2`) and falls back to `module` when
  `Str::slug()` yields nothing, which it does for a punctuation-only name.
  An empty slug would make the module unreachable.

  **The backend is the only place that builds a slug.** `ModuleBuilder.jsx`
  deliberately has no `slugify`: it used to transliterate the name locally
  with a Greek-only map and send that, which disagreed with `Str::slug`
  (`Ψυχαγωγία` → `psychagogia` vs `psikhaghoghia`, and `Café Münchén` →
  `caf-m-nch-n`). Since the frontend sent its value, the wrong one was the
  one stored. The form now leaves the slug blank unless the user types one.
- **Entry** — `id, module_id, data(json)`. Belongs to one Module. Has no
  `user_id` of its own — ownership is derived indirectly through
  `Entry → Module → User`.
- **Language** — `id, name, code, is_default, is_active`.

**Translation model (decided, see TASKS.md #1):** translatable content
lives *inside* `Entry.data.{field}.{lang}` — there is no per-entry
translation record. `SchemaRuleBuilder`, `EntryController`, and
`EntryForm.jsx`/`EntriesTable.jsx` already agree on this shape end to end.

The `entry_translations` table and the `EntryTranslation` model exist in
the codebase but are **dead** — nothing reads or writes them. They're the
leftover of the model that was *not* chosen (a real per-language DB row per
translation, joined to `Entry`). Removing them is tracked as cleanup in
TASKS.md, not a blocker.

## 3. Auth

Sanctum, session-based (SPA, not API tokens). Flow:

```
GET /sanctum/csrf-cookie → cookie
POST /api/login          → session
```

`routes/api.php`: `/login` is public, everything else sits behind
`auth:sanctum`. Sanctum only answers "who are you" — it does **not** do
authorization. That is handled separately by
[`ModulePolicy`](../app/Policies/ModulePolicy.php).

Because a Module is owned by one User and an Entry is owned only
indirectly (`Entry → Module → User`), every authorization question reduces
to *does this user own this Module?*. The policy is consulted from the
controller (read/delete) and from `authorize()` on both Entry FormRequests
(write) — the latter runs before validation, so a Module's schema is never
exposed to someone who can't write to it.

## 4. Module schema → validation

```
Module.schema  →  SchemaRuleBuilder::build()  →  Laravel validation rules
                                                        │
                                                        ▼
                                              Store/UpdateEntryRequest
```

`SchemaRuleBuilder` (`app/Services/SchemaRuleBuilder.php`) converts each
schema field into Laravel validation rules based on its `type` and its
`translatable` flag.

`SchemaRuleBuilder::SUPPORTED_TYPES` is the **single list** of field types
the system understands: `string`, `text`, `integer`, `boolean`, `date`,
`datetime`, `select`, `image`. `ModuleController` validates incoming
schemas against that same constant, so a Module cannot declare a type the
rule builder is unable to handle. An unrecognised type throws rather than
falling back to `string` — the old fallback hid the fact that `datetime`
had no arm at all and was being validated as a plain string.

`text` is the one rich-text type. `richtext` and `textarea` used to be
accepted as aliases that behaved identically, and were dropped rather than
surfaced in the form.

The list is mirrored in JS — `FIELD_TYPES` in `ModuleBuilder.jsx` (with
labels) and in `lib/richText.js` (which types are documents).
`FieldTypeConsistencyTest` reads both files and fails if they drift from
the PHP constants, since there is no JS test runner to assert it natively.

## 5. Entry request flow

```
POST/PUT /api/modules/{module}/entries[/{entry}]
    → route model binding (scoped): {module} by slug,
      {entry} through $module->entries()
    → EntryController (Api\)
        → ModulePolicy (ownership)
        → Store/UpdateEntryRequest (validation via SchemaRuleBuilder)
        → Entry model (create/update)
        → JSON response
```

The entry routes are wrapped in `Route::scopeBindings()`, so `{entry}` is
resolved *through* the parent Module's relationship. An Entry that belongs
to a different Module is a 404 before any controller code runs; a Module
owned by a different user is a 403 from the policy. Modules are addressed
by slug only — numeric ids are not accepted.

## 6. File uploads

`POST /api/upload` (`UploadController::store`) → validates
`image|mimes:jpeg,png,jpg,webp,svg|max:2048` → stores to
`storage/app/public/uploads` → returns a public URL. Called independently
from the Entry create/update request (2 separate requests).

## 7. Rich text

Rich-text fields store the **editor's document as JSON**, not an HTML
string. Tiptap (`resources/js/components/RichTextEditor.jsx`) emits
`editor.getJSON()`, and the admin table renders a plain-text excerpt via
`docToText()`. The app contains no `dangerouslySetInnerHTML` at all.

This is deliberate. HTML is an open language: it can express `<script>`
and event handlers, so accepting it means accepting everything and then
trying to remove the dangerous parts. A document tree is a **closed
vocabulary** — there is no `script` node type — so anything unknown has
nowhere to live.

[`RichTextDocument`](../app/Services/RichTextDocument.php) rebuilds every
incoming document on write (from `store()`/`update()` in
`Api\EntryController`), keeping only known node types, known marks and
attributes with validated values. Two things still need real checking,
because a closed vocabulary does not protect attribute *values*:

- **link `href`** — parsed, then compared against `http`/`https`/`mailto`.
  A rejected target drops the link mark and keeps the text.
- **`target`/`rel`** — set by the server, never taken from the payload.

Node depth and count are capped to bound oversized payloads. Only schema
types `text`/`richtext`/`textarea` are treated as documents; other types
are plain data that React escapes on render.

Text content is stored verbatim — `<script>` typed *as text* stays as
text, because it is rendered as text and escaped, never as markup.

**Do not let `TrimStrings` near entry payloads.** A mark splits a sentence
into several text nodes, and the spaces between words sit at the edges of
those nodes (`"Κάτι "`, `"έντονο"`, `" εδώ"`). Trimming each string on its
own glues the words together on save. `bootstrap/app.php` therefore
excludes `data.*` from trimming, and
`test_spacing_around_marked_text_survives_the_request` pins the behaviour.
The side effect is that plain string fields are no longer auto-trimmed
either — which is the right default for a CMS: content is stored as the
author typed it.

Legacy HTML values were converted once by
`php artisan entries:migrate-richtext` (idempotent; `--dry-run` shows
the diff first).

## 8. Frontend

`app.jsx` (root, no router — local state `view = {type, data}`) →
`Login` / `ModulesList` / `ModuleBuilder` / `EntriesManager`
(→ `EntriesTable`, `EntryForm` → `RichTextEditor`). `lib/api.js` = axios
instance with `baseURL: /api, withCredentials: true`. Frontend
restrictions (e.g. hidden buttons) are **not** a security control —
UX only. The backend is the only real security boundary.

## 9. Source of truth

If anything here disagrees with the code, the code wins — update the doc.
