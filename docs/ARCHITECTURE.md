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

The redirect is decided after the entry is resolved rather than before it,
because redirecting first made every invented slug under the module a 301 —
a soft 404 to a crawler. A redirect is **not baked**: a file that says "go
somewhere else" is what the web server's own rules are for, so a singleton's
entry address is the one public URL that always reaches PHP.

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

**Every page is a file on disk, and the web server hands it over before PHP
starts** (#97). `StaticPages` writes `public/cache/{lang}/{module}/{slug}.html`;
two rewrite rules in `public/.htaccess` serve whatever is there, for GET only.
A visitor on a baked page runs **no PHP and no queries at all** — verified live
by response headers: `ETag` and `Last-Modified` present, no `Set-Cookie`, no
`X-Powered-By`.

That replaced `PageCache`, and the reason is a measurement. A cache *hit* cost
**four queries** in production — one `sessions` read, two `cache` reads, one
`sessions` write — while the test that counted them said none, because
`phpunit.xml` sets `CACHE_STORE=array` and `SESSION_DRIVER=array` and the
deployment uses `database` for both. #59 asked for finished HTML without a
query. A file is that sentence taken literally.

Two consequences worth knowing:

- **The site survives its own database.** A hotel whose MySQL falls over in
  August still serves every page.
- **There is no expiry.** The old cache had a seven-day TTL underneath its
  explicit invalidation, which quietly cleaned up after anything nobody thought
  to drop. A file does not expire, so **anything that changes a page must say
  so** — which is why `Language` is observed now and never was before.

**The address is composed from rows, never from the request path.** Each render
closure builds it next to the rows it just resolved — the language row's code,
the module's slug, the entry's slug — and `StaticPages` checks every segment
again before touching the filesystem. Writing inside `public/` from something a
visitor controls is how a crafted URL puts a file where it should not be. The
dangerous direction is *deleting*: invalidation composes addresses straight from
a slug column with no route pattern in between, so a row holding `../../x`
would reach outside the directory. A page whose address fails the check is
served and simply not baked — the live database has a module whose slug is
`τεστ κεις`, and `pages:warm` reports it rather than hiding it.

**Invalidation is precise**, which the version counter could not be: an author
saving has the rows in hand. `StaticPageObserver` drops an entry's own
addresses, its module's listings, the home pages and the sitemap; a `Module`,
`Setting` or `Language` write empties everything, because each of those moves
or changes every page. Measured live: touching one entry took 61 files to 51,
and another module's pages survived.

**Model events do not cover everything**, and here that shapes the code:

- `EntryController::reorder` writes one mass `UPDATE` and fires none, so it
  calls `forgetModule` by hand.
- `syncSlugs` deletes the slug rows en masse, also firing none. **The entry is
  therefore saved before the slugs are replaced**, so the observer reads the
  old addresses while the rows still hold them. Swapping those two lines leaves
  the old page on disk for ever; `StaticPagesTest::test_renaming_a_slug_removes_the_old_address`
  is what says so.
- `entry_slugs` cascades on delete, so the observer acts on `deleting` for an
  Entry rather than `deleted` — one event earlier, for the same reason.

**The switch is `PAGE_CACHE` in `.env` and a field on the settings screen**,
the saved value winning. It controls only whether files are *written*: off
means flush and stop writing, so an empty directory is what sends requests back
to PHP and the fast path reads no setting and runs no query. `pages:warm` fills
the directory by walking the sitemap — which *is* the list of public addresses,
so the two cannot disagree — `pages:flush` empties it, and `pages:doctor` asks
a running server whether the answer came from a file.

**A deployment invalidates the whole site, and `pages:warm` is the deploy
step.** Nothing else notices a release: a `.stamp` beside the pages holds a
fingerprint of the templates the markup came from, but the check only runs when
PHP renders — and after a deployment every page is already on disk, so Apache
answers and PHP never starts. Verified on the live site: touching a template
and asking for the page left all 62 files exactly as they were. Warming renders
through PHP, so its first write finds the moved fingerprint and takes the stale
release with it. `pages:doctor` refuses when the stamp is stale, which covers a
deployment nobody warmed.

**The rest of the deployment dependency fails silently too.** `.htaccess`
covers Apache; nginx needs `try_files` in its server block, which an `.htaccess`
cannot reach and no test can see. A missing rewrite breaks nothing — every page
is quietly served through PHP again and the site looks entirely normal. That is
the other half of what `pages:doctor` is for.

**Baking may never cost a visitor their page.** `write()` catches everything and
logs: `mkdir` and `file_put_contents` are unguarded inside `File`, Laravel turns
their warnings into exceptions, and the write happens before the response is
returned — so a `public/cache` the web user cannot write answered **500 for the
whole public site**, which is the ordinary permissions mismatch of a deploy.

**The directory is refused directly.** `public/cache` is inside the document
root, so `/cache/el.html` served the same page at a second address until a
`RewriteRule ^cache/ - [F]` closed it — and the serving rules use `[END]` rather
than `[L]`, because in per-directory context `[L]` restarts the ruleset and the
internal rewrite would come back round and be refused by that same rule.

**A page carrying a CSRF token is not baked.** Everything that token implies
belongs to one visitor's session, and a file is handed to everybody.
`StaticPages::write` detects the case from the rendered HTML — any form posting
back to this application carries a token, so the token is the marker and no
theme has to declare anything.

Since #97 that is a **guard, not the normal case**: the shipped theme's form
carries no token, because it is submitted by `public/forms.js` rather than by
the browser, so the page it sits on *is* baked. What the guard catches now is
a client route rendering its own Blade form with `@csrf` — see §5b, *the form
is a JS island*, which is where the reasoning lives.

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

## 5d. A Module is translated too (TASKS.md #114)

Raised by the owner from `/fr/ypiresies/petit-dejeuner`: the entry was
translated and the thing containing it was not, so every language carried a
Greek transliteration in the middle of its URL — and the page it served was
titled *Υπηρεσίες*.

`module_slugs` holds a **name and a slug per language**, rows rather than a
JSON column for the same reason `entry_slugs` are rows: the public side
resolves a module by a translated value on every cache miss, and #58 settled
that this has to be one read of one index.

**`modules.name` and `modules.slug` stay, and their meaning narrowed.** They
are the *panel's*: the admin API resolves `/api/modules/{module}` by slug, and
that key cannot depend on a content language because the panel does not have
one. Everything a visitor reads or types comes from `module_slugs`.

Two rules, both decided by the owner on 2026-09-06:

- **No translation means no page.** A module nobody has translated into French
  has no French address, is not in the French menu, and is not in the sitemap —
  the rule entries already followed. Falling back to the default language's
  slug is what produced `/fr/ypiresies`, and it tells a search engine a Greek
  address is a French page. An entry translated into a language whose *module*
  is not has no address there either: there is no first segment to hang it on,
  so `alternatesForEntry` checks both.
- **A new module exists in every active language at once**, seeded on the
  model's `created` event rather than in the controller — a rule only the panel
  honours holds until somebody uses the API. "No translation" is about a
  language the owner has not reached yet, not about the moment of creation.

The migration backfills every existing module with its current slug and name in
every active language, so **the site is unchanged the moment it lands** —
verified on the live database: 39 rows for 13 modules and three languages, and
all three of the addresses above still answered 200.

**Renaming a slug changes every URL under it**, and there is no redirect table
yet: after translating `ypiresies` to `services`, `/en/ypiresies/breakfast`
answers 404. That is why #69 is step three of this item rather than *first real
client* work.

The theme's contract changed with it: `theme::home` receives `$modules` as
`['name' => …, 'url' => …]` already resolved to the page's language, so no
template composes an address, and `theme::module` titles itself from `$title`
rather than `$module->name`.

### The panel half

`PUT /api/modules/{module}` is the **first endpoint that has ever edited a
Module** — `ModuleController` had `store` and `index` and nothing else, so
translating one meant a hand-written UPDATE. It is deliberately narrow: names
and addresses only. The schema is not editable there, because what editing one
means for the entries already written against it is an open question (TASKS.md,
*To discuss*), and a rename endpoint is the wrong place to answer it by
accident.

**The slug is derived per language, from that language's own name.** `Str::slug`
transliterates rather than translates — from *Υπηρεσίες* it produces
`ypiresies` whatever language you ask for, which is how `/fr/ypiresies` came
about. PHP cannot translate and must not try: the person types the name in each
language and the derivation runs once per language on those words. An explicit
slug still means "exactly this", and a duplicate is a 422 rather than a silent
rename — per language, since `/el/services` and `/en/services` are different
pages.

**A language left out of the payload loses its translation**, the same rule
`syncSlugs` follows for an entry: that is how a client removes a section from a
language. And `modules.slug` never moves after creation — it is the panel's
route key, and a key that changed under a rename would break every address the
panel is holding at that moment.

**Renaming flushes the baked site**, and that had to be added after the fact:
`syncTranslations` deletes the slug rows en masse, which fires no model events,
and the module row itself is never saved, so `StaticPageObserver` never runs.
The old pages stayed on disk and the web server went on serving them — found by
renaming a section on the live site and watching its old address answer 200.
The same trap `EntryController::syncSlugs` carries a comment for.

**A Module's schema is editable, additively** (#115). The same endpoint takes
a `schema`, and the line is one question per change: *does this reshape data
already stored?* Adding a field, reordering, and changing `required`,
`validation` or `options` do not — `EntryPresenter` reads
`$entry->data[$name] ?? null`, so a field nobody has filled renders empty.

Four do, and `refuseReshaping()` answers 422 for each with the field named:
renaming orphans every value stored under the old key, removing hides values
that are still there, the type decides how a value is read back, and
**`translatable`** decides whether the value is a scalar or a map of language to
value. That last one looks like a checkbox and is a type: turned on, a stored
scalar sits where a map is expected and the Greek text prints on the French
page. Those stay a hand-written migration, which is what TASKS.md → *To
discuss* now records as settled.

One consequence is accepted knowingly: a field made required leaves every entry
that lacks it unsaveable until it is filled. Nothing is lost, and it is what
"required" means — and `ModuleSchemaEditTest` asserts it rather than leaving it
to the documentation.

**The schema and the addresses are one write.** `update()` wraps them in a
`DB::transaction`, because `syncTranslations` deletes every slug row before
re-inserting: a failure part way through left the module with fewer addresses
than it had, or none, and since #114 a module with no addresses has no public
page anywhere. TASKS.md #77 is the same defect one level down. The module row
is saved even when only the translations changed, and **that one save is what
drops the baked pages** — the row-level writes underneath it fire no model
events, and an explicit flush inside `syncTranslations` used to empty the
directory a second time on every schema change.

**A translation key is a language this site has.** `module_slugs.language_code`
is `varchar(5)`, so an unchecked key longer than that was a 500 on MySQL rather
than a 422, and a short unknown one silently created an address in a language
nothing would serve — CHANGELOG §17 for an entry's slugs, missed when these
were written. Membership of **any** language rather than the active ones,
because the panel has to be able to translate into one that is not published
yet.

**The screen that reaches it** is `ModuleTranslator`, opened from *Rename* on
each row of the module list. It shipped a commit late: the endpoint went in
first with nothing in the panel that could call it, so a module created with a
language left blank stayed that way and there was no edit anywhere. An endpoint
nothing can reach is not a feature. `ModuleTranslations` is the per-language
block and `ModuleFields` is the field editor, both shared by the create and edit
screens so they cannot drift — `ModuleFields` is handed the field names that
already exist and disables renaming, retyping, translating and removing them,
rather than letting somebody fill in a form the API will reject. And
`GET /api/modules` now carries each module's translations so the list can show
what is missing without a request per row.

`LanguageController::index` **stopped filtering `is_active`**. One endpoint was
answering two audiences that need different answers: a language switched on so
the client can translate puts a link in the public switcher to a half-empty
site, and switched off it is invisible in the panel so they cannot translate at
all. The public side never asked this endpoint anything — `PageController` and
`SitemapController` query `is_active` themselves — so what a visitor sees is
unchanged, and the panel now shows each language with its state.

## 5e. An address that moved (TASKS.md #69)

`redirects` is one table — `from_path`, `to_path`, `status` — and it answers
two needs that arrived together. **A rename moves URLs**: since #114 a Module's
address is per language, so translating one takes its listing and every entry
page underneath it somewhere else, and the old addresses would 404 from the
moment the owner pressed *Rename*. **And a new site replaces an old one**: the
client's previous website has URLs Google already ranks, and losing them is a
drop the delivery caused.

**It runs from the 404, not from a middleware.** `bootstrap/app.php` calls
`Redirects::answer` while rendering a `NotFoundHttpException`. That is the one
moment the question is worth asking, and it is what makes a stale row inert
rather than dangerous: the router and the controller have both declined by
then, so a row can only ever add an answer where there was none. It also covers
both kinds of miss, which a route could not — a renamed module still *matches*
`/{language}/{module}` and 404s inside the controller, while
`/rooms/deluxe.html` from the site being replaced matches no route at all.

**Nothing in a row is trusted.** They are written by hand, so every field is
checked on the way out as well as on the way in: the destination must be a path
on this site, and **the status must be a redirect**. Symfony's
`RedirectResponse` throws on anything that is not 3xx, and that exception would
be raised while a 404 was being rendered — so one mistyped row would answer
500 where the site used to answer 404 politely. Anything unrecognised is served
as 301.

**Addresses are compared decoded.** `getPathInfo()` is percent-encoded and a
person writing a row types what they read; the first market is Greek
accommodation, so `/δωμάτια` against `/%CE%B4%CF%89...` is the ordinary case.
Both ends are decoded, a row written either way is matched, and the `Location`
header is encoded again on the way out. Decoding happens **before** the safety
checks, which is what makes them mean anything: `/%2Fevil.example` is
`//evil.example`.

**A row may be keyed by its query string.** `/index.php?p=17` is one page, not a
hundred — that is every pre-permalink WordPress, which is what a client's old
site usually is. The most specific key wins, and the query a visitor arrived
with is carried across to the new address *unless* the row was matched by it,
so a campaign link to a renamed page still tells the client where the visit came
from.

**Matching is case-sensitive on both engines.** The two path columns carry
`utf8mb4_bin` on MySQL, whose default collation would otherwise fold case where
SQLite does not: `/Rooms` and `/rooms` would be one row in production and two in
the suite, and a client's old site holding both would be a duplicate-key 500 no
test could see.

**A rename costs three statements, not three per page.** A catalogue of two
hundred entries in three languages is six hundred moves; one transaction each
would hold the panel's Rename button open for seconds and roll the whole rename
back on a timeout. `RedirectTest` pins the count, the way `EntryOrderingTest`
pins reordering's.

**Nothing points at a page that has gone.** `RedirectObserver` deletes the rows
naming an Entry's or a Module's addresses as it is deleted — `deleting`, like
`StaticPageObserver`, because the slug rows cascade. A 301 into a 404 is worse
for the client than the old address simply being gone: a crawler follows it and
records the *new* address as broken.

**A 404 stays a 404 when the lookup fails.** The query is wrapped, because this
is the last thing between a visitor and the page telling them there is nothing
here: a database that is down, or a deployment where nobody ran the migrations,
would otherwise turn every missing address into a 500. `CoreSiteBoundaryTest`
found that within minutes of the hook going in — it boots the router without
the schema. Same rule as `StaticPages::write`: the feature may make a request
better, never worse.

**Chains are flattened as they are written**, so serving is one lookup:

| Then | The table holds |
|---|---|
| `services` → `facilities` | `/en/services` → `/en/facilities`, and one row per entry page |
| `facilities` → `amenities` | `/en/services` → `/en/amenities`, `/en/facilities` → `/en/amenities` |
| renamed back to `services` | only `/en/facilities` → `/en/services` — the row for the live address is deleted, not left pointing at itself |

**The destination is a path on this site.** Never a URL, and never `//host`,
which starts with a slash and would send every visitor who hit that address to
somebody else's server. Rows are written by hand, so that is one UPDATE away
rather than hypothetical, and it is checked both when a row is written and when
it is served.

**Who writes the rows.** The two rename endpoints write their own —
`ModuleController::update` and `EntryController::syncSlugs`, both reading the
old addresses *before* the slug rows are replaced, exactly as
`StaticPageObserver` has to. The client's old site is rows the agency writes by
hand, like a language (#52): there is no endpoint, because a client editing
redirects is a support call about a redirect loop.

**A baked page would hide all of this**, and does not: a rename saves the
Module, the observer flushes the whole directory, and the old address has no
file to serve, so the request reaches PHP and gets its 301.

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

### Being refused in your own language (#99)

Laravel's own messages come from `lang/{locale}/*.php` (`lang:publish`), where
a missing key falls back **per key** to `APP_FALLBACK_LOCALE`. That fallback is
what made this half-work invisible: the two messages written by hand were
Greek, every framework one was English, and the page looked translated.

**`lang/el/` is the only published locale directory.** `lang/en/` is deleted:
its `validation.php` was byte-identical to the framework's, which the loader
searches first, so English needs no file of ours. `lang:publish` writes one
back when a translator wants a reference.

`lang/el/validation.php` is **partial on purpose** — the rules the three
surfaces use: the enquiry form's, and everything `SchemaRuleBuilder` emits for
the settings screen and for an entry screen. Everything else resolves through
the fallback exactly as before, so a rule nobody uses is not a gap.
`ValidationLanguageTest` is what says which rules count as "used": it reads
them out of `StoreEnquiryRequest::rules()`, the settings schema and a module
schema carrying **one field of every supported type**, so a rule added later
without a Greek message fails there rather than in front of a visitor.

**One set stays open and cannot be closed.** A module field carries a
`validation` string its author writes, so `digits:10` or `date_format:d/m/Y`
reaches Laravel with no message of ours behind it and falls back to English by
design. Two of those also print a parameter into the sentence, which is the
same leak `after_or_equal:today` had — where the rule is ours to declare, the
message is written out beside it instead.

**A date answers one complaint at a time.** `arrives_on` and `departs_on` carry
`bail`: Laravel runs every rule on a field, and `after_or_equal` fails for a
value that is not a date at all, so `15/07/2027` — how Greek writes a date —
was told both that it is not a date and that it is in the past. The second was
false.

**The sentence is half of it; the field's name is the other half.** Every
framework line interpolates `:attribute`, which is the request key unless
something says otherwise — so a translated file alone produces *«Το πεδίο
arrives_on είναι υποχρεωτικό»*. `StoreEnquiryRequest::attributes()` names them,
and `SettingController` does the same with the settings screen's declared
labels (#67). **In the request rather than in each locale's `attributes`
array**, so one declaration serves every language, including one a client's
site has and core has no file for.

Those labels are **core's own words** (*Full name*, *Arrival date*), not the
theme's (*Name*, *Arrival*): `TranslationTest` refuses a key both sides
translate, and core reading a string the client owns is the line #61 draws. A
client whose form says *Όνομα* therefore gets a refusal that says
*Ονοματεπώνυμο*.

**A message that interpolates a rule parameter needs writing out.**
`after_or_equal:today` puts `today` into `:date`, so the Greek sentence ended
*«…μεταγενέστερη της today»*. Rules like that get a written message beside the
rule instead — which is what `departs_on.after` already did.

### The panel is the other axis

`languages` rows are the languages the *content* is translated into. The
language a person reads the *interface* in is a different question — a German
owner may run a Greek and English site — so **content languages are rows and
interface locales are files**. `InterfaceLocales` holds that rule and nothing
else may blur it.

| | Where | Set by |
|---|---|---|
| Which locales exist | `lang/*.json` on disk | dropping a file in |
| A person's choice | `users.locale`, nullable | `PUT /api/user/locale` |
| The installation's | `config('site.locale')` | `SITE_LOCALE`, then #67 |

`PanelController` resolves the three in that order — each taken only if a file
for it exists, because both the column and the config are editable outside the
application — and writes the result plus **the whole catalogue for that
locale** into `window.miniCms`. `resources/js/lib/i18n.js` reads it and exposes
`t()`, which is `__()`'s rule in four lines: the key is the English text, and
`:name`, `:Name` and `:NAME` are replaced in **one pass**, longest name
first, which is what PHP's `strtr` does. One pass matters as much as the
order: replacing a name at a time would rescan what it had just inserted, so a
module title containing `:id` would have it substituted too.

**Injected rather than bundled, and that is the point.** Vite never sees these
strings, so adding a language is a file the owner drops in — no migration and
no `npm run build`. It is also why the picker reloads the page: a different
language is a different document.

`SetPanelLocale` does the same for the API, appended to the whole group rather
than to the authenticated routes: with no user it resolves to the
installation's locale, which is what the login screen was rendered in, so a
refused password is refused in the language of the form.

> **`__('English text')` in the source is not an untranslated string.** The key
> *is* the English, so the call sites read as English and the Greek lives in
> `lang/el.json`. What an actual miss looks like is a bare string with no
> `__()` around it — and five `$fail()` closures were exactly that until they
> were found by grepping for `$fail(` rather than for quoted sentences, since
> they build their message by interpolation. See TASKS.md #112.

## 5c. Site settings (TASKS.md #67)

One row, one screen, `SiteSettings`. It holds two kinds of value and that is
deliberate — two screens would be two places to look for "why does the site say
the wrong phone number":

| `group` | Read by | Examples |
|---|---|---|
| `core` | this application | `enquiries_to`, `panel_locale` |
| `site` | the theme | phone, address, opening hours, social links, logo |

**A table rather than the singleton Module the item first described.** A
singleton is the client's content — they create it, name it, and could rename
or empty it. Core cannot read `enquiries_to` out of a row the client owns and
might not have made: an enquiry can arrive on the first day of an installation,
before any module exists, and the panel resolves a language before anybody has
signed in.

**The fields are declared in a Module schema's shape**, so `SchemaRuleBuilder`
validates them — the two-level translatable rules included — and there is no
second set of rules growing up beside the first. The panel builds its form from
`GET /api/settings`, which returns the schema alongside the values, so a field
added to `SiteSettings` needs no edit in JavaScript. Labels are literal `__()`
calls, translated server-side, so the API's locale decides them.

Three things follow from where it is read:

- **`config('site.*')` is the default, not a previous home.** A key nobody has
  saved falls back to it, so a fresh copy works and `.env` still means
  something. A key that *is* saved wins even when empty — an owner who cleared
  the notification address meant to clear it.
- **A save merges; it does not replace.** That follows directly from the line
  above: an absent key means "not saved", so replacing would send every field a
  client did not mention back to `.env`. A stale tab saving three fields would
  have quietly restored the developer's notification address.
- **One row, at a fixed key.** `find(ROW_ID)`, not "the first row there is" —
  read-then-write is how two simultaneous saves become two rows and half the
  settings disappear without an error.
- **A missing table is an answer, not a 500.** The read catches a query failure
  and checks `Schema::hasTable` only then, so an unpacked-but-unmigrated copy
  shows a login screen rather than a stack trace, and a real database fault
  still surfaces.
- **`resolve()` asks the user first.** `SetPanelLocale` runs on every API
  request, and reading settings for a question `users.locale` already answered
  would be a query per call. `EntryOrderingTest` pins the count.

`PageController::chrome()` hands every public template `$settings`, resolved to
the language being rendered — inside the cached closure, so a hit costs
nothing. Saving invalidates the cache through `PageCacheObserver`, like an
Entry: the footer is on every page.

### The panel's language decides which content language it opens on (#116)

The two axes stay separate — the panel's language is a file, the content's is a
row — but where they overlap, the panel follows. `contentLangCode(languages,
locale)` answers the content language matching the panel's own when the site
has it, and the site's default when it does not: a panel in German over a site
of el/en/fr opens on Greek, a panel in English on English.

It decides the **initial** language only; the selector still switches it, and
changing the panel's own language reloads the page, so the two never drift
apart on screen. An inactive language is excluded — it is in the panel so it
can be translated before going live (#114), not so a listing opens on it — and
that holds for the **fallback as well**. Three steps, narrowing: the panel's
own language when the site publishes it, then the published language the site
opens on, then, only when nothing at all is published, whatever default there
is, because a site still being set up has to stay editable.

Two helpers carry it. `lib/modules.js` answers which name a row shows in a
given language, falling back to the panel's own; two screens make that decision
and, while it was an expression inside each of them, one of the two was missed
until somebody opened the panel. `lib/languageStore.js` fetches
`/api/languages` **once per page load** for all five screens that want it —
they each had their own request, so moving between the module list, a module's
entries and back re-asked for a table that changes only when the agency runs an
INSERT by hand (#52). A rejection is not cached: one screen's dropped
connection should not follow somebody around the panel.

Read by the module list (the names — the Slug column beside them stays the
panel's own key, which is what the admin API resolves a module by), the entries
table, that screen's heading, and the entry form's opening tab.
the complaint that produced this: the interface in English above a section
still titled in Greek.

## 5b. Enquiries — the one thing an anonymous visitor may write

`POST /{lang}/enquiries` (`Web\EnquiryController`) is the only route in the
application that accepts a write without a session (TASKS.md #66, CHANGELOG
§25). Everything else sits behind `auth:sanctum`.

A **web** route rather than an API one, because the form it serves is a Blade
form: the session, the CSRF machinery and `back()` are all there when a client's
own page wants them.

**It answers in two shapes since #97.** The shipped theme's form is a JS island
and reads JSON — `{status, message}` on success, Laravel's `{message, errors}`
on a 422 — with the wording translated by the server, so no catalogue ships to
the browser. A plain Blade form with `@csrf`, which a client route may still
render, gets its redirect and its flash exactly as before. Which shape is
decided by `expectsJson()`, and `bootstrap/app.php` has the matching clause:
`shouldRenderJsonWhen` had been narrowed to `api/*`, which replaced Laravel's
default rather than adding to it and quietly took JSON errors away from every
web route.

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

### The form is a JS island (#97)

**A page with the form on it is cached**, and that reverses §25. The rule there
— session state may not be cached — is still right; what changed is that the
form no longer carries any. No CSRF token, no confirmation, no error bag, no
`old()`: the markup is the same for every visitor, and the page can therefore
be a file.

`public/forms.js` is the whole client side, and three things about it are
deliberate:

- **One submitter, not one per form.** A form opts in with `data-cms-form`;
  nothing in the script knows what an enquiry is. A client's home page will
  carry a newsletter box and a search before long.
- **Not built and served from a fixed path.** A cached page is a file, and a
  hashed asset name baked into one is a script that disappears on the next
  `npm run build` while the page pointing at it survives.
- **It sets the site's first cookie, and only on interaction.** The token is
  fetched from `/sanctum/csrf-cookie` when a visitor first touches a form —
  somebody who only reads a page is never given one, which is most of #70.

`StaticPages::carriesSessionState()` stays, and is not now unreachable: a
client route rendering its own `@csrf` form is exactly the case it guards. It
was nearly lost when `PageCache` was replaced — the guard went with the class
and the tests pinning it went with the test file — so it is pinned in
`StaticPagesTest` in both directions now.

The cost, accepted at the stop that decided this: the form needs JavaScript.

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

## 8a. Numbers that mean something (TASKS.md #98)

A limit written twice is two limits. The enquiry widths were written three
times — the migration, `StoreEnquiryRequest`, the theme's `maxlength` — and
`phone` (40) and `source_url` (512) happened to sit exactly at the column
limit, so relaxing a rule without a migration answered MySQL **1406**: a 500 on
the one form open to strangers, and invisible to the SQLite the suite runs on.

**A width belongs to the model that owns the column**, which is where
`User::LOCALE_MAX_LENGTH` went when the same split turned up during #96:

| Constant | Read by |
|---|---|
| `Enquiry::NAME_MAX_LENGTH`, `EMAIL_`, `PHONE_`, `SOURCE_URL_` | the migration, the rules, the theme's `maxlength` |
| `Enquiry::MESSAGE_MAX_LENGTH`, `GUESTS_MAX` | the rules and the form — **not** widths: the columns are `text` and a small integer |
| `Module::NAME_MAX_LENGTH`, `Module::SLUG_MAX_LENGTH` | `modules`, `module_slugs`, `ModuleController` |
| `EntrySlug::SLUG_MAX_LENGTH` | `entry_slugs`, `ValidatesStructuralFields` |
| `Entry::PER_PAGE` (15), `Enquiry::PER_PAGE` (20) | the two listings |
| `UploadController::MAX_KILOBYTES` | the upload rule |

**The migrations hold literals, deliberately.** A migration is a record of
what the schema became on the day it ran; one that read a constant would mean
something different on a fresh database than on one that had already run it, so
`migrate:fresh` and an upgraded installation could end up with different columns
from the same code — the original defect, made environment-dependent.

That leaves gaps no test can close, because editing a constant does not alter
a column that already exists and nothing here edits a server's `php.ini`.
**`php artisan schema:doctor`** is what closes them, beside `pages:doctor` on a
deployment. It answers in **four** states rather than two:

| | |
|---|---|
| the column is narrower than its constant | failure |
| the column, or its table, is not there | **failure** — the completest way for a schema to fall behind, and reading it as "no width reported" is how the first version passed a database with a column gone |
| the type declares no width | reported as unknown, named, and not counted as well |
| `upload_max_filesize` is **below** what the panel accepts, or `post_max_size` is at or below it | failure — the upload never reaches the rule, and the owner is told the image is missing. Equal is enough for the file itself, because PHP refuses one that is *larger*; the body around it needs more |
| either setting is not a size PHP can read (`2MB` for `2M`, which PHP reads as two bytes) | failure — unreadable is not the same answer as unlimited |

The arithmetic is `SchemaLimits`, pure and separate from the command, so all of
it is tested on the driver that reports nothing: SQLite records no width at all
(Laravel's grammar writes `varchar` with no length), which is why the command
names the columns it could not read instead of passing.

`ColumnWidthTest` covers what remains: the rule outgrowing the constant
(refusals over HTTP, one case per field), the form outgrowing it (the rendered
`maxlength`, read from the partial rather than from a page, because where a
theme puts its form is the theme's business), the doctor's reading of a column
type, and — by reflection — that **every** width constant is on the doctor's
list. That last one is by *name*: several of these are 255, so a list of values
called a constant covered when what covered it was somebody else's.

**Two numbers were below a sum nobody had done.** A public path is
`/{{language}}/{{module}}/{{slug}}`, which reaches 518 characters, and the
enquiry form stores that address with a scheme and a host in front of it. At
512, `redirects.from_path` could not record where a renamed module's pages went
(logged and skipped, so the old address stayed dead), and `enquiries.source_url`
made a page with long slugs refuse **every** enquiry sent from it — naming a
hidden field the visitor can neither see nor fix. They are 640 and 2048 now, and
two tests assert the sums rather than the numbers.

The two page sizes were different for no stated reason. They still differ, and
now say why: an inbox is read top-down, an entries table is **reordered by
hand** and has to fit on a screen.

**What was looked at and deliberately left**, so a later pass knows:

- **`language_code` is `varchar(5)` in four tables** (`enquiries`,
  `entry_slugs`, `module_slugs`, and `users.locale` as `LOCALE_MAX_LENGTH`).
  One constant on `Language` would cover the first three. Left because the
  number is the same everywhere and nothing has ever needed to move it, but it
  is the next one of these if something does.
- **`SchemaRuleBuilder::GALLERY_URL_MAX_LENGTH` and `GALLERY_MAX_IMAGES`** were
  already named, and are read by the builder and by `SiteSettings`.
- **`Entry::UNPOSITIONED` (100000)** is a sentinel rather than a limit, and its
  reasoning is in #56's section.
- **`Enquiry::RETENTION_MONTHS` and `PER_HOUR`** were already named and already
  read by the form, the pruner and the limiter.

## 9. Source of truth

If anything here disagrees with the code, the code wins — update the doc.
