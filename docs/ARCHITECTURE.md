# Architecture

Describes the **current** state of the system as it exists in the code.
This is not a wishlist — if something here no longer matches reality, fix
the doc, don't build on the assumption that it still holds.

Some paragraphs carry a note citing a `TASKS.md` number. Those mark the places
where the behaviour described is **known to be wrong, misleading, or already
decided to change** — they are corrections, not plans, and they exist so nobody
builds on a paragraph that is about to stop being true. Everything without such
a note describes the code as it stands.

What is left to do: [`TASKS.md`](TASKS.md). Why things ended up this way:
[`CHANGELOG.md`](CHANGELOG.md).

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

  **Slugs are unique across the whole installation, not per owner — and that
  is correct.** This used to be recorded here as a known limit, with advice to
  make them unique per `(user_id, slug)` before a second account was added.
  **Do not follow that advice.** The product was since decided to be
  single-tenant: one installation per client site, several users, one shared
  content space (`TASKS.md` → Decisions, 2026-08-30). A second account shares
  the modules rather than partitioning them, so per-owner slugs would permit
  two `products` modules on the same site — which is the bug, not the fix.

  Deriving a slug is **one query**: the slugs sharing the base as a prefix
  are read once and a free candidate chosen in memory. The base is
  shortened up front rather than per candidate, so they all share that
  prefix — which is what makes the single read correct.

  Two constraints apply to both paths. The value must match
  `^[a-z0-9]+(?:-[a-z0-9]+)*$` — the shape `Str::slug()` produces — because
  the slug is a single URL segment and something like `a/b` could never be
  routed to. And it must fit `modules.slug`, which is `varchar(255)`: since
  `name` also allows 255 characters, `generateSlug()` shortens the base up
  front to leave room for the suffix rather than overflowing the column.

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

**Translation model** (decided; see CHANGELOG.md §3): translatable content
lives *inside* `Entry.data.{field}.{lang}` — there is no per-entry
translation record. `SchemaRuleBuilder`, `EntryController`, and
`EntryForm.jsx`/`EntriesTable.jsx` already agree on this shape end to end.

There was once an `entry_translations` table and an `EntryTranslation`
model — the other model, a per-language row joined to `Entry`. Nothing ever
read or wrote them, and the table was empty, so both were removed
(CHANGELOG.md §10). The create migration is still there, followed by
`2026_08_28_120000_drop_entry_translations_table`; the pair is the record
of a path not taken.

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

The CSRF cookie must be fetched **before** the credentials are posted —
skipping it answers 419. That sequence lives in `signIn()` in
`lib/api.js`, along with the fact that the cookie endpoint sits outside
`/api` and needs its `baseURL` overridden, so there is one axios client
rather than a second bare one in the login form.

There is **no route named `login`**: signing in is an API call, and
`/admin` is a public shell that decides what to show client-side. Laravel
would otherwise redirect guests to that route name and fail, so
`bootstrap/app.php` sets `redirectGuestsTo(fn () => null)`; an
unauthenticated `/api/*` request answers 401 whatever it asks to `Accept`.

`/api/login` also carries its own rate limit — five attempts a minute keyed by
email **and** address, on top of the 120/minute the `api` group applies to
everything. Both limiters are defined in `AppServiceProvider`; `bootstrap/app.php`
has to call `throttleApi()` or the group carries no limiter at all
(CHANGELOG §13).

**Both limits key on the client address, so deploying behind a reverse proxy
needs `TRUSTED_PROXIES` set** — otherwise `$request->ip()` is the proxy's
address and every visitor shares one bucket. It is empty by default, and that
is the safe direction: trusting a proxy that is not there lets anyone supply
their own `X-Forwarded-For` and escape the limit altogether. `.env.example`
carries the guidance.

**Ownership is not the authorization axis.** It was until #54: every question
reduced to *does this user own this Module?*. One installation serves one site,
its Modules are created only by the master admin, and its users are colleagues
sharing one content space — so `Module.user_id` records who wrote the row and
distinguishes nobody. Used to authorize, it showed the client's own staff an
empty panel.

`ModulePolicy` now answers **"is this user signed in?"**, which for these
routes means it returns true. It is kept rather than deleted because it is the
one place every authorization question passes through: group permissions —
which group may work in which Module — land there and nowhere else. The policy
is consulted from the controller (read/delete) and from `authorize()` on both
Entry FormRequests (write); the latter runs before validation, so a Module's
schema is never exposed to a request that will be refused.

Two boundaries remain, and neither is in the policy:

- **Authentication**, applied by the route group.
- **The scoped route binding**, which stops an Entry being addressed through
  the wrong Module. With ownership gone this is the only structural limit on
  which Entry a request can name, so it matters more than it did.

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

A **translatable** field yields two levels of rules, because its value is a
map of language code to value: `data.{name}` governs the map and
`data.{name}.*` governs each value. Both follow the field's own
configuration, so a field is required only when it says so — the outer
level was once hardcoded to `required`, which made every translatable field
mandatory.

Requiredness comes from the field's **`required` flag** (the *Req* checkbox
in the module form). Writing `required` into the free-text `validation`
string also still works, for schemas that did it that way; setting both
does not apply the rule twice. Everything else — `max:60`, `email` — stays
in the validation string.

