# Open work

What is left to do. Completed work and the reasoning behind it is in
[`CHANGELOG.md`](CHANGELOG.md); how the system is put together is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Why this order is right is in [`BUSINESS.md`](BUSINESS.md)** — what is sold,
for how much, what it costs to run and how we know it works. That file outranks
this one when the two disagree: the goal is revenue, not a finished list.

**Read the MVP section first.** As of 2026-08-30 this project has a stated
commercial goal, and that goal — not the size of a finding — decides what is
worked on. Most of the numbered findings further down are deliberately **not**
in the MVP. Three of them were, and are now done.

**`## P0` was the exception to the MVP order, and it is now closed.** Fourteen
defects in #56/#57/#58 — work finished the same day — three of them wrong in
the browser. All fourteen are done: #75, #76, #77 in CHANGELOG §17 and the
other eleven in §19. **#59 is next.**

Numbering is continuous and stable so commits and comments can cite it. It does
not imply order or priority.

---

# The MVP

## What this is for

A multilingual CMS that feeds client websites, owned outright rather than
assembled from someone else's platform. The business it serves is a web agency:
**one installation per client site**, sites built by one developer, content
written by the client.

**First market: tourist accommodation** — apartments, small hotels, Airbnb
villas. Chosen because this CMS is multilingual at the level of its data model,
and that market cannot function in one language. Multilingual is the one thing
it already does better than a cheap WordPress build, and it is precisely that
market's pain. Retail was the alternative and was rejected: a retail
presentation site asks for a shopping cart within months, which is the one
thing being deferred.

**Budget to build it: about €6/month** — a small EU VPS with staging as a
subdomain on it, and a domain — plus €20–60 once per bought theme, which is
charged on to the client. Nothing else is paid for until there is revenue.

That is the cost of *building*. The cost of *operating a business* is roughly
sixty times larger and is in [`BUSINESS.md`](BUSINESS.md) §4, along with the
prices and the break-even. Do not use the €6 figure to reason about
profitability.

## Definition of done — binding

> The MVP is finished when a public site runs on a real server in two
> languages, filled by somebody through the admin without touching code, and
> pressing **Publish** changes the page a visitor sees.

- [x] #47, #48, #54 fixed — and nothing else from the findings list
      *(done — CHANGELOG §13; a login defect found on the way was fixed with them)*
- [x] #55 rich-text renderer, Tiptap document → HTML *(done — CHANGELOG §15)*
- [x] #56 publication state, with a Publish action *(done — CHANGELOG §16)*
- [x] #57 manual ordering *(done — CHANGELOG §16)*
- [x] #58 per-language entry slugs *(done — CHANGELOG §16)*
- [x] **#75–#88 the review of #56/#57/#58** *(done — CHANGELOG §17 and §19)*
- [x] #59 public Blade routes, page cache cleared on publish, sitemap + hreflang *(done — CHANGELOG §21)*
- [x] #60 `singleton` modules *(done — CHANGELOG §23)*
- [x] #61 core/site boundary drawn *(done — CHANGELOG §24)*
- [x] #68 gallery field — several images on one entry *(done — CHANGELOG §14)*
- [x] #66 enquiries *(done — CHANGELOG §25)*
- [ ] #67 site settings
- [ ] #65 booking hand-off form
- [ ] #62 the demo site: live, two languages, bought theme

**Nothing outside this list goes in, however reasonable it looks at the moment
it occurs to you.** There is no client waiting, so nothing external will say
when this is finished — which is exactly why the boundary is written down
before the work starts rather than after.

Roughly two and a half to three and a half weeks of focused work.

### Amendments

The list is binding, which means it changes by a deliberate act that is written
down, not by drift. Every amendment is recorded here with its reason.

**2026-08-31 — added #68, #66, #67 (+2 days).**

- **#68 gallery field** — a blocker found while scoping the accommodation
  modules. `image` holds one URL and there is no repeatable field of any kind,
  so a room cannot carry more than one photograph. For this market that is not
  an inconvenience: the photographs *are* the product, and the "rooms" module
  builds fine in the existing builder and comes out unusable. The demo cannot
  be credible without it.
- **#66 enquiries** — the public side can currently receive nothing at all, so
  the demo is a brochure. It is also the first inbound path from an anonymous
  visitor in the whole application, and that is worth designing once rather
  than adding in a hurry for a client.
- **#67 site settings** — without it the phone number lives in a template, so
  the client cannot change their own phone number without calling. That
  contradicts the single promise the product makes.

Rejected for the MVP at the same time, with reasons, as #69, #70 and #71.

**2026-09-05 — added #96, #97, #98 (+5 days).** Three things the owner raised
at a stop before #67, all of which #62 would otherwise build on top of and have
to be redone.

- **#96 translated interfaces** — every message in PHP and JavaScript is
  hardcoded English, and `App::setLocale()` is called nowhere in the
  application. A Greek hotel owner opens a panel in English, and the theme's
  labels are written `Όνομα / Name *`, which is not bilingual but a hack that
  breaks on the third language. A multilingual CMS whose own interface is
  monolingual does not demonstrate the one thing it is better at.
- **#97 static HTML pages** — measured, a cache *hit* costs four queries and
  the home page nine (see Decisions, below). The requirement was always
  "finished HTML without a query"; this delivers it literally, by serving a
  file before PHP starts.
- **#98 one source for a number** — an audit found the enquiry field widths
  written in three unconnected places, two of them exactly at the column
  limit. That is #76 waiting to happen again, and SQLite cannot see it.

#96 goes first: #97 bakes HTML, and it should bake translated HTML.

## Phases

### Phase 0 — blocks everything (half a day) — **done**

**#47, #48, #54**, written up in CHANGELOG §13 and removed from the lists
below. Writing the tests first turned up a fourth defect that is fixed with
them: a correct password answered **500** from any origin Sanctum does not
treat as stateful, while a wrong one answered 401 — a difference readable
straight off the status code. Rate limiting the login while leaving that
behind would have shipped the change half-done.

88 → 106 tests. A review of this work found eleven defects in it, all fixed.

### Phase 1 — content reaches the public (6–8 days)

**Done: #68, #55, #56, #57, #58, the #75–#88 review of them, #59, #60, #61,
#66 and #67.** Remaining: **#96** (built, its review open) plus **#97** and
**#98**, and Phase 1 is closed. The first three were added on 2026-09-05 (see Amendments) and cost
about five days; they come before #67 and #62 because both would be built on
top of them.

**#75–#88 came before #59 and there was no judgement call in it.** #59 is the
public read path, and it is built on exactly the four things the review found
broken: it resolves a URL through `Entry::forSlug`, filters through
`published()`, orders by `sort_order`, and renders slugs the panel writes.
Building on them first meant not finding the same defects again through a
Blade template, which is the most expensive place to find them.

That was the right call twice over. #87 and #85 are both in the read path #59
is about to write — a `published()` that would have gone ambiguous, and a
`slugFor` that was one query per link — and #59 would have inherited them as
its own bugs.

#68 went first because it changed the field-type system, and anything built
before it would have had to be revisited. #56, #57 and #58 were one piece of
work as expected — three indexed columns and a table. #59 then had everything
it needed: the renderer turns a document into HTML, `published()` says what a
page may show, and `Entry::forSlug()` resolves a URL — and it used all three
**without changing any of them**, which is the clearest evidence the P0 block
was worth closing first.

### Phase 2 — the demo site, as client #0 (3–5 days)

**#62, #65.** Built exactly the way a paying client would be built — same
directory layout, same way of binding a module to a template, same deployment —
so that client #1 is a copy with a different theme and different content rather
than a fresh start. The demo is simultaneously the sales sample and the first
template in the library.

Waits for #96 and #97. The theme's labels are translated per language rather
than written `Ελληνικά / English` in one string, and its forms use the shared
submitter so the page stays a static file. Building the theme before either one
means building it twice.

Note that **rooms, facilities and the home-page slider need no engineering at
all**: they are modules built in the existing builder, and the slider gets its
ordering free from #57 (one entry per slide). That is the schema-driven design
working as intended — and the reason #68 came first is that without it the
most important of those modules could not hold its content.

### Phase 3 — the accommodation back office

**#63 bookings, #64 invoicing, then #72 support, #73 spreadsheet import, #74
Beds24.** These belong to the accommodation product and are what will justify
charging more than a brochure site.

The order inside the phase matters: #73 and #74 solve the same problem — getting
bookings in — for different clients. #73 is far cheaper and serves owners who
have no channel manager, so it comes first. #74 is the largest single
integration on this list and is deliberately last.

**Sequenced after the demo on purpose.** A prospect browsing the demo never
sees them, they are the largest single piece of work on this list, and they are
the part most likely to grow while being built. Doing them before a paying
client exists spends the scarcest resource — time before revenue — on work that
is invisible to the sale. This is a sequencing judgement, not a scope cut: if
it is wrong, move them and nothing else changes.

### After the first paying client

**#69 redirects** and **#70 cookie consent** land with the first client that
replaces an existing site — which will be most of them. Then **#71 relations
between entries**, the next real gap in the type system after #68.

