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
Laravel routes → Controllers → Form Requests → Models → DB (SQLite)
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
authorization. `app/Http/Requests/{Store,Update}EntryRequest.php::authorize()`
always return `true` — there's no authorization layer anywhere else either.
See TASKS.md #2 — this is the most critical open issue.

## 4. Module schema → validation

```
Module.schema  →  SchemaRuleBuilder::build()  →  Laravel validation rules
                                                        │
                                                        ▼
                                              Store/UpdateEntryRequest
```

`SchemaRuleBuilder` (`app/Services/SchemaRuleBuilder.php`) converts each
schema field into Laravel validation rules based on its `type`
(`string|text|textarea|integer|boolean|date|datetime|select|image`) and
its `translatable` flag. An unknown type silently falls back to `string`
(see TASKS.md #5).

Frontend field types (`ModuleBuilder.jsx`) and backend field types
(`ModuleController::store` validation + `SchemaRuleBuilder`) are **not
identical** — e.g. `textarea` only exists backend-side.

## 5. Entry request flow

```
POST/PUT /api/modules/{moduleSlug}/entries[/{id}]
    → EntryController (Api\)
        → Store/UpdateEntryRequest (validation via SchemaRuleBuilder)
        → Entry model (create/update)
        → JSON response
```

`show/update/destroy` take `$moduleSlug` as a route param but **never use
it** — they go straight to `Entry::findOrFail($id)` with no scoping to the
Module or the authenticated user. See TASKS.md #2.

## 6. File uploads

`POST /api/upload` (`UploadController::store`) → validates
`image|mimes:jpeg,png,jpg,webp,svg|max:2048` → stores to
`storage/app/public/uploads` → returns a public URL. Called independently
from the Entry create/update request (2 separate requests).

## 7. Rich text

Tiptap (`resources/js/components/RichTextEditor.jsx`) produces HTML that
is stored as-is in `Entry.data`/`EntryTranslation.data` and rendered back
via `dangerouslySetInnerHTML` in `EntriesTable.jsx`. There is currently no
sanitization on either the input or the output side.

## 8. Frontend

`app.jsx` (root, no router — local state `view = {type, data}`) →
`Login` / `ModulesList` / `ModuleBuilder` / `EntriesManager`
(→ `EntriesTable`, `EntryForm` → `RichTextEditor`). `lib/api.js` = axios
instance with `baseURL: /api, withCredentials: true`. Frontend
restrictions (e.g. hidden buttons) are **not** a security control —
UX only. The backend is the only real security boundary.

## 9. Source of truth

If anything here disagrees with the code, the code wins — update the doc.