A schema field may carry only `name`, `type`, `translatable`, `required`,
`validation` and `options`. Anything else is **rejected by name** rather
than ignored, so a typo like `requred` cannot be stored while quietly doing
nothing. Adding a key means adding it to that list first. The check is on
the API; a schema written straight to the database still bypasses it.

That string is **checked against the type** rather than merged blindly. A
rule asserting a data type (`string`, `integer`, `array`…) is rejected,
since the field's `type` already decides that and the two can contradict:
`text` resolves to `array`, and `array` plus `string` is unsatisfiable. So
are size rules on rich text, which Laravel would apply to the document as a
node count rather than a character limit. The check runs when the **module
is created** — `ModuleController` builds the entry rules and discards them,
so a schema that cannot produce rules is refused there rather than at the
first attempt to save an entry.

Languages: `is_default` decides which language the panel opens on, read by
`lib/languages.js`. It is honoured in the frontend rather than by ordering
`/api/languages`, so how the list is sorted and which entry is the default
stay independent.

The **seeder** sets that flag, and is the only thing that does. No endpoint can
change which language is the default, and nothing enforces that exactly one
carries it — two flagged rows and `defaultLanguage()` silently takes whichever
comes first (`TASKS.md` #49, waiting on #52).

`SchemaRuleBuilder::SUPPORTED_TYPES` is the **single list** of field types
the system understands: `string`, `text`, `integer`, `boolean`, `date`,
`datetime`, `select`, `image`, `gallery`. `ModuleController` validates incoming
schemas against that same constant, so a Module cannot declare a type the
rule builder is unable to handle. An unrecognised type throws rather than
falling back to `string` — the old fallback hid the fact that `datetime`
had no arm at all and was being validated as a plain string. A field with
**no** type throws too, and says so in those words; the API cannot produce
that shape, but a schema written straight to the database can.

`gallery` is the one repeating type — an ordered list of images, each an object
rather than a bare URL:

```
data.photos = [ { url: '…', alt: { el: '…', en: '…' } }, … ]
```

**A gallery is never translatable and refuses the flag** (`SchemaRuleBuilder`
throws when the Module is created). A translatable one would store a different
set of photographs per language; the photographs are one set and only their
description differs, so the translation sits one level down on each image.
That makes `alt` the single place in this schema where a per-language map
appears anywhere but at `data.{field}.{lang}` — deliberate, and the reason is
in CHANGELOG.md §14. Only `url` and `alt` have rules, so nothing else in the
request reaches the column.

`text` is the one rich-text type. `richtext` and `textarea` were once
accepted as aliases that behaved identically and are no longer creatable,
but they remain *readable*: `RichTextDocument::LEGACY_FIELD_TYPES` lists
them, the rule builder normalises them to `text`, and `isRichTextField()`
matches them. Creatable and readable are separate questions — dropping
them from both left older schemas unable to save an entry or to be
migrated.

The frontend does not restate these lists. `php artisan
schema:sync-field-types` writes `resources/js/lib/fieldTypes.json` from the
PHP constants, and `richText.js` and `ModuleBuilder.jsx` import it — so
adding a type on the backend reaches the form without a second edit. Only
the labels live in JS, being wording rather than fact; a type without one
gets its own name capitalised.

`FieldTypeConsistencyTest` compares the generated file against the
constants and tells you to re-run the command when it is stale. **Run it
after changing `SUPPORTED_TYPES` or the rich-text lists.**

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

**Listing** is paginated at 15 per page, ordered by `created_at` **and
`id`** descending. The `id` is not decoration: entries saved in the same
second tie on `created_at`, and without a total order the database may
return them differently between requests, so a paginated list can repeat
or skip rows. On the client, `lib/pagination.js` reduces the paginator
envelope and `EntriesTable` renders the controls; a page past the end
falls back to the last page.

The listing takes **no language parameter**. An entry carries all of its
translations and `EntriesTable` chooses one to display, which is what
makes switching language instant and free. Filtering server-side would
mean flattening `title: {en, el}` into one value — a different response
shape, and the edit form needs every language at once anyway.

## 6. File uploads

`POST /api/upload` (`UploadController::store`) → validates
`image|mimes:jpeg,png,jpg,webp,svg|max:2048` → stores to
`storage/app/public/uploads` → returns a public URL. Called independently
from the Entry create/update request (2 separate requests).

**`svg` in that list is dead**, and should stay that way. Laravel 13's `image`
rule accepts only `jpg, jpeg, png, gif, bmp, webp` unless written
`image:allow_svg`, so an SVG is rejected one rule earlier and the uploader is
told "must be an image". Do not close the inconsistency by adding `allow_svg`:
SVG is an open language that can carry `<script>`, and these files are served
from the panel's own origin — exactly what `RichTextDocument` exists to prevent
for rich text (`TASKS.md` #50).

An upload is not linked to the Entry that references it and is never deleted
(`TASKS.md` #51) — which a `gallery` field makes worse, since removing an image
from a list orphans a file exactly as deleting an entry does.

A `gallery` field uploads several files through this same single-image
endpoint, one request each, sent together and collected with `allSettled` so a
single rejection does not discard the uploads beside it.

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
