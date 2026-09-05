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
  **`is_singleton` says whether the Module is a page or a list.** "About" is
  one entry; "Blog" is many. A column rather than a key inside `schema`, for
  the same reason `status` is one: it means the same thing for every Module and
  it is asked about on the read path, while `schema` describes an Entry's
  *fields* rather than the Module's own shape. It defaults to false, so nothing
  that already exists is reinterpreted.

  The flag is enforced in three places, and all three matter: `StoreEntryRequest`
  refuses a second entry, the panel opens straight into the one that exists, and
  the public side serves it at the Module's own address.

- **Entry** — `id, module_id, data(json), status, published_at, sort_order`.
  Belongs to one Module. Has no `user_id` of its own — ownership is derived
  indirectly through `Entry → Module → User`.

  The three columns beside `data` are **structural**: they mean the same thing
  for every Module and they are what routing, filtering and ordering run on, so
  they are indexed columns rather than schema fields (CHANGELOG.md §16).
  `status` is `draft` or `published` and new entries are drafts; `published_at`
  records when an entry *first* went out and never moves afterwards;
  `sort_order` is ascending with **`Entry::UNPOSITIONED` (100000) as the
  default**, so a position an author types comes above everything nobody has
  ordered — with a default of 0 that expectation was exactly inverted.

  The sentinel never leaves the model: an `Attribute` maps it to and from
  `null`, and it checks for `null` **before** casting, because `(int) null` is
  0 and 0 is a position. Accepted positions are therefore `1` to
  `UNPOSITIONED - 1` — both bounds exclusive of what they guard, so a client
  can neither write the sentinel itself nor a position of 0 (CHANGELOG.md
  §19).
- **EntrySlug** — `entry_id, module_id, language_code, slug`, unique on
  `(module_id, language_code, slug)`. A public URL resolves an entry by a
  *translated* value, which inside `data` would be an unindexed scan on every
  page view. `module_id` is copied onto the row so uniqueness can be per Module
  — `/el/rooms/about` and `/el/pages/about` are different pages — and so the
  lookup is one indexed read. `Entry::forSlug()` is a scope, so the public side
  composes `forSlug(...)->published()`.

  **Reading a slug is `slugFor($language)`, and a listing eager-loads.**
  `Entry::withSlugs()` is the scope for that: without it the relation loads
  itself once per model per call, so a public index of fifteen entries with a
  link each is fifteen `SELECT`s — thirty when the page also carries its
  hreflang alternates. `slugFor` still answers on a model loaded without the
  relation; it asks for the one value rather than pulling every slug into
  memory to pick one out.

  **The key of a slug is a language the site actually has.** `slugs` arrives as
  a map keyed by language code, and `ValidatesStructuralFields` checks those
  keys against the active `languages` rather than only the values. Both halves
  matter: `language_code` is `varchar(5)`, so an unchecked key was a **500**
  on MySQL rather than a 422, and an unchecked *unknown* key created a public
  URL in a language nothing would ever serve (CHANGELOG.md §17).

  **The form sends `slugs` only when the author edited one.** Sending the key
  replaces the whole set, so a save that restated what the form loaded would
  delete a language somebody added meanwhile — the same defect as resending
  `status`, one field along. Both are `sometimes`, and `syncSlugs` returns
  early when the key is absent, so omitting them is how "I did not change
  this" is expressed.

  **An entry and its slugs are one write.** `store()` and `update()` wrap the
  entry row and `syncSlugs()` in a single `DB::transaction`. `syncSlugs`
  deletes the whole set before inserting the new one — that is what "sending
  `slugs` replaces them" means — so without the transaction a failed insert
  committed the delete on its own and took every live URL with it.
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
email **and** address, on top of the `AppServiceProvider::API_PER_MINUTE` the
`api` group applies to everything. Both apply, so the tighter one binds and the
group limit never decides a login. Both limiters are defined in
`AppServiceProvider`; `bootstrap/app.php` has to call `throttleApi()` or the
group carries no limiter at all (CHANGELOG §13).

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