After those, in this order and not before: **menu editing**, **media library**,
**module definitions as files** (pays off at installation #2), **user groups**,
**core extracted as a Composer package**.

## Decisions taken (2026-08-30)

Reached in discussion and recorded because re-deciding them is pure cost.

**Blade, not React/Next, for public pages.** The public site is server-rendered
from this same Laravel application. Publish invalidates a page cache and the
visitor gets finished HTML — there is nothing lighter. This removes the entire
public read API from scope: no controller, no per-language resources, no CORS,
no API caching. It also matches the plan to buy HTML themes, which drop into
Blade almost as-is and would need reworking for React. The admin stays a React
SPA; the two coexist without friction.

**Single tenant.** One installation per client site, several users, one shared
content space. The half-finished multi-tenancy is resolved by *removing* it,
not by completing it. There is no `Site` entity and no registration.

> **Consequence — globally unique module slugs are correct.** The warning in
> `ARCHITECTURE.md` that anyone adding a second account should first make slugs
> unique per owner is **wrong under this model** and must not be followed: a
> second account shares the content space, it does not partition it. Acting on
> that warning would allow two `products` modules on one site.

**Ownership is not the authorization axis.** Modules are created only by the
master admin, so `Module.user_id` cannot distinguish anybody. The real question
is group × module. For the MVP that collapses to: every signed-in user reaches
every module and may do anything to the entries inside it (#54), with a master
flag covering everything else. Groups can arrive later without a rewrite,
because every authorization question already passes through one 30-line policy.

**Structural fields leave the JSON.** `status`, `published_at`, `sort_order`
and the per-language slug become real indexed columns and rows. They are
identical for every module and they are what routing, filtering and ordering
actually run on. Content fields stay in `data`. This answers the indexing half
of the storage complaint without touching the storage model.

**A "Module" is a menu entry with a screen behind it, not a data schema.** What
sits behind one varies: a schema-driven content store (what exists today), a
hand-written domain (bookings, invoices), or an external integration with no
local storage at all (a statistics panel). Bookings and invoices are therefore
**written by hand as real tables with real rules** — they are not generated
from a JSON schema, and bending the schema builder to express them is how this
design would break.

**Core and site are separated by a line, not yet by tooling.** Core code and
per-client code — theme, custom modules, site routes — live in separate
directories from now on. Extraction into a private Composer package happens at
client #2, when it starts paying for itself. Drawing the line now is what makes
that extraction mechanical rather than a merge nightmare, and a per-client fork
of the whole repo is explicitly rejected: that is how agencies built on old
platforms ended up maintaining ten diverging copies.

**Versioning is git, never zips.** Tags for releases, a beta branch for the
test site, a pinned version per client install.

**Online booking is a hand-off, not an engine.** The public page collects dates
and guest count and links out to the channel manager, which owns availability
and payment from the first click onward. This is the market norm for small
accommodation and costs one form (#65).

**`/` serves the client site's home page.** This closes the open question of
whether `/` should exist: with Blade public pages it is the site itself.
`welcome.blade.php` — the stock Laravel placeholder with the inlined stylesheet
— goes away as part of #59.

## Decisions taken (2026-09-05)

Reached in a discussion about whether to adopt a ready-made data grid, which
turned into the more useful question underneath it: what kinds of list this
application has, and which of them the JSON schema was ever meant to serve.

**Two kinds of module, and no third.** A *content module* is what exists today:
defined through the panel, fields in a JSON schema, rows in the shared
`entries` table. A *domain module* is hand-written tables, models and screens.
There is no middle tier.

> A middle tier was proposed and rejected the same day: JSON plus MySQL
> **generated columns**, which give an indexed column derived from a JSON path
> and measure identically to a real one (see #90's numbers). It was dropped
> because adding one **needs a hand-written migration anyway**, so it is not
> something the Module builder can offer — which puts it on the hand-written
> side of the line already. A tier that cannot be reached from the panel is not
> a tier.

**The rule that decides which.** Written down so the choice is not made by feel
at the moment somebody is tired:

> A **domain module** if it needs *any* of: search, sorting by column, bulk
> actions, relations to other tables, or more than a few hundred rows.
> Otherwise a **content module**.

Accommodation crosses none of those. Rooms, pages, facilities and slider slides
are content modules and always will be. A product catalogue crosses the line on
day one.

**Products are a domain module, and so is everything they hang off.**
Categories, attributes, attribute values, variants, filters — all hand-written
tables. This is not a concession: those are **relational by nature**,
many-to-many with their own indexes and foreign keys, and expressing them in a
JSON field schema is exactly where CMSs of this shape fall apart. What is
gained is referential integrity the JSON never had.

**Hand-written does not mean per client.** This is the distinction the whole
model rests on. A domain module is written **once, in core**, and shipped to
every installation that switches it on — the same way bookings and invoices
already were decided. If each eshop client needed their own twenty tables, "one
site a day from the fifth onward" in `BUSINESS.md` would be dead.

| | Who defines it | How often |
|---|---|---|
| Content module | whoever builds the site, from the panel | every site, differently |
| Domain module | us, in core, in code | **once**, identical everywhere |

> **Consequence — this makes #61 more important than it looked.** The core/site
> boundary is what lets a domain module be written once and reused. It was a
> tidiness item; it is now load-bearing.

> **Consequence — "pick a module type" is probably not a dropdown.** If domain
> modules are code, nobody creates one from a form. The panel offers *New
> content module*, plus a list of the domain modules available to switch on for
> this site.

**No runtime DDL. Ever.** The application must never issue `CREATE TABLE` when
somebody clicks a button. Four reasons, and the third is the one that ends the
argument:

1. the application's database user would need DDL rights in production, so any
   SQL injection stops being a read and becomes a rewrite;
2. DDL does not roll back — failing on the fourteenth of twenty tables leaves
   half a schema and no way back;
3. **ten client installations would become ten different schemas.** No
   migration could ever be written again, because no migration could know what
   it was going to find. The first time a column has to be added for everybody,
   it cannot be;
4. a schema nobody knows in advance cannot be tested.

Reason 3 kills the maintenance model, and maintenance *is* the product: the
revenue is the €25/month, not the build.

**A generator is fine — later, and not yet.** The acceptable form of "automatic"
is a command that writes migration, models, controller and screen as **files
you read and commit**, which then run as ordinary migrations. The schema stays
in version control and is identical everywhere.

But it should not be built yet. Domain modules are written once each, so it
would be run perhaps four or five times ever — bookings, invoices, catalogue,
possibly enquiries. A generator written **before** two of them exist automates
what was imagined rather than what hurt. **Write bookings (#63) and invoicing
(#64) by hand first, then decide.**

**Two listings, not one.** `EntriesTable` stays as it is: manual order, no
column sorting, no search. Large record lists — bookings, invoices, a catalogue
— get their own component. Do not grow one into the other; that ends as a
component with thirty props that serves neither.

| | Content list | Record list |
|---|---|---|
| Columns | from the JSON schema, unknown | fixed, known to the code |
| Cells | per-language maps, Tiptap docs, galleries | dates, amounts, names |
| Order | **manual — it is the product** | chronological, sortable |
| Size | dozens | thousands, and it only grows |
| Needs | none of the below | search, sort, bulk actions |

**TanStack Table for the record list, server-driven.** Headless — it supplies
sorting, filtering, pagination and row-selection *state*, and no markup at all,
so the Tailwind styling and the cell renderers stay ours. MIT, about 15 KB.

Rejected: **AG Grid** and **MUI X DataGrid**. Both put the parts we would
actually want behind a per-developer annual licence, against a product whose
whole claim is that it is owned outright and whose revenue is €25 a month per
client. Both also ship far more UI than this needs, into a bundle already at
651 KB.

Sorting, filtering and pagination are **server-side**. A hotel produces
hundreds to a couple of thousand bookings a year and never deletes any, so the
browser is not where they get sorted. The endpoint takes `sort`, `direction`,
`q` and `page`, with an **allow-list of sortable columns** — the alternative is
SQL injection through a query string — and an index behind each of them.

**One endpoint per bulk action, never a generic dispatcher.** Not this:

```
POST /bulk { action: "delete", ids: [...] }
```

That is an RPC with a `switch`, and it authorizes every action at one point, so
"who may cancel" and "who may issue an invoice" collapse into the same check.
Instead:

```
POST /bookings/cancel   { ids: [...] }
POST /bookings/invoice  { ids: [...] }
```

Each carries its own authorization, its own rules and its own tests. A new bulk
button is a new endpoint and touches none of the existing ones — which is what
makes the buttons genuinely pluggable, since the panel side is only a config
array rendered above the table.

> This is the lesson of **#75** applied before it is paid for a second time: an
> endpoint that accepted whatever ids it was sent and trusted them.

## Decisions taken (2026-09-05, second)

**`required` on a translatable field means the default language.** Not every
active one. Found when a human clicked Save on the demo content and could not,
because French was active and untranslated (CHANGELOG §22).

The stricter reading is defensible for a product that promises full
translation. What is not defensible is the consequence: **adding a language
retroactively breaks editing** of everything already written. An author cannot
correct a Greek typo without first inventing a French translation.

The map itself stays required, so an entry with no translations at all is still
refused, and `Language::default()` is the single answer to which language is
meant.

> **The better answer is deferred, not rejected.** Demand every language **at
> publish**, and let a draft be half-translated — `status` exists for exactly
> that shape of rule. It needs `SchemaRuleBuilder` to know the entry's status,
> which changes its signature and every caller, and it is not on the MVP list.
> Filed as #95.

## Decisions taken (2026-09-05, third)

A stop called by the owner after #66, on four things in the code rather than in
the plan. Three became work items; the fourth was a question answered.

### The public site becomes files on disk, not rows in a cache table

The claim in ARCHITECTURE was that a cache hit "touches the database not at
all". It was measured and it is **false in production**. A real request through
the HTTP kernel against the real `.env`:

| Page | Queries |
|---|---|
| a module page, cache **hit** | **4** — `sessions` read, `cache` read ×2, `sessions` write |
| the home page (uncached, it carries a form) | **9** — plus `languages` ×4 and `modules` |

The test that says otherwise runs under `CACHE_STORE=array` and
`SESSION_DRIVER=array` from `phpunit.xml`. **The suite was measuring an
environment that exists nowhere.** Same shape as #76 (SQLite does not enforce
what MySQL does) and as the CSRF defect in §25 (the suite renders fresh, the
deployment serves cached) — the third time a green assertion has described a
world the app does not run in.

**Decided: the rendered page is written to a file under `public/`, and the web
server serves it before PHP starts.** Not a faster cache — no PHP at all. The
requirement in #59 was always "finished HTML without a query", and this is that
sentence taken literally.

Two consequences that are gains rather than costs:

- **Invalidation gets more precise, not less.** The version counter exists
  because "without touching the database there is nothing to say which module a
  path belongs to" — true when a *visitor* asks, irrelevant when an *author*
  saves. At save time the entry and its slugs are in hand, so the pages to
  rewrite are computable, the renamed slug included: the old address comes from
  `getOriginal()` before the write. That is the one case the counter could not
  handle, and with files it is three lines. `PageCache` is replaced, not
  extended.
- **The site survives its own database.** A hotel whose MySQL falls over in
  August still serves every page.

### Forms become one JS island, and the public site sets no cookie

A static file cannot carry a CSRF token, so the rule from §25 — a page with a
form is not cached — would mean the home page is never static, which is the
page that matters most.

**Decided: the form markup stays server-rendered; only the submit is
JavaScript.** On first interaction it calls `/sanctum/csrf-cookie`, which
already exists and is the same ordering `api.js` uses to sign in, then posts
with the `X-XSRF-TOKEN` header and renders the answer from JSON.

**One mechanism, not one per form.** The owner's reason for choosing this is
that a client's home page will carry several — an enquiry, a newsletter box, a
search — so the thing being built is a small shared submitter that any theme
form opts into, not a script belonging to the enquiry.

The cost is that the forms need JavaScript, where today they do not. Accepted
for this market. The gain beyond caching: **no session and no cookie on the
public site at all**, which makes #70 (cookie consent) smaller than it was.

### The panel's language is a different axis from the site's

`languages` rows are the languages the *content* is translated into. The
language a person reads the *interface* in is not the same question — a German
owner may well run a Greek and English site — and using one table for both
would tie them together permanently.

**Decided: content languages are rows; interface locales are files.** Adding
German to the panel means adding `lang/de.json`, with no migration and no
rebuild — which requires that the server sends only the active locale's strings
to the page rather than the bundle carrying every locale.

The theme's own labels are the **client's**, not core's, so they live in
`site/lang/{code}.json` beside the theme (#61). Core ships `lang/`; a client
ships their own.

JSON translations rather than keyed PHP arrays, so an untranslated string falls
back to readable English instead of `panel.enquiries.confirm`. That is what
makes translating incrementally possible.

### Tests build their own languages on purpose

Asked why `EnquiryTest::setUp` creates Greek and English when the database
already has them: because it does not. Tests run on **SQLite in memory**, and
`RefreshDatabase` migrates without seeding, so every test starts on an empty
schema. A test that read the languages from the development machine would pass
or fail according to what somebody last typed into the panel.

What is wrong is only that **eight test files write the same two rows by
hand**. That is a shared helper, not a seeder — folded into #98.

## Deferred deliberately

Not dropped. Decided against *for now*, with the reason, so they cannot creep
back in unnoticed.

- **Table per module.** The JSON `data` column stays. A content site with a few
  hundred entries does not need it, and it is the single largest piece of work
  available. See **To discuss**.
- **Field rename and delete** — see *What does editing a Module mean for its
  Entries?* under **To discuss**. The master admin is the only
  person who edits a schema, and with one site that is a hand-written migration.
- **Media library.** Reuse of one image across entries. Distinct from #68,
  which is several images *on one entry* and is in the MVP because a room
  without photographs is not a room. Uploading per field still works, so
  client #1 survives without reuse — but note that #68 makes #51 worse, since
  removing an image from a gallery orphans a file exactly as deleting an entry
  does.
- **Menu editing.** One site's menu is ten minutes of hand-written Blade.
- **Module grouping in the admin.** No problem to solve at six modules.
- **User groups.** The MVP has one or two users.
- **Install automation (`cms:install`).** Pays off at installation #2.
- **Commerce.** See **To discuss**.

---

# Product work items

Listed by number, which is stable and does **not** imply sequence — the
**Phases** section above gives the order. Anything outside the MVP carries a
phase tag.

### 55. Rich-text renderer: Tiptap document → HTML, in PHP

Entries store a Tiptap JSON document. Nothing in the codebase turns one into
HTML — `docToText()` produces a plain-text excerpt for the admin table and
that is all. Without this, no rich text can appear on a public page at all.

It is the natural counterpart to
[`RichTextDocument`](../app/Services/RichTextDocument.php): normalize on write,
render on read, **from the same closed vocabulary**. Because the vocabulary is
closed, the renderer is total and safe by construction — there is no unknown
node that could reach the output, so nothing needs escaping after the fact.
Mirror `NODES`, `MARKS` and the attribute rules; anything the normalizer would
have dropped cannot be present.

Around 150 lines. Also the more flexible of the two possible investments: with
a PHP renderer, finished HTML can later be served through an API too, whereas
rendering in JavaScript would have closed off Blade entirely.

### 56. Publication state on entries

Every entry is public the moment it is saved. There is no draft, no publication
date, no Publish action — so a half-written text is live, which is the first
call an unhappy client makes.

Add `status` and `published_at` columns to `entries`, real and indexed. The
admin gets a Publish action; the public side reads published rows only.

Decided as MVP rather than phase two, because the client seeing their own edits
appear on the site is the core of the promise, and that only works safely if
they choose when.

### 57. Manual ordering

Only `created_at` ordering exists. "These four rooms, in this order, on the
home page" cannot be expressed at all.

A `sort_order` column on `entries`, indexed, with reordering in the admin list.
Deliberately a real column, not a schema field: it applies to every module and
it is sorted on. The seeder already invents a `sort_order` field, which is the
same need noticed and never built.

### 58. Per-language entry slugs

URLs are `/el/blog/kati-kati`, with a **different slug per language** — decided
so, because languages are a paid feature and each one needs its own URLs. That
means every public request resolves an entry **by a translated value**, so it
must be indexed — inside `data` it would be an unindexed scan on every page
view of every page.

```
entry_slugs: entry_id, language_code, slug
             unique (language_code, slug)
```

This is the storage complaint's valid core in miniature: the rule is not
"everything in tables", it is **"whatever you search by goes in a table"**.

### 59. Public rendering in Blade, with a cache cleared on publish — DONE

Public routes and templates in the per-client layer, reading entries through
Eloquent — there is no API in between (see Decisions). Pages are cached; the
Publish action of #56 invalidates what it affects, so a visitor is served
finished HTML without a query.

Also removes `welcome.blade.php`, whose inlined stylesheet costs ~36k tokens to
read and which `/` no longer needs.

**Includes `sitemap.xml` and `hreflang`**, both generated from the entries
rather than maintained by hand. They are folded in here rather than given their
own item because they are part of publishing a page at all. Without `hreflang`,
Google does not understand that the Greek and English pages are the same
content in two languages — which wastes the multilingual advantage that is the
entire sales argument for this market.

**Done, 2026-09-05** (CHANGELOG §21). Routes, templates, `sitemap.xml` and
hreflang, with the page cache invalidated on publish. Two decisions worth
knowing before touching it:

- **The cache lookup comes before the database.** The first version resolved
  the entry and *then* cached the render, which passed every "is it cached"
  test and still cost three queries a hit. #59 says *without a query*, so the
  key is the path alone and a test counts queries on a warm page.
- **Invalidation is by version, and site-wide.** `CACHE_STORE=database` has no
  tag support, and a path on its own cannot say which module it belongs to
  without a query — so any write drops every page. Right for a few dozen pages
  edited a few times a month; a catalogue would want finer, and a catalogue is
  a domain module.

`welcome.blade.php` and the stock `ExampleTest` went with it.

### 60. `singleton` modules — DONE

"About" is one entry; "Blog" is many. Today both are collections, so a client
opening About finds a list and a "new entry" button that must never be pressed.

A `singleton` flag on the module: the admin opens straight into the single
entry, with no list and no create button. Small, and much cheaper before five
sites exist than after.

**Done, 2026-09-05** (CHANGELOG §23). `modules.is_singleton`, enforced in three
places rather than one:

- `StoreEntryRequest` refuses a second entry — hiding the button would have
  been the whole feature, and would have held until somebody used the API.
  #75's lesson applied before it was paid for a second time;
- the panel opens straight into the one entry, or a blank form for the first;
- publicly, `/{lang}/{module}` **is** the page and `/{lang}/{module}/{slug}`
  301s to it, but **only for a slug that resolves** — an address matching
  nothing is still a 404. The sitemap lists the Module's address and not the
  entry's.

> Note while checking this: turning an existing Module into a singleton is a
> **hand-written database edit**. There is no module update endpoint, so the
> panel can only set the flag at creation. That is worth knowing before the
> first client asks to convert a page.

`PageCache` now stores what a page *is* rather than only its markup, so the
redirect costs no queries on a hit.

### 61. Draw the core/site boundary — DONE

> **Raised in importance, 2026-09-05.** Domain modules — bookings, invoicing, a
> product catalogue — are written **once in core** and shipped to every
> installation that enables them (see Decisions, 2026-09-05). This boundary is
> what makes that possible, so it stopped being tidiness and became the thing
> the second product line rests on.

Core code and per-client code go into separate directories now — theme,
per-client modules and site routes on one side, everything shipped on the other.

No packaging, no Composer work, no tooling: only the line. The line is what
makes the eventual extraction (client #2) mechanical, and it costs almost
nothing today.

**Done, 2026-09-05** (CHANGELOG §24). `site/` holds `theme/`, `routes.php` and
a README saying what belongs there. The theme is a **view namespace**
(`theme::layout`), not another path in the finder, so a client's template
cannot shadow a core one and the directory can be swapped whole.

The rule that took a failing test to state properly: **core knows where the
door is, not what is behind it.** Exactly two mount points may name the
directory — `AppServiceProvider` and `routes/web.php` — and everywhere else
core refers to the theme only through `theme::`, which is a contract rather
than a path.

`CoreSiteBoundaryTest` holds both halves, and the second is the one worth
having: **every `theme::` template core renders must exist**, with the list
read out of core itself. That is the set a theme author for client #2 owes,
instead of finding out when an unopened page 500s in front of a visitor.

The public controllers moved to `app/Http/Controllers/Web` — they are core
machinery, and a core namespace called `Site` contradicts what `site/` means.

### 62. The demo site — client #0

A complete accommodation site: an invented but believable business with a name,
a location and a character. **Never lorem ipsum** — a prospect has to see
themselves in it.

- Modules: Σχετικά (singleton), Δωμάτια/Καταλύματα, Gallery, Blog, Επικοινωνία
  (singleton)
- **Both languages filled completely.** Half-finished English demonstrates the
  exact opposite of what is being sold.
- Bought theme (€20–60), converted to Blade partials; menu hand-written
- Live on a domain, with staging on a subdomain of the same VPS
- Photography from Unsplash/Pexels, free for commercial use

Built as a paying client would be, so it doubles as the first template.

### 63. Bookings module *(Phase 3)*

> **Write it by hand.** It is the first domain module, and the generator
> question is deliberately deferred until #64 has been written by hand too —
> two of them are what shows which parts actually repeat (Decisions,
> 2026-09-05). Its listing is the first **record list**: server-side sort,
> filter and pagination with an allow-list of sortable columns, TanStack Table
> in the panel, and one endpoint per bulk action.

A **register**, not an availability engine: real bookings arrive through the
channel manager, and the owner records them here so they can be invoiced and
counted.

Hand-written domain with real columns — guest, contact, property, arrival,
departure, guest count, price, deposit, source (direct / Booking.com / Airbnb),
status, notes. Dates and money are columns, never JSON: they are compared,
summed and sorted.

Explicitly **not** produced by the schema builder (see Decisions).

Open when this is started: does it need overlap detection across bookings for
the same property, or is a register that trusts the owner enough for the first
version?

### 64. Invoicing, issued from a booking *(Phase 3)*

Turn a booking into a document: line items, VAT, totals, numbering. Amounts in
decimal columns, never floats and never JSON. An issued document's lines must
be **immutable** — it records the price at the time it was issued, not today's.

**The decision this task opens: myDATA.** In Greece the electronic transmission
of documents to AADE is a legal obligation, not a feature. Before building,
settle whether this module issues real documents (transmission required, and it
is a substantial integration on its own) or produces an internal document while
the client's accountant handles the filing. The two are very different pieces
of work, and the answer changes what "done" means here.

### 65. Booking hand-off form

On the public page: dates and number of guests, then a link out to the channel
manager with those values as parameters. Availability, pricing and payment are
the channel manager's from the first click — this side owns nothing.

One form and a URL template per client. It is in the MVP because it is what
makes the demo credible to an accommodation owner, and because it costs almost
nothing.

### 66. Enquiries — and the first inbound path in the application — DONE

A contact / availability-request form whose submissions are **stored in the
admin**, not merely emailed. Email is lost in spam folders, and an accommodation
owner who loses an enquiry loses a booking and blames the website.

This is more than a form. Every write endpoint today sits behind
`auth:sanctum`, so **the public side of this application can currently receive
nothing at all**. This is the first route an anonymous visitor may POST to, and
it brings validation, rate limiting, spam handling and GDPR with it — worth
designing once, deliberately, rather than adding in a hurry when a client asks.

- Stored: name, email, phone, message, arrival/departure, guests, the language
  and the page it came from
- A **honeypot**, not a captcha. At this volume a captcha costs conversions and
  buys nothing.
- Rate limited — already covered by the `api` limiter (CHANGELOG §13), though
  an unauthenticated public write may want a tighter one of its own
- Email notification to the owner
- Admin list is **read and delete only, never edit**: an enquiry is a record of
  what somebody sent, not a document to revise
- GDPR: a consent checkbox and a stated retention period

Feeds #63 — an enquiry becomes a booking in one action.

**Done, 2026-09-05** (CHANGELOG §25). A hand-written table by the Decisions
rule, its own `throttle:enquiries` limiter at five an hour per address, a
honeypot checked in the controller so a filled trap answers as success, consent
stored as a timestamp, and read-and-delete-only in the panel with a
confirmation.

Two decisions were yours: **24 months** retention, enforced by
`enquiries:prune` daily, and **permanent deletion** rather than a recoverable
bin.

> **The defect worth remembering.** Posting the live form answered **419** with
> the suite green: the public pages are cached whole (#59) and a CSRF token
> belongs to one session, so every visitor after the first got somebody else's
> and every submission was refused — a form that silently never works.
> `PageController` now swaps the token for a placeholder on the way into the
> cache and back on the way out. Anything else cached that carries session
> state will have the same problem.

The notification address is `config/site.php` → `enquiries_to` for now; **#67
moves it into the database**, where the owner can change it without an editor.

### 67. Site settings — DONE (CHANGELOG §26)

Phone, email, address, map coordinates, social links, logo, opening hours and
the booking URL #65 links out to — plus the two values core reads about itself,
`enquiries_to` and `panel_locale`.

Without it these values live inside templates, which means **the client cannot
change their own phone number without calling you.** That contradicts the one
promise the product makes, and it is the kind of call that arrives on a Sunday.
BUSINESS.md puts the ceiling of the whole business at support minutes per
client, which is the real argument for it.

**Built as a table, not the singleton (#60) this item first described**, and
the reason is in the sentence above: core cannot read the notification address
out of a row the client owns, names and could delete. An enquiry can arrive on
the first day of an installation, before any module exists. The part worth
reusing was reused instead — the fields are declared in a Module schema's shape
and go through `SchemaRuleBuilder`, translatable rules and all. ARCHITECTURE
§5c describes it.

**#97's cache switch has a home now**: it is a `core` field like the other two.

### 96. Translated interfaces, panel and public — *built, review open*

Every user-facing string in the application is hardcoded English and
`App::setLocale()` is called nowhere. Three audiences, and they are not the
same problem:

- **The panel.** ~13 sentences in `app/` (validation messages, the singleton
  refusal, `StoreEnquiryRequest::messages()`) and ~39 in the React components
  and `apiErrors.js`. The client's staff read this, and in the first market
  they read Greek. `php artisan lang:publish` brings the framework's own
  messages; ours become `__()` keys against `lang/{locale}.json`.
- **The public theme.** Written `Όνομα / Name *` today — two languages jammed
  into one label, which fails the moment a third is active. Strings move to
  `site/lang/{code}.json` and `PageController` calls `App::setLocale()` from
  the URL's language. The cache key already carries the language, so cached
  pages stay correct.
- **Email.** The owner's notification follows the owner's locale.

The React side gets its strings the way it already gets field types and
statuses — from JSON the server produces — but **injected per request rather
than bundled**, so adding a locale needs no `npm run build`. A user's choice
lives in `users.locale`, defaulting from #67.

A test asserts every locale file carries the same keys as the reference, which
is what catches a half-translated release before a client does.

**Done so far — the public side.** `SetLocale` on the public routes, the third
mount point in `config/site.php`, `lang/` and `site/lang/`, the theme's labels
and the enquiry form's refusals. Verified live in `el`, `en` and an untranslated
`fr`, which correctly falls back to English. ARCHITECTURE §5a describes it.

**The panel is done too** (ARCHITECTURE §5a → *The panel is the other axis*).
`InterfaceLocales`, `users.locale`, `PUT /api/user/locale`, a picker in the
header, `SetPanelLocale` on the API group, and 135 strings — every message in
`app/` and every literal in the nine components — in `lang/en.json` and
`lang/el.json`. Verified live with a real session: `/admin` served
`<html lang="el">` with the Greek catalogue inline, and `POST /api/modules`
was refused in Greek for a Greek reader and in English for an English one.

**What is left is the review: #99–#110.** Ten of those twelve are
defects in what has just been built rather than debt beside it — a visitor
refused half in English (#99), a mount test that passes without the mount
(#101), a parity test that skips the locales a client adds (#102), and a
catalogue nothing compares with the code (#103). **The item is not closable
with those open**, and the CHANGELOG entry waits for the whole of it: half a
decision is not a decision.

### 97. Static HTML pages, served before PHP starts

Replaces `PageCache`. See Decisions (2026-09-05, third) for the measurement
that prompted it and for the two design choices it rests on.

- **Where.** `public/cache/{lang}/…​.html`, with the path built **only from
  resolved database rows** — language code, module slug, entry slug — and never
  from the request path. Writing files inside `public/` from something a
  visitor controls is how a crafted URL writes a file somewhere it should not.
- **The switch.** The web server serves whatever file exists; the setting
  controls only whether files are *written*. Off means flush and stop writing,
  so an empty directory sends everything to PHP — and the fast path reads no
  config and runs no query. `PAGE_CACHE` in `.env` for development, a button in
  #67 for the client.
- **Filling it.** Lazily by the first visitor, or all at once with
  `pages:warm` and a button. `pages:flush` empties it.
- **Emptying one page.** On save, the entry's own URLs in every language it has
  a slug in, plus the module index, the home page and the sitemap. The old URLs
  come from `getOriginal()` before the write.
- **A form on a page** no longer stops it being cached, because of #97's other
  half: one shared client-side submitter, CSRF fetched on first interaction,
  the answer rendered from JSON.

**The deployment dependency has to fail loudly.** `.htaccess` covers Apache;
nginx needs `try_files` in the server block, which `.htaccess` cannot reach. A
missing rewrite does not break the site — it silently serves every page through
PHP, which looks like nothing at all. `pages:doctor` asks for a page known to
be cached and reports whether the answer came from PHP.

### 98. One source for a number

An audit of `app/` for magic numbers found one real hazard and several
irritations. The hazard: the enquiry field widths are written in the migration,
the FormRequest and the Blade template, unconnected, and `phone` (40) and
`source_url` (512) sit **exactly at the column limit**. Relaxing the validation
without a migration is a MySQL 1406 and a 500 — which is #76, and the SQLite
the suite runs on cannot see it.

The widths become constants on the model that the migration, the request and
the template all read, plus a test that reads the **actual** column definition
— because editing a constant does not alter a column that already exists.

The rest: `paginate(15)` and `paginate(20)` are two different page sizes for no
stated reason; `max:2048` in `UploadController` is anonymous; `max:255` appears
three times while `ModuleController::SLUG_MAX_LENGTH` exists. Findings are
recorded per file in ARCHITECTURE, so a later pass knows what has been looked
at.

**Two are done already**, both because #96 walked into them. `users.locale` now
takes its width from `User::LOCALE_MAX_LENGTH`, which the migration, the
validation rule and a test all read — the same split as #76, caught before it
shipped. And `EnquiriesManager.jsx` reads the retention period from the
generated `fieldTypes.json` rather than writing `24` beside a template that
reads the constant.

Folded in: **eight test files create the same two `Language` rows by hand.** A
shared helper. Not a seeder — see Decisions for why tests build their own
world.

### 69. Redirects *(first real client)*

When a client's existing website is replaced, its old URLs must redirect to the
new ones. Otherwise they answer 404 on the day of delivery and Google drops the
rankings the client already had — caused by your delivery, and they will say so.

A table of `old_path → new_path` with a status code, and one middleware. Half a
day. Outside the MVP only because the demo has no predecessor; needed by the
first client who does, which will be most of them.

### 70. Cookie consent *(first real client)*

Analytics will be added, and in the EU the script may not run before consent.
Small, and far cheaper to have ready than to retrofit inside a client's
deadline.

**Smaller than it was after #97**: the public site sets no cookie of its own
once the forms are a JS island, so this covers only what a client chooses to
add on top.

### 71. Relations between entries *(after the first client)*

No field type expresses a link from one entry to another, so none of these can
be modelled: amenities ↔ rooms, categories ↔ articles, related items.

Amenities are the case that arrives first. Without relations they are free text
repeated inside every room — which cannot be filtered, cannot carry an icon,
and will be spelled three different ways across six rooms.

A text list per room is enough for the demo. This is the next real gap in the
type system after #68.

### 72. Support requests, client → agency *(Phase 3)*

**Design against the obvious version.** A ticket system living inside a
per-site installation means one inbox per installation: at fifteen clients that
is fifteen places to check. That is worse than the email it replaces, and it
fails at precisely the thing it exists to fix — you not seeing the request.

Version one is therefore deliberately small: a form that **emails the agency**,
plus a local copy the client can see so they know it was sent. No status
workflow, no assignment, no replies in the panel, because none of those work
without somewhere central to hold them.

A real support system belongs to a central agency service, alongside update
distribution, and that is its own product.

### 73. Bulk booking import from a spreadsheet *(Phase 3)*

Owners export their bookings from Booking.com, Airbnb and others. Ship presets
for the common formats — there are real templates on hand from previous clients
to build them from — plus a mapping screen where a user matches the columns of
their own file to ours.

**The work is not the parsing.** It is deduplication: the same export will be
uploaded again next month and must not double every booking. That needs an
identifying key per source (the platform's own reservation code) and a preview
— *"12 will be created, 3 updated, 40 unchanged"* — shown before anything is
written.

Serves owners with no channel manager, which is why it comes before #74.

### 74. Channel manager integration, Beds24 first *(last)*

Bookings synchronise automatically instead of arriving by hand or by
spreadsheet.

The largest single integration on the list, and last on purpose: #65 already
sends visitors to the channel manager for availability and payment, and #73
already gets existing bookings in. This replaces manual entry with sync, which
is an improvement on a working system rather than a prerequisite for one.

---

# Code-review findings

**One numbering sequence, two kinds of thing.** Findings are **#36–#53**,
**#75–#95** and **#99–#110**. Everything between and around them is a *product
work item* and lives under `# Product work items`: **#55–#74**, and **#96–#98**
added on 2026-09-05. Reading the whole sequence as one list is the mistake this
paragraph exists to prevent.

**Five numbers have no entry, and all five are done.** Four are findings:
**#47**, **#48** and **#54**, which were in the MVP (CHANGELOG §13), and
**#39**, fixed while the code it described was being changed for something else
(CHANGELOG §14). The fifth, **#68**, is a work item (CHANGELOG §14). The
numbers are not reused, so those five are the only gaps and nothing is
missing.

**#99–#110 are the exception to the sentence below**, and they come first
because they are the only group here that is live work: they are not debt to
rank against the MVP but the unfinished part of #96.

**Nothing else on this list is scheduled** —
the rest are real, stay recorded, and are not being worked on. Grinding through
them before the MVP ships is the most plausible way to spend three months and
reach no client.

The priority labels rank these *against each other*, not against the MVP.
**P1** is behaviour that is wrong now, **P2** is correctness with small blast
radius, **P3** is tidying. **P0 outranked the MVP itself and is closed** — it
is kept below for its reasoning, not as work.

Items **#36–#46** came from a review of the work in `CHANGELOG.md`, so most are
the cost of recent changes rather than old debt — noted per item where that is
so. Items **#47–#53** came from a review of the project as a whole and are
largely the opposite: gaps present from the beginning that no single change is
responsible for.

Items **#75–#88** came from a review of #56/#57/#58 on the day that work
landed, and **#99–#110** from a review of #96's public half on the day *it*
landed. Both are a different kind of entry from #36–#53: not debt inherited
from an earlier version of this codebase, but defects in code written hours
earlier.

---

## The #96 review — the rest of the item, not a backlog

Twelve findings from a review of #96's public half on the day it landed,
2026-09-05. **They are ranked differently from every other group here**, because they
are not debt: every one is a defect in the mechanism that commit built, in the
tests that are supposed to hold it, or in what was published alongside it.
Deferring them means shipping a translation system whose own guarantees do not
hold, so **#96 is not closable until all twelve are done** — #100 included,
which is deferred only in the sense that it lands with #96's panel half rather
than before it.

One is visible to a visitor today (#99). Five are the test mechanism failing to
hold what its docblocks claim (#101–#103, #105, #108). One belongs with the
panel half (#100). The remaining five are small (#104, #106, #107, #109, #110).

That the review found this much in a green, live-verified, mutation-tested
commit is worth naming: **every mutation proved a test bites, and none proved a
test is sufficient.** The mutations were written from the same understanding as
the code, so they exercised the paths the code already handled.

### 99. A Greek visitor is refused half in English — P1

`php artisan lang:publish` created `lang/en/` only. Laravel falls back per key
to `APP_FALLBACK_LOCALE`, so every *framework* validation message stays English
while the two hand-written ones in `lang/el.json` are Greek.

A Greek visitor submitting a bad email with no consent box ticked reads:

```
The email field must be a valid email address.
Παρακαλούμε συμφωνήστε να κρατήσουμε τα στοιχεία σας για να σας απαντήσουμε.
```

The framework messages are the **majority** of what a visitor ever sees — every
`required`, `email`, `max`, `date` and `integer` on the form. The hand-written
pair is the exception.

Neither `TranslationTest` nor the live probe caught it because both assert on
the consent message, which is the one that was translated. **A test written
from the same understanding as the code cannot find what that understanding
missed** — the same reason the mutations all passed.

The fix is `lang/el/validation.php`, and only the rules the public forms
actually use: the per-key fallback covers the rest, so a partial file is
correct rather than half-finished.

**The messages are half of it.** Every framework line interpolates
`:attribute`, which resolves to the request key, so a Greek `validation.php`
alone produces *«Το πεδίο arrives_on είναι υποχρεωτικό»* — a Greek sentence
around an English column name. The `attributes` array has to carry the enquiry
form's fields (`name`, `email`, `phone`, `message`, `arrives_on`, `departs_on`,
`guests`, `consent`, `source_url`) or the finding is marked done while the page
still reads as half-translated.

Decide with #109, which is the other half of the same `lang:publish`.

### 100. The owner's notification will be sent in the visitor's language — P2

`EnquiryController::notify()` builds `EnquiryReceived` **inside the visitor's
request**, where `SetLocale` has already set the application locale to the
language of the page they were reading.

Nothing is wrong today, because the mail template is hardcoded English. But
#96's own description says the owner's notification follows the *owner's*
locale, and the moment that template is translated a French visitor's enquiry
produces a French email to a Greek owner. It will look like a mail defect
rather than a locale one, because nothing at the call site says the locale
belongs to somebody else.

Belongs with #96's panel half, which is where `users.locale` arrives and where
the owner's locale becomes a thing that exists. The fix is to render the mail
under the owner's locale explicitly, not to move the send.

### 101. The mount test asserts something that is true without the mount — P1

`TranslationTest::test_the_client_side_of_the_translations_is_mounted` ends
with `assertSame('Name', __('Name', [], 'en'))`. `__()` returns the key when
there is no translation at all, so the assertion passes whether or not
`loadJsonTranslationsFrom(config('site.lang'))` was ever called.

**Confirmed by the mutation run**: deleting that line bit only
`test_a_page_is_rendered_in_the_language_of_its_address`. The third mount point
therefore has no proof it works — unlike the routes mount, which is proven by
loading a real file through `withSiteRoutes()`.

The fix is the same shape as `withSiteRoutes`: point `SITE_LANG` at a temporary
directory holding a known string and assert the string comes out. That also
proves the `env()` override works, which is what lets a test move the mount at
all.

**#106 is a precondition, not a tidy-up.** `withSiteRoutes` calls
`refreshApplication()`, and a new application means a new PDO — which, on the
`:memory:` SQLite the suite runs, is an **empty database**. `TranslationTest`
uses `RefreshDatabase` and creates its languages in `setUp`, so rebuilding the
application there destroys the schema the rest of the class depends on.
`CoreSiteBoundaryTest` does not use `RefreshDatabase`, which is exactly why the
routes mount can be proven there and not here. Move the test first, then write
it.

### 102. The parity test skips exactly the locales a client adds — P1

`TranslationTest::locales()` lists the JSON files in **core's** `lang/`, and
`test_every_locale_carries_the_same_keys_as_english` iterates that list. A
locale present in `site/lang/` but not in `lang/` is therefore never compared
with anything.

The collision test iterates the same list and is **not** affected: a collision
needs the key in `lang/{locale}.json` *and* `site/lang/{locale}.json`, so a
locale core does not have cannot collide. Widening it would pin nothing.

A client activates Italian and adds `site/lang/it.json` with four of the
fourteen keys. The suite is green and the Italian page ships half in English —
which is precisely what the test's docblock claims to catch, and the only case
that involves a client rather than the agency.

The fix is to take the union of the locale files found in both directories.

### 103. Nothing checks the catalogue against the code — P1

`lang/en.json` and `site/lang/en.json` are identity maps. They exist only to be
the reference the parity test compares against, and **no test compares them
with the `__('...')` literals the templates actually contain.**

So a new `__('Cancel')` in a theme template that nobody adds to `en.json` is
invisible to the entire mechanism: parity passes, collision passes, and Greek
visitors read "Cancel". The catalogue is only ever compared with itself.

The fix is a test that scans `site/theme/**.blade.php` and `app/` for `__('…')`
literals and asserts each one is in the catalogue. That is what makes the
identity files earn their place; without it they are duplication with a
ceremony attached.

**Settle #110 first, because that test decides it.** Once every `__('…')` must
be in the catalogue, "drop the honeypot label from the catalogue" stops being
an option — the template would still ask for it and the new test would fail.
Whichever of the two lands first constrains the other.

### 104. A client's own routes get no locale — P2

`site/routes.php` is required **before** the `locale` group, so a page a client
writes at `/{language}/…` renders in the default locale unless its author
remembers `->middleware('locale')`.

A client writes `/el/epikoinonia` and includes `theme::enquiry` — which the
partial supports since #66's review. The page is Greek and the form labels are
English. `CoreSiteBoundaryTest` cannot see it, and the note in
`bootstrap/app.php` saying clients "can opt in" is not where anyone writing a
route will be looking.

**The obvious fix does not reach the obvious route.** `SetLocale` reads
`$request->route('language')`, so putting it on the whole `web` group helps only
routes that *declare a parameter of that name* — and the example above,
`Route::get('/el/epikoinonia', …)`, has no parameters at all. It would stay
broken.

So either the middleware learns to read the first URL segment when there is no
parameter (safe: `admin` and `sitemap.xml` cannot match `[a-z]{2}(-[a-z]{2})?`,
which is the pattern the routes already use), or the requirement is written
where a client's route author reads it — `site/README.md` — rather than in a
comment in `bootstrap/app.php`. The first is the one that cannot be forgotten.

### 105. The key-parity assertion compares order, not membership — P3

`assertSame(array_keys($reference), array_keys(…))`. Alphabetising a
translation file, or inserting a new pair at the top rather than the bottom,
fails the suite with a whole-array diff that reads as a missing translation.

`assertEqualsCanonicalizing` states the actual rule.

### 106. The boundary test still promises two mounts — P3

`CoreSiteBoundaryTest`'s docblock says "both mounts must actually work", and
the file checks the theme and the routes file. `config/site.php` now carries a
third.

CLAUDE.md §1a sends a fresh session to that test as *the* enforcement of the
core/site line, so the translations mount sits outside the one place a reader is
told to look. **CLAUDE.md's own copy of the sentence is already corrected**;
what is left is the docblock and the check it describes, which means taking
#101's test in rather than leaving it in `TranslationTest` — see #101 for why
that move is a precondition rather than tidying.

### 107. A rate-limited visitor is refused in English — P3

`->middleware(['throttle:enquiries', 'locale'])` runs the limiter first, so a
429 is rendered before the locale is set. Swapping the order costs nothing:
`SetLocale` does no work the limiter would repeat and no work a rejected
request wastes.

### 108. Two assertions that cannot fire — P3

`assertDontSee('>Name<')` never matches, because the label renders as `Name *`;
if the translation of `Name` were dropped, `/el` would render `>Name *<` and
the assertion would still pass. `assertDontSee('theme.', false)` guards against
a namespaced-key format this design deliberately does not use.

Both read as safety nets and neither is one. Only the `assertSee('Όνομα')` half
does any work.

### 109. Three published language files nothing reads — P3

`lang:publish` wrote `auth.php`, `pagination.php` and `passwords.php` beside
`validation.php`. The application has no Blade auth screens, no password reset
and no paginated Blade views, so 61 lines of framework defaults entered the
repository as things a future translator will work through for nothing.

Only `validation.php` is needed, as the fallback base #99 relies on. Decide the
two together.

### 110. The honeypot's label is now translated — P3

The hidden trap's `<label>` was translated along with the visible ones, so its
text varies with the language.

Harmless today, because bots match the field's `name` rather than its label.
But it is the one element in that form whose wording is a defence rather than a
design choice, and a translator handed "Website" in the catalogue has no way to
know it should be left alone.

**Only one of the two obvious fixes survives #103.** Dropping the key from the
catalogue fails the test #103 proposes, because the template still calls
`__('Website')`. So either the template stops translating it — a literal
`Website`, with a comment saying the wording is a trap and not a label — or the
catalogue keeps it and the comment goes there instead. Decide it with #103.

---

## P0 — the #56/#57/#58 review, before anything else

Fourteen findings against commit `91e0222`, 2026-09-02, at xhigh effort. **This
block is done before #59 and before any other work.** The reasoning is in Phase
1: #59 is built on precisely the four mechanisms this list says are broken.

Three were verified live against MySQL with a `zz-review` probe module rather
than argued from reading — those say so. **The test suite cannot catch #76**:
it runs on SQLite, which does not enforce `varchar` limits.

**Status: closed, 2026-09-05.** #75, #76 and #77 in CHANGELOG §17; #78–#88 in
§19. Kept here in full because the reasoning is worth more than the tick — each
one says what was wrong and what was decided. **#59 is next.**

### The three that are wrong in the browser — DONE

#### 75. Reordering renumbers only the ids it is sent, so pages collide — DONE

`EntryController::reorder` assigns positions `1..N` to exactly the ids in the
body. `EntriesTable` only ever holds one page — `paginate(15)` — so
`reorderedIds` sends fifteen ids at most.

A module with 20 entries: reorder on page 1 and those fifteen get `sort_order`
1–15. Page to entries 16–20, press ↑ once, and those five are written 1–5. They
now sort ahead of, and interleaved with, the fifteen on page 1 — an order
nobody chose.

**Why the tests missed it:** every case in `EntryOrderingTest` sends the
module's whole set. Write the failing test first — reorder a subset, assert the
untouched entries keep their positions.

Two possible fixes, and the choice is a product decision:

- **Positions are relative to the page**: the endpoint offsets by
  `($page - 1) * 15`. Cheap, and wrong the moment a filter changes what a page
  holds.
- **The panel sends the whole module's order**: the table asks for every id
  before a move, or the endpoint takes "move entry X to position N" and
  renumbers around it server-side. More work, and correct under pagination.

The second is the real answer. A list somebody wants to hand-order is a slider
or a menu, so it is small — fetching every id is one cheap query.

**Done.** The second was chosen, with the server enforcing it: a new
`GET .../entries/order` returns every id in listing order, and `PUT .../order`
refuses a body that is not the module's complete set (which also rejects a
repeated id). The panel reorders within that list, so an arrow now reaches a
neighbour on another page. Both endpoints share `Entry::inListOrder()`, pinned
equal across two pages by a test. CHANGELOG §17.

#### 76. A `slugs` key is never validated, and MySQL answers 500 — DONE

`ValidatesStructuralFields` validates every slug *value* and no slug *key*,
while `entry_slugs.language_code` is `varchar(5)`.

**Verified on MySQL.** `{"slugs": {"en-GB-oxendict": "probe"}}` passes
validation, then the insert throws:

```
QueryException SQLSTATE[22001]: String data, right truncated:
1406 Data too long for column 'language_code' at row 1
```

A 500 where the author should get a 422 — and **the suite cannot catch this**,
because tests run on SQLite, which silently accepts the over-long value.
CLAUDE.md records this exact trap under Environment.

Two holes, one fix: validate the key. Length, and membership in the active
languages — `{"zz": "about"}` currently creates a public URL in a language the
site does not have. `Rule::in` over the active language codes covers both.

**Done.** A closure on `slugs` checks each key against the active languages —
a closure rather than `Rule::in` on `slugs.*` because Laravel's wildcard
reaches values, not keys. `EntrySlugTest` now creates the languages, since a
slug key is one. **Verified live on MySQL, 2026-09-04**: the raw insert still
answers `1406 Data too long`, the endpoint now answers 422. CHANGELOG §17.

#### 77. `syncSlugs` deletes before it inserts, outside a transaction — DONE

`EntryController::syncSlugs` runs `$entry->slugs()->delete()` and then creates
the new rows with nothing wrapping the pair.

An entry live at `/el/rooms/thea` and `/en/rooms/sea-view` is updated with a
third language whose key trips #76 — or loses a race on the unique index. The
DELETE has committed; the INSERT throws; **both existing public URLs are gone.**
The author sees a 500 and two pages are dead.

`store()` has the same shape: the entry row is committed before `syncSlugs`
runs, so a slug failure leaves a saved entry the client was never told about.

Wrap the write — entry and slugs together — in one `DB::transaction`. Fixing
#76 makes the common trigger go away; it does not make this correct.

**Done.** Both `store()` and `update()` wrap the entry and `syncSlugs` in one
transaction. The tests force the failure on the insert itself rather than
through a constraint, because every collision the request rules already catch
never reaches the write. CHANGELOG §17.

### The rest, in the order they were ranked — all DONE (CHANGELOG §19)

Two of these were the same *kind* of defect as the serious three: code correct
only by accident, failing silently once the accident stopped holding. #79 read
a generated list positionally, which quietly reintroduced the drift
`fieldTypes.json` exists to prevent. #87 filters a column that is unambiguous
only for as long as `entry_slugs` has no `status`.

One was measured and found not to matter: **#88 costs 133 microseconds and zero
queries**, not the double rule-set walk it was described as. The refactor was
kept for clarity, not for speed. Two were measured and did matter: reordering
fell from **32 queries to 3** (#84), and a listing's slugs from fifteen
`SELECT`s to one (#85).

**#78 was rewritten after a human tried it.** The first version disabled the
arrows while a request was in flight, which the review offered as one of two
options — and which fixes the race by discarding the clicks: three quick
presses still moved a row one place. What shipped instead applies the move
locally and serialises the writes through `lib/latestWriteQueue.js`, which
coalesces because each payload is the module's whole order. The queue is a
tested pure module; the component wiring around it has no harness in this repo
and was checked in the browser.

#### 78. Rapid ↑/↓ clicks race on a stale `entries` array — DONE

`EntriesManager.handleReorder` has no in-flight guard and the arrows stay
enabled. Click ↓ twice quickly and the second click computes `reorderedIds`
from the list that the first PUT has not yet refreshed, so it sends the same
single swap again. The row moves one place instead of two, and out-of-order
responses can leave either state on screen.

Disable the controls while a reorder is in flight, or apply the new order
optimistically so the second click computes from it.

#### 79. Status constants are read by array index — DONE

`resources/js/lib/entries.js` takes `STATUSES[0]` and `STATUSES[1]`. That is
positional extraction from a generated array, which **re-introduces the drift
`fieldTypes.json` exists to prevent**, and does it silently.

Add a third state — `['draft', 'scheduled', 'published']`, the obvious
insertion point — and `FieldTypeConsistencyTest` still passes, the build still
succeeds, and `STATUS_PUBLISHED` is now `'scheduled'`. The Publish button
writes the wrong status and every badge is mislabelled.

Emit a keyed object from `SyncFieldTypes` so a missing key is `undefined` and
fails loudly.

#### 80. The `sortOrder` accessor returns 0 for an unhydrated attribute — DONE

`Entry::sortOrder`'s getter casts before it compares, so `(int) null` is `0`
and `0 !== 100000` returns `0` rather than `null`.

**Verified:** `(new Entry)->sort_order` is `0` — "pinned to the top" — where
the docblock promises `null` for unpositioned. That is the exact inversion the
sentinel was introduced to prevent, waiting for the first code that builds an
Entry before saving it. Check `$value === null` before casting.

#### 81. The 201 omits the columns the database defaulted — DONE

`store()` returns the model straight from `create()`, which never reads the row
back. **Verified on MySQL:** the response serialises `data, status, module_id,
updated_at, created_at, id` — no `sort_order`, no `published_at`, and `status`
only because the panel happens to send it.

A client that creates an entry without a status reads `response.status` as
`undefined`, so `isPublished()` says Draft whatever the database chose. And
`show()` loads `slugs` while `store()` and `update()` do not, so three
endpoints return three shapes for one resource. `->refresh()->load('slugs')`
before responding makes them agree.

#### 82. `sort_order`'s cap lets a client set the sentinel itself — DONE

`'max:' . Entry::UNPOSITIONED` permits exactly 100000. **Verified:** PUT
`sort_order: 100000`, get a 200, read the entry back as `null`. The value
silently became "unpositioned". Cap at `Entry::UNPOSITIONED - 1`.

`min:0` is the same mismatch one size smaller: every comment says positions
start at 1, and 0 validates.

#### 83. The comment in `index()` claims a default of 0 — DONE

> "Everything starts at 0, so a Module nobody has ordered keeps the old
> newest-first behaviour"

The migration in the same commit defaults `sort_order` to **100000** and
explains at length why 0 was wrong. The next reader who trusts the controller
reasons about ordering backwards — the precise mistake the sentinel prevents.

#### 84. `reorder` runs 2N queries and accepts duplicate ids — DONE

`ids.*` fires one `exists` per id; the transaction then fires one UPDATE per
id. Fifteen rows is 30 statements for one swap. Nothing enforces `distinct`, so
a repeated id consumes two positions and writes one row; nothing caps the
array, so one request can issue tens of thousands of statements inside a single
transaction.

`distinct` on `ids.*`, `max` on `ids`, one `whereIn` for existence, one
CASE-based UPDATE for the write.

#### 85. `slugFor` lazy-loads the relation on every call — DONE

It touches `$this->slugs`, per model and per call. A public index of fifteen
entries with a link each is fifteen SELECTs against `entry_slugs` — thirty if
the template also needs the hreflang alternate. **This is the read path #59 is
about to build on**, so it is worth fixing before rather than after: eager-load
at the call sites, or have the listing scope select the slug alongside the
entry.

#### 86. The form resends `status`, so saving can silently revert a publish — DONE

`EntryForm` always includes `status` in the payload, taken from what it loaded
when it opened. An author opens a draft to fix a typo; meanwhile the entry is
published elsewhere; the author saves and the form writes `status: 'draft'`.
The live page disappears with nothing said.

The rules are `sometimes`, so omitting `status` when it was not touched is
already supported and confines the write to what was actually edited.

#### 87. `published()` filters an unqualified column after a join — DONE

`scopePublished` uses a bare `status`, and `scopeForSlug`'s docblock advertises
`forSlug(...)->published()` — a where clause against a joined query. It works
only because `entry_slugs` has no `status` column today. Add one — a
per-language publication state is the obvious next request for a multilingual
CMS — and every public lookup becomes `ambiguous column 'status'`, failing in
the read path rather than where the column was added. `entries.status` costs
nothing.

#### 88. `validated()` is recomputed for each write path — DONE

`attributes()` and `syncSlugs()` each call `$request->validated()`, so every
create and update walks the full rule set twice — including the schema-derived
`data.*` rules, the largest part of it. Pass the array in from the controller
method.

**Measured before believing it.** It is a re-*extraction*, not a
re-*validation*: 17 rule attributes, **133 microseconds, zero queries**. The
refactor was kept because passing the array down is simpler than passing the
request to two methods that each unpack it — not because it bought anything.
The finding overstated the cost, and that is worth recording.

### What a human still has to check in the browser

Nobody has clicked through the admin panel since #56/#57/#58 landed, and #78 in
particular has no automated cover. On a module with **more than 15 entries**:

1. **Page 2, ↑ on the first row.** The row should move up and **onto page 1**.
2. **Page 1, ↑ on the first row** — disabled. **Page 2, ↓ on the last row** —
   disabled. Everything between them enabled, including ↓ on the last row of
   page 1, which should send it to page 2.
3. **Click ↓ three times quickly** (#78). The row should move **three**
   places, and the requests should go out one at a time — the middle order is
   never sent, because the last one already describes the finished list.
4. **Open a published entry, change only a text field, save** (#86). It must
   stay Published.
5. **A slug box with `zz`** (#76) — a 422 naming the language, not a 500, and
   the entry's other URLs untouched.
6. **Create an entry and look at the badge** (#81). It should say Draft
   immediately, from the server's answer, without a refresh.

---

## P1 — wrong today

**#99 is the most urgent entry in this file and it is not below** — it is in
*The #96 review* above, with the rest of its review. A Greek visitor submitting
the enquiry form is refused half in English right now. #101, #102 and #103 are
P1 there too.

### 36. `required` does nothing on a rich-text field

`SchemaRuleBuilder` builds `['required','array']` for a rich-text field, but
the empty document the form always sends is a **non-empty array**, so it
satisfies the rule.

Verified:

```
rules for data.body : ["required","array"]

untouched editor (emptyDoc) -> ACCEPTED   ← the bug
field omitted entirely      -> rejected
explicit null               -> rejected
real content                -> ACCEPTED
```

`EntryForm` seeds every rich-text field with `emptyDoc()` via
`emptyValueFor()` and always sends it, so the two cases that *are* rejected
never occur through the UI. Ticking **Req** on a rich-text field therefore has
no effect at all — the entry saves with an entirely empty body. The same
applies per language on a translatable one.

Regression from the `required` flag being made real (CHANGELOG §4), which is
also where the feature is documented as working.

Needs a document-aware check — the frontend already has `isEmptyDoc`/
`docToText`; the backend has `RichTextDocument::toPlainText()` and no
equivalent rule.

---

## P2 — correctness, small blast radius

### 37. `getLangCode` can key a payload `"null"`

`lib/languages.js:8` returns `null` when a language has no code, and
`EntryForm` uses the return value directly as an object key:
`payloadData[f.name][getLangCode(l)] = …`. JS coerces that to the string
`"null"`, so a translation is stored under a language nothing will ever read.

Cannot fire today — `languages.code` is `NOT NULL` and unique — but the
previous implementation ended in `(l.id === 1 ? 'en' : 'fr')`, which guessed
badly yet never produced a null key. The guard went and nothing replaced it.

### 38. Query log stays enabled when an assertion fails

`ModuleSlugTest:64` asserts between `DB::enableQueryLog()` and
`DB::disableQueryLog()`. A failure skips the disable, so every later test in
the process accumulates queries in memory, and any other query-count
assertion would see entries from earlier tests — reporting the failure in the
wrong test. `try`/`finally`, or disabling before asserting, decouples them.

### 40. `currentLangCode` default is dead

`EntriesTable:9` declares `currentLangCode = 'en'`, but `EntriesManager`
passes `viewLangCode`, which is `null` until the languages request resolves —
and a JS default only fills for `undefined`.

Entries now render before languages arrive (CHANGELOG §7), so that window is
real. Cell values survive on the `|| Object.values(rawValue)[0]` fallback,
but no language button matches, so the switcher briefly shows nothing
selected. With #37, a malformed language returning `null` would compare equal
to a `null` `currentLangCode` and be marked active.

### 41. Stale rows while clamping past the last page

`EntriesManager:52` calls `setPage()` and returns early when the response is
past the last page, leaving the previous page's rows and metadata on screen
until the refetch lands — so the table can show page 3's rows under
"Page 3 of 1". Clearing the rows, or taking them from the clamped response,
avoids rendering a state the server never returned.

### 42. `schema:sync-field-types` ignores a failed write

`SyncFieldTypes:53` discards the return of `file_put_contents()`. On a
read-only checkout the command prints "fieldTypes.json regenerated." and
exits 0 while nothing was written — so someone following the test's
instruction sees the command succeed and the test keep failing, with nothing
pointing at the write.

### 43. Unknown-key check misreports a non-object field

`ModuleController:34` casts the field to an array before reading its keys, so
posting `schema: ["title"]` reports *"Unknown field key(s): 0"* — which
describes neither the mistake nor the fix. A field that is not an array
should be rejected as such before its keys are inspected.

### 50. The upload rule offers SVG and then rejects it

`UploadController:13` validates `image|mimes:jpeg,png,jpg,webp,svg`. In Laravel
13 the `image` rule does not accept SVG unless written `image:allow_svg` —
`validateImage()` builds its list as `jpg, jpeg, png, gif, bmp, webp` and appends
`svg` only for that parameter. So `svg` in the `mimes` list is dead: it is
rejected one rule earlier, and the author is told "must be an image" rather than
that SVG is unsupported.

**Resolve this downwards, not upwards.** Removing `svg` from the list makes it
honest. Adding `allow_svg` would make it work — and would put an open language
on the panel's own origin: an SVG can carry `<script>`, it is stored on the
public disk, and `Storage::url()` hands out a link directly to it. That is the
exact problem `RichTextDocument` exists to avoid for rich text, arriving through
a different door.

The fix is one word, so most of the work is the comment explaining why the
inconsistency must not be closed the other way.

### 51. Uploaded files belong to nothing and are never removed

`POST /api/upload` stores a file, returns a URL and forgets it. Nothing records
which Entry a file belongs to, so:

- replacing an image on an Entry leaves the old file behind;
- deleting an Entry leaves every file it referenced behind;
- deleting a Module cascades its Entries and leaves all of theirs.

`storage/app/public/uploads` only grows, and nothing can distinguish a live file
from an orphan. Doing this later means scanning every Entry's `data` for URLs to
reconstruct ownership that was never recorded; doing it now means deciding that
an upload is owned, while the directory is still small enough that the decision
costs nothing.

A gap rather than a defect — filed here because the cost of deferring it rises
with every upload.

### 52. Languages have no write API

`LanguageController` has `index` and nothing else, and no other route touches
the table. Adding, renaming, deactivating or defaulting a language is a manual
SQL statement.

For a CMS whose central feature is translation, the set of languages is
configuration a user should own rather than a fixture. It is also where #49's
missing writer belongs: the "exactly one language is the default" rule needs
somewhere to live, and there is currently no code that could hold it.

Also a gap rather than a defect, and the larger of the two — it is a controller,
a policy question (these are installation-wide, not per-owner) and a screen.

### 49. `is_default` is read but never written

`languages.is_default` decides which language the panel opens on — `getLangCode`
and `defaultLanguage` in `lib/languages.js`, adopted in CHANGELOG §7.

Nothing wrote it. Not the seeder, not an endpoint, not a migration beyond
`->default(false)`. So `defaultLanguage()` always fell through to
`languages[0]`, and on any install whose database had not been edited by hand
the panel opened on whichever language `orderBy('id')` returned first.

**Half fixed (CHANGELOG §13).** The seeder now flags the language it creates,
so a fresh install has a real default and the behaviour CHANGELOG §7 describes
is no longer dormant.

**What remains:** nothing can *change* it, and nothing enforces that exactly
one language carries it — two rows flagged and `defaultLanguage()` silently
picks whichever comes first. Both need a writer, which has no home until #52.
Downgraded from P1 accordingly: it is no longer wrong on a fresh install, only
unmanageable.

### 89. The dev database's Greek is `gr`, and the default is English — DONE

Found while verifying #76 live against MySQL, 2026-09-04. The `languages` table
on this machine holds:

```
#1  gr  Greek    default=no   active=yes
#2  en  English  default=yes  active=yes
#3  fr  French   default=no   active=yes
```

**`gr` is not the code for Greek.** ISO 639-1 is `el`; `gr` is the ISO 3166
*country* code for Greece. The seeder writes `el`, `DatabaseSeederTest` asserts
`el`, and every example in the docs says `el`. Only this database disagrees,
which is what #52 predicts: with no write API, the language list is whatever
was typed into MySQL by hand.

It matters more than a spelling. The code is now the **key of a slug**,
validated against this table, and #59 is about to make it the **first segment
of every public URL** — so the demo site would ship `/gr/rooms/...`, and
changing it afterwards breaks every link and every `hreflang` already indexed.
`hreflang="gr"` is not a valid value either, so search engines would ignore it.

That the default is English is the second half. For a Greek accommodation
market the panel should open on Greek, and `defaultLanguage()` reads exactly
this flag.

Neither is a code defect — the code does what it is told. It is a data
decision that has never been made deliberately, and the cheapest moment to
make it is **before #59**, while the `entry_slugs` table is empty (it is: zero
rows across all ten modules, so nobody has written a slug through the panel
yet). Renaming a code afterwards means rewriting every slug row and every
translation key inside `data`.

**Done, 2026-09-04** (CHANGELOG §18). `gr` → `el` and Greek is the default. It
was not three lines of SQL: **23 entries carried `gr` as a translation key**
inside `data`, so the rename was driven from each Module's schema rather than
by searching the JSON. The application code needed no change — the seeder
already writes `el`, with a comment saying why. Only this database had drifted,
which is what #52 predicts.

---

## P3 — tidying

### 44. Constants declared between methods

`SchemaRuleBuilder` declares `TYPE_ASSERTING_RULES` and `SIZE_RULES` after
several method bodies, while `SUPPORTED_TYPES` sits at the top. Two places to
look for what the class knows, and two equally plausible homes for the next
one.

### 45. Two files have no trailing newline

`resources/js/lib/api.js` and `resources/js/components/EntriesTable.jsx`.
Every future diff touching their last line shows the preceding line as
changed too.

### 46. Leftover blank gap in `EntryForm`

Removing the local `getLangCode` left two consecutive blank lines near the
top of the file, which reads as a missing declaration.

### 53. Ownership is asserted in four places, in three ways

Every authorization question in the app reduces to one check —
`ModulePolicy`, does this User own this Module — but it is spelled differently
at each call site:

- `EntryController::index` / `show` — `$this->authorize('view', $module)`;
- `store` / `update` — `authorize()` on the FormRequest, which is deliberate
  and documented: it runs before `rules()` so a schema never reaches someone
  who cannot write to it;
- `destroy` — `$this->authorize('update', $module)`, the right check under a
  verb that reads as the wrong one;
- `ModuleController::index` — no policy at all, a hand-written
  `where('user_id', $request->user()->id)`.

`ModulePolicy::delete()` is called from nowhere, so the one method named for
deletion is dead while the delete path asks for `update`.

Nothing here is insecure — every path does check, and that was confirmed before
filing this. The cost is that confirming it means reading four spellings
individually, and that the next endpoint has four precedents to copy from.

**Reduced by #54, not resolved.** That changed what the policy *asks* — it now
answers "is this user signed in?" — but not where it is asked from. The four
spellings are still four, and `ModulePolicy::delete()` is still called from
nowhere while `destroy` asks for `update`. Doing #54 first was right: there was
no point tidying four call sites into one spelling of a question that was about
to be replaced.

---

## Scale — measured, and not urgent yet (2026-09-05)

Five items: four from measuring the JSON storage against indexed columns on
the real MySQL and the discussion that followed, plus one (#94) the review of
that same week's work made obvious. **Nothing here is wrong today**
at accommodation sizes — #90 is evidence rather than a defect, and the rest
become real the first time a module holds thousands of rows.

The decisions this discussion produced are above, under **Decisions taken
(2026-09-05)**.

### 90. What the JSON actually costs, measured

Recorded as evidence, because the storage design was questioned and the answer
should not have to be argued from opinion again.

**5000 entries in one module, real MySQL:**

| | |
|---|---|
| The listing we serve today (`LIMIT 15`) | **14.40 ms** |
| Search a title inside the JSON | 15.47 ms |
| Sort by a price inside the JSON | 13.92 ms |
| Sort by an **indexed generated column** | **0.49 ms** |
| Exact match on an indexed generated column | **0.48 ms** |
| `LIKE '%…%'` on an indexed column | 11.56 ms |

**About thirty times**, and the instinct that prompted the question was right.
Three things follow, and together they are why the JSON stays:

- an indexed **generated column** built from a JSON path measures the same as a
  real column, so the speed never required abandoning the JSON — only deciding
  which two or three fields are searched. It was still rejected as a *tier*
  (see Decisions), because adding one needs a migration;
- `LIKE '%…%'` is slow **with an index too**, so moving to separate tables
  would not have fixed search. That needs a FULLTEXT index either way;
- at the sizes this product actually sells into — eight rooms, fifty pages —
  none of it is measurable.

Sorting a JSON value also sorts it **as text** unless it is cast: the run
returned `10007, 10028, 10039…` ahead of `9…`. A price that sorts wrongly is a
correctness bug, not a slow query, and it is invisible until a catalogue exists.

An observation worth confirming separately: `EXPLAIN` taken *after* the
generated columns existed showed MySQL matching the plain JSON expression to
the generated column's index without the query being changed. If that holds, an
index can be added to a live module without touching any code that reads it.

### 91. The listing filesorts once positions tie

**Measured: 14.40 ms to return fifteen rows out of 5000**, and the JSON is not
the reason.

The index is `(module_id, sort_order)`, and the ordering is
`sort_order, created_at DESC, id DESC`. Every entry nobody has positioned holds
the same sentinel, so `sort_order` separates nothing and MySQL sorts the whole
module to hand back a page.

Invisible at eight rooms. It is the dominant cost of the admin listing at
catalogue size, and it is our own schema rather than anything inherited.

The fix is an index that covers the tie-breakers rather than only the first
column. Worth doing when a module is expected to be large, not before —
and worth measuring rather than assuming, since the cheapest fix may be that
large modules are domain modules and never take this path at all.

### 92. `GET /entries/order` fetches every id on every listing load

Added with #75. The panel reorders against the module's whole order, so the
endpoint returns every id — and the effect runs alongside the listing, on every
page load.

Justified at the time by "a list somebody hand-orders is small", which is true
and **nothing enforces it**. At three thousand entries it is a three-thousand
element array fetched every time somebody opens a page, for a feature nobody
would use on a list that size.

Fetch it when a reorder is actually attempted, or not at all above a threshold
— `Entry::MAX_REORDER` already says where that threshold is.

### 95. Demand every translation at publish, not at save

Deferred from the decision in CHANGELOG §22. `required` now means the default
language, which unblocks editing; the stronger rule a multilingual CMS actually
wants is **every active language, enforced when the entry is published**, with
a draft allowed to be half-translated.

`status` already exists for exactly that shape of rule (#56). What is missing is
that `SchemaRuleBuilder::build()` does not know the entry's status — adding it
changes the signature and every caller, including `ModuleController`, which
validates a schema and has no entry at all.

Worth doing before the first client publishes a site in two languages, because
that is when "half the English is missing and nobody noticed" becomes a
support call. Not before the MVP ships.

### 94. The panel has no component-test harness

Six defects in a row now sit in `EntriesManager`, `EntryForm` and
`EntriesTable`, verified by reading rather than by a test: the in-flight queue
(#78), the refetch after a failed reorder, the two payload omissions (#86 and
its slug twin), the error banner that the refetch cleared one frame after
showing it (all CHANGELOG §20), and an **assignment to a `const`** in
`EntriesTable` that the build and 155 passing tests both walked past
(CHANGELOG §22).

The pure helpers underneath them are well covered — `latestWriteQueue`,
`entryPayload`, `sortByOrder`, `valueForLanguage` — and every time the bug has
been in the **wiring**, not in the helper.

Two of them were introduced *by a fix for the one before it*, and neither was
found by the suite — one by a review, one by reading. The most recent was an
**assignment to a `const`** in JSX, which the build and 155 passing tests both
walked past, in a file whose pure helper had just gained six tests of its own.

The count is now the argument.

That is the shape of a missing test layer, not bad luck. Vitest is already
here; what is missing is a renderer and a way to fake `api`.

Not urgent, and deliberately not in the MVP — but the next time a panel bug is
found by a human clicking, this is the reason.

### 93. Drag-and-drop instead of ↑/↓ *(after Phase 2)*

The arrows work and were checked in the browser, so this is comfort rather than
a defect. It is filed because it is now **cheap**: the endpoint already takes
the module's whole order, which is exactly what a drag produces, and the
optimistic apply, the coalescing write queue and `sortByOrder` all exist from
#75 and #78. About half a day, because the difficult half is done.

`@dnd-kit/core` + `@dnd-kit/sortable` — MIT, small, keyboard and screen-reader
capable, imposes no markup.

**Not before the MVP ships.** The selling season is November–March.

---

# To discuss

Not work items, and not confined to the findings above. These need a
conversation before anyone can say whether there is anything to do — putting
them in a checklist would imply a decision that has not been made.

### ~~Should `/` exist?~~ — settled 2026-08-30

**`/` serves the client site's home page.** Of the three shapes this question
offered, the third was chosen: the CMS renders its own content publicly, in
Blade. `welcome.blade.php` is removed as part of #59.

Worth noting that this question predicted its own cost correctly — it said that
serving public content "would make a full rich-text renderer a requirement
rather than the excerpt the admin table needs". That renderer is #55, and it is
the largest item in Phase 1.

### Are invoices cancelled, or deleted? — a question for an accountant

Raised while designing bulk actions for #64, and it is **not a software
question**. The instinct was a *Delete selected* button; the likely reality is
that an issued παραστατικό cannot be deleted at all and a credit note is issued
against it instead.

Nobody here knows Greek tax law well enough to answer, and guessing wrong
builds a button that must never have existed. **Ask an accountant before the
invoicing screen is designed**, not after.

Two things hang on the answer: which bulk actions exist at all, and whether the
invoices table needs a soft-delete or a status of its own. Both are cheap now
and expensive once a client's books depend on them.

### How strict should a module schema be?

Three separate decisions have each been made on their own merits — unknown
types throw, unknown keys are rejected, incompatible validation rules are
refused — and they add up to a schema contract that is now quite strict at
the API boundary and not enforced at all below it. A schema written with
`DB::table`, as the seeder does, bypasses every one of them.

Worth deciding deliberately whether that boundary is the right one, rather
than continuing to arrive at it one finding at a time.

### What does editing a Module mean for its Entries?

`routes/api.php` offers `POST /modules` and `GET /modules` and nothing else — no
`show`, no `update`, no `destroy`. A Module is created once and is then
permanent, so a misspelled field name or a forgotten field means building a
second Module and re-entering its content by hand. For a product whose central
feature is *defining content types*, that is the largest gap in it.

The endpoint is the easy half. `Entry.data` is keyed by each field's `name`, and
a schema field has no identity apart from that name, so every schema edit is a
data question before it is an API question:

- **Renaming a field** orphans every stored value, which stays in `data` under
  the old key where nothing will read it.
- **Removing a field** does the same, and additionally requires deciding whether
  the data goes with it.
- **Adding a required field** makes every existing Entry retroactively invalid.
  Nothing validates on read, so they keep loading and fail the next time
  somebody saves one — an error about a field the author never touched.
- **Changing a type** (`string` → `text`) leaves plain strings where the form
  and `RichTextDocument` both expect documents.

Three shapes, and like the `/` question they are different products:

- **Additive edits only.** Add fields, reorder them, change validation; never
  rename, remove or retype. Cheapest, invalidates nothing already stored, and
  covers the mistake that actually happens.
- **Give each field a stable id.** `data` keys by id, `name` becomes a label,
  and renaming is free. The correct model, and it means migrating every existing
  Entry once to get there.
- **Edit freely, migrate per change.** Most capable; needs a migration path per
  kind of edit and a decision about the ones that cannot be automated.

Deleting a Module is a smaller question with the same shape — `entries.module_id`
already cascades, so the only real decision is whether content should be
recoverable afterwards.

Until this is settled, adding the endpoints would ship the easy half and let the
hard half surface as silent data loss. That is why this is here and not in P1.

**Status after 2026-08-30: deferred, and less urgent than it looks.** Only the
master admin — a developer — edits a schema, and with one installation per site
a rename is a hand-written migration against one database. It becomes pressing
again the moment module definitions move into files, because a schema edit then
ships to every installation at once.

### How does this become an eshop platform?

The stated position: commerce is where the real money is, and building on
WooCommerce or Shopify is not wanted — the platform must be owned code. That is
a legitimate agency model, and several were built exactly that way on older
platforms. But it is a **second product, larger than this CMS**, and it is
deliberately not started before content sites produce revenue.

What is actually inside it, so the size is never underestimated again:

- **Products with variants** — size × colour, each combination with its own
  stock and price. A model, not a field.
- **Stock under concurrency** — two buyers, one last item. Needs locking.
- **Orders as a state machine**, with **immutable lines**: an order records the
  price at the moment it was placed, not today's.
- **Money** — VAT per category, discounts, coupons, shipping, rounding. Decimal
  columns, never floats and never JSON.
- **Payments** — Viva, Stripe, bank gateways: one integration each, plus
  webhooks and reconciliation.
- **myDATA** — a legal obligation in Greece, not a feature. Also the subject of
  #64, which arrives first and at far smaller scale.
- **Couriers** — ACS, Speedex, BOX NOW: vouchers and tracking, one integration
  each.
- **GDPR on customer data**, colliding with the legal retention period for tax
  documents.

Three things to settle before any of it starts:

- **Build or adopt?** The agencies this model is drawn from *adopted* an
  existing codebase and accumulated their own automation on top. The asset was
  the automation and the mastery of one codebase, not the authorship — and the
  ones who owned everything also owned security and PHP upgrades forever.
- **Which "eshop"?** Full checkout with payments and invoicing, or a catalogue
  with an order/quote form? The second is roughly a tenth of the work and
  covers a real number of clients.
- **Must the storage model change first?** Table-per-module belongs to this
  question, not to the CMS. Note that #63 and #64 already establish the pattern
  that may answer it: **domain modules are hand-written tables; only content
  modules are schema-driven.** If that holds for bookings and invoices, it holds
  for products and orders, and the JSON column never has to become something it
  is not.

The complaint that started this — no indexes on content fields — is already
half answered by #56, #57 and #58 moving the queried fields into real columns.
What remains is filtering and sorting by *content* fields at scale, and that
only bites at eshop sizes.

---

### 111. The singleton refusal is written twice — P2

The same sentence is built in `StoreEntryRequest::rules()` and again in
`EntryController::store()`, because the check happens twice on purpose: the
request refuses the ordinary case, and the controller re-checks inside the
transaction with a lock so two simultaneous creates cannot both win.

**The duplication was invisible until it cost something.** Translating #96's
panel half caught only the controller's copy on the first pass; the request's
stayed English, and nothing failed — the two are never compared. Whoever
rewords one will do the same.

The check has to stay in both places; the *message* does not. It belongs on
`Module`, next to `isSingleton()`.

### 112. No test pins the wording of any `$fail()` message — P3

Five validation closures build the message a person reads, and the suite
asserts only that validation refuses. Rewording any of them — or breaking a
`:placeholder` so it renders literally — passes.

Found by rewording all five for #96 and noticing nothing went red. They were
checked by rendering them in both locales by hand, which is what a test should
have been doing.

Not every message needs pinning; a message with **placeholders** does, because
an unreplaced `:slug` in front of a client is the failure mode and it looks
exactly like working code. That is four of the five, plus the eight in
`SchemaRuleBuilder`.

# Backlog

Deliberately out of scope for MVP.

- **Component tests.** The suites cover PHP and the pure JS helpers; nothing
  renders `EntryForm` or `ModuleBuilder`. Needs jsdom and a heavier setup.
- **Select options as `{value, label}`** instead of flat strings. The current
  format works but cannot carry a label distinct from its value.
- **Frontend routing / global state.** Not needed at the app's current size;
  `app.jsx` switches on a local `view` value.