It describes `data` and nothing else. `status`, `sort_order` and `slugs` are
not part of a Module's schema, so their rules live in the
`ValidatesStructuralFields` trait that both Entry requests use — which also
keeps the slug-collision check from existing twice.

A **translatable** field yields two levels of rules, because its value is a
map of language code to value: `data.{name}` governs the map and
`data.{name}.*` governs each value. Both follow the field's own
configuration, so a field is required only when it says so — the outer
level was once hardcoded to `required`, which made every translatable field
mandatory.

**On a translatable field, `required` means the default language.** The other
translations may be left empty. Demanding every active language made adding a
language retroactively destructive: every existing entry became unsaveable
until somebody translated it, so an author could not correct a typo without
inventing a translation (CHANGELOG.md §22). The map itself is still required —
sending no translations at all is refused — and `Language::default()` is the
single answer to which language that is, used by the validator and the public
site alike.

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

Being the one type that repeats, a gallery is also the one with a **default
ceiling**: at most `SchemaRuleBuilder::GALLERY_MAX_IMAGES` images and 2048
characters of URL. Every other field holds one scalar, so a request bounds
itself.

The ceiling stands down only when the schema states an **upper** bound of its
own — `max`, `size` or `between`. A `min` is a floor and says nothing about how
many are too many, so it leaves the default in place. And image URLs are
`distinct` within one gallery, because the editor keys its list on the URL.

That ceiling and the `api` rate limit are related: a gallery upload is **one
request per image**, so `AppServiceProvider::API_PER_MINUTE` has to leave room
for a full one. `LoginRateLimitTest` asserts the relationship, not the numbers.

**Two fields may not share a name.** The name is the key the value is stored
under, so a duplicate is two fields writing to one place — refused in `build()`,
which both module creation and entry validation pass through.
`SchemaRuleBuilder::build()` takes the request attribute to report against
(`schema` when a Module is created, `data` from the Entry FormRequests) so a
complaint always names a field the request actually has.

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

**Listing** is paginated at 15 per page, ordered by `Entry::inListOrder()` —
`sort_order` ascending, then `created_at` **and `id`** descending. Drafts are included: this is the
admin, and an author has to see what they have not published. The `id` is not decoration: entries saved in the same
second tie on `created_at`, and without a total order the database may
return them differently between requests, so a paginated list can repeat
or skip rows. On the client, `lib/pagination.js` reduces the paginator
envelope and `EntriesTable` renders the controls; a page past the end
falls back to the last page.

**A singleton is not a list of one.** `/{lang}/{module}` serves its published
entry directly, and `/{lang}/{module}/{slug}` answers **301** to that address —
a 404 would be simpler and would break every link that exists if a Module is
made a singleton after the fact. The sitemap lists the Module's address and not
the entry's, so it never advertises a redirect. An empty singleton, or one
holding only a draft, is a 404.

The redirect is decided inside the cached closure rather than before it, so
that path costs no queries either: `PageCache::remember` stores what the page
*is* — `['html' => …]` or `['redirect' => …]` — not only its markup.

**Reordering is one request for the module's whole order**, and the endpoint
enforces that:

```
GET /api/modules/{module}/entries/order   → {"ids": [...]}  every id, in listing order
PUT /api/modules/{module}/entries/order   ← {"ids": [...]}  the order it should end up in
```

Both are routed **before** `{entry}`, or the binding tries to resolve an Entry
called "order". `PUT` writes positions `1..N` over exactly the ids it is sent,
so a body that is not the module's complete set is a 422 rather than a
renumbering — which also rejects a repeated id, since that would consume two
positions and write one row. The table holds one page of fifteen, so it asks
`GET .../order` for the whole order and moves within that; a row can therefore
swap with a neighbour on another page. Before this, a move on page 2 wrote
positions 1–5 straight over page 1 (CHANGELOG.md §17).

Both endpoints order through the same `inListOrder()` scope on purpose: the
arrows swap an entry with the row above it *on screen*, so the id list and the
listing have to be the same order.

Reordering is **two queries** whatever the row count: one to read the module's
ids, one `CASE`-based `UPDATE` to write the new positions. Existence is not
checked per id — the completeness rule already compares the body against the
module's own ids, so a foreign or missing id cannot survive it — and
`Entry::MAX_REORDER` caps the array. Fifteen rows used to be 32 queries for a
single swap.

A module holding more than `Entry::MAX_REORDER` entries **cannot be
reordered at all** — the request would have to carry the whole set, which the
cap refuses — so `GET .../order` answers `{"ids": [], "reorderable": false}`
and the panel's arrows disable themselves rather than failing on every click.
Reordering also writes through `Entry::withoutTimestamps()`: a position is not
a modification of the entry, and stamping `updated_at` across the module would
invalidate every cached public page in it.

**All three entry endpoints return the same shape.** `store`, `update` and
`show` each answer with the row read back from the database and its `slugs`
loaded, so `sort_order`, `published_at` and `status` are present whether the
client sent them or the database defaulted them.

The panel takes one move at a time: the arrows are disabled while a reorder is
in flight and the new order is applied locally first, so a second click cannot
compute from a list the first request has not yet written.

The listing takes **no language parameter**. An entry carries all of its
translations and `EntriesTable` chooses one to display, which is what
makes switching language instant and free. Filtering server-side would
mean flattening `title: {en, el}` into one value — a different response
shape, and the edit form needs every language at once anyway.

## 5. The line between core and one client

`site/` belongs to a single installation. Everything outside it ships to every
installation unchanged (TASKS.md #61, CHANGELOG.md §24).

```
site/
  theme/        the public templates, reached as `theme::layout`, `theme::entry`
  routes.php    routes this one site needs, loaded after the core routes
  README.md     what belongs here and what does not
```

Core knows **where the door is, not what is behind it**. Exactly two mount
points name the directory — `AppServiceProvider` registers the `theme` view
namespace, `routes/web.php` requires the routes file — and both do it by
location rather than by naming a file inside. Everything else in core refers to
the theme only through `theme::`, which is a **contract**: every theme provides
`layout`, `home`, `module` and `entry`.

`site/routes.php` is loaded **before** the core pages, so a client route takes
precedence — `/{language}/{module}` would otherwise claim `/el/epikoinonia`
before a hand-written page saw it — and after the `Route::pattern` calls, so a
client's `{language}` carries the same constraint core's does.

**Two addresses cannot be taken over: the panel and `/sitemap.xml`.** They are
declared on *both* sides of the client's file, because Laravel loses a route in
two different ways: dispatch picks the first matching pattern, while the route
collection is keyed by URI so a later identical path replaces an earlier one.
One position defends against one of those.

Core route names are `web.*`, leaving `site.` to the client — and the boundary
test checks that by reading core's files rather than the router, which holds
the client's routes too.

**`sitemap.xml` is core**, not theme: its structure is fixed by sitemaps.org
rather than by design, and a theme that mangled it would break indexing with
nothing visible from the panel.

`CoreSiteBoundaryTest` enforces both halves: nothing outside the two mount
points may name `site/`, and the theme must provide every `theme::` template
core renders. A boundary nothing checks is a convention people drift across.

> The public controllers are in `app/Http/Controllers/Web`, **not** `Site` —
> they are core machinery that renders whatever theme is mounted, and letting
> a core namespace claim the word would contradict what `site/` means.

## 5a. The public site

Blade, served from this same application, reading through Eloquent. There is
no public API and no client-side rendering (CHANGELOG.md §21, and TASKS.md →
Decisions).

```
/                          302 to the default language
/{lang}                    the home page
/{lang}/{module}           a module's published entries
/{lang}/{module}/{slug}    one entry
/sitemap.xml
```

**The language prefix is not optional, the default language included.** One
page therefore has exactly one address, nothing is served twice under
different URLs, and the hreflang set is symmetric. `/` redirects rather than
serving the home page itself.

Routes live in `routes/web.php` and the admin route is declared **first**,
because the public routes end in a bare `/{language}` segment and order is
what decides. The `language` pattern — two letters, optionally with a region —
is what keeps a bare segment from swallowing `admin` or `sitemap.xml`; the
code is then checked against the **active** languages, so a well-shaped but
unknown one is a 404.

**Everything is cached, and the lookup comes before the database.** Each
action hands `PageCache` a path and a closure; the closure — which resolves
the language, the module and the entry — runs only on a miss.

**A hit costs four queries, not none** — and the test that counts them says
none because `phpunit.xml` sets `CACHE_STORE=array` and `SESSION_DRIVER=array`,
while the deployment uses `database` for both. Measured on a module page: one
`sessions` read, two `cache` reads (the version, then the page), one `sessions`
write. What the cache removes is the *content* queries — the language, the
module and the entry — and that part is real. #97 replaces this whole mechanism
with files the web server serves before PHP starts, which is what #59 asked
for; until then, do not repeat the "no queries" claim.

Invalidation is **by version, not by key or tag**: `CACHE_STORE` is
`database`, whose driver has no tag support, so a counter is embedded in every
key and publishing increments it. That is O(1), needs no key bookkeeping, and
is correct for the case key-based invalidation cannot handle — a **renamed
slug**, whose old URL is not computable afterwards because the row that held
it is gone. The version is site-wide, which is the price of keying on the path
alone: without touching the database there is nothing to say which module a
path belongs to.

A `PageCacheObserver` on `Entry` and `Module` bumps it. **Model events do not
cover everything** — `EntryController::reorder` writes one mass `UPDATE`,
which fires none, so it invalidates by hand.

**A page carrying a form is not cached at all.** Everything a form needs is one
visitor's session — the CSRF token, the confirmation after a submission, the
errors after a failure, the values to type back into the boxes — and a cached
page has none of it. `PageCache` detects the case from the rendered HTML: any
form posting back to this application carries a CSRF token, so the token is the
marker and no theme has to declare anything. Which pages that costs is the
client's decision, made by where their theme puts the form.

The key also carries a **shape prefix** (`page.v3`), bumped by hand whenever
what is stored changes. Both bumps so far were faults found only by opening the
deployed app: the counter above moves on a write, never on a deploy, so entries
from the previous release are read by the new code.

`EntryPresenter` turns a Module's schema into something a template can loop
over, resolved to the language being rendered: rich text through
`RichTextRenderer` (so no template writes `{!! !!}`), a gallery as a list of
images, everything else as escaped text. The templates in `resources/views/site/`
are deliberately plain — the bought theme replaces them in #62, and what has
to be right now is the head.

## 5a. Translations (TASKS.md #96 — public side done, panel not yet)

**The address decides the language, not a header.** `SetLocale`, aliased as
`locale` and declared on the public routes, calls `App::setLocale()` with the
`{language}` segment. A page whose text changed with `Accept-Language` would
exist at one URL in several versions, which is what the language prefix is for.

It **resolves nothing** — no query, not even to check the language exists. That
is the controller's question, asked after the cache. `PageCacheTest`'s
zero-query test runs over a route this middleware is on, so a lookup added here
fails it.

Strings are **JSON translations keyed by their English text**, in two
directories with two owners:

| Directory | Ships to | Holds |
|---|---|---|
| `lang/{locale}.json` | every installation | core's own messages |
| `site/lang/{locale}.json` | one client | the theme's labels |

The second is the third mount point in `config/site.php`, beside `theme` and
`routes` (#61) — the theme calls a field "Name" or "Όνομα" for the same reason
it decides where the form goes.

Two consequences of that shape, both tested in `TranslationTest`:

- The loader **merges both into one namespace**, so a key written on both sides
  is won by whichever it reads last. A test fails when they collide.
- A locale with no file falls back to the key, which is English. So a client
  who activates Italian gets an English theme, not `theme.form.name` in front
  of a visitor. A second test keeps every locale file carrying the same keys as
  `en.json`, which is what catches a half-translated release.

Laravel's own messages come from `lang/{locale}/*.php` (`lang:publish`), where
a missing key falls back per-key to `APP_FALLBACK_LOCALE`. A partial Greek
`validation.php` is therefore legitimate and does not need finishing to be
correct.

## 5b. Enquiries — the one thing an anonymous visitor may write

`POST /{lang}/enquiries` (`Web\EnquiryController`) is the only route in the
application that accepts a write without a session (TASKS.md #66, CHANGELOG
§25). Everything else sits behind `auth:sanctum`.

A **web** route rather than an API one, because it is posted from a Blade form
and that gives it the session, the CSRF token and `back()` with the errors.

- **The row is written first.** Notifying the owner is wrapped and its failure
  logged: a mail server that is down must not turn a stored enquiry into a 500
  the visitor reads as "it did not send".
- **A honeypot, not a captcha.** Checked in the controller rather than by a
  rule, so a filled trap answers exactly as a real submission does — an error
  naming a hidden field is how a bot learns to stop filling it.
- **Its own limiter**, `throttle:enquiries`, five an hour per address, keyed on
  the address alone because the throttle middleware runs before validation.
- **Consent is a timestamp**, not a flag: a record of when it was given.
- **Read and delete only.** There is no update route, so a PUT is a 405.
- **`enquiries:prune`** enforces the retention period the form states, daily
  from `routes/console.php`.

> **A page with the form on it is not cached** — see §5, *the public site*.
> The form needs session state and a cached page belongs to nobody, so the
> whole page is rendered per visit. The first attempt substituted only the
> CSRF token and was the wrong depth: the visitor still saw no confirmation
> and no errors.

The message the visitor writes reaches the owner's mail client, which trusts
the sender because it is their own site. `Markdown::withSecuredEncoding()` is
enabled in `AppServiceProvider`, so `[text](url)` in an enquiry arrives as the
characters that were typed rather than as a live link — HTML escaping does not
touch Markdown syntax, and Laravel's mail templates are Markdown.

The inbox endpoints ask `EnquiryPolicy`, like every other admin endpoint asks
`ModulePolicy`. The answer today is "anybody signed in", which the route group
has established already; the calls exist so that group permissions land in a
policy rather than having to be remembered at an endpoint holding visitors'
names, addresses and phone numbers.

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

**Rendering back out** is [`RichTextRenderer`](../app/Services/RichTextRenderer.php),
the other half of the same contract: normalise on write, render on read, from
one vocabulary. It runs the document through `RichTextDocument::normalize()`
first rather than keeping a second allowlist, so it only ever walks a tree that
has already been rebuilt — a document written straight into the database is no
more dangerous than one saved through the API.

The closed vocabulary makes the *structure* safe; the **text is not**, because
it is stored verbatim on purpose. Every string reaching the output is escaped
with `ENT_QUOTES | ENT_SUBSTITUTE` — the second flag matters, since without it
`htmlspecialchars` returns an empty string for malformed UTF-8 and would delete
a paragraph rather than mangle a character.

It returns an `HtmlString`, so **a Blade template writes `{{ }}` and never
`{!! !!}`**. The claim that the output is safe is made once, in that class,
instead of at every call site — the server-side counterpart to keeping
`dangerouslySetInnerHTML` out of the React code.

**`toHtml($value, $language)` takes the language**, because a translatable
field holds a *map* of language code to document rather than a document — the
common shape here. Passing the map without a language raises; a language nobody
has written yet renders empty, since that is data rather than a mistake. The
argument is ignored on a field that is not translatable, so a template passes
the language it is on without first asking which kind of field it has.

`RichTextDocument::NODES` and `MARKS` are public because they are the
vocabulary, not an implementation detail: the renderer must produce markup for
every key, `RichTextRendererTest` walks both lists to check it does, and an
unknown type **throws** rather than rendering nothing — silence is what let a
type added to one and not the other disappear from the page.

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
