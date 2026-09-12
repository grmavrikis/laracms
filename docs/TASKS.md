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

**2026-09-10 — added #117, the panel redesign, before any outreach.** Called by
the owner after the Bella Vista mock-up succeeded: *"το όλο θέμα δεν μου αρέσει,
είναι πάρα πολύ απλοϊκό"*. The demo work is deliberately paused for it.

The argument is not taste. **The panel is half the product and the client is the
one who lives in it** — we see it once, at handover, and they see it every week
for three years. `BUSINESS.md` §5 puts the ceiling of the entire business at
**support minutes per client**, and every screen that does not explain itself is
a telephone call against that ceiling. It is also the only part of the product a
prospect is shown that is *ours* rather than a theme: a bought template makes
any WordPress build look the same as ours from the front, and the panel is where
the difference is visible.

Deliberately sequenced **before** #62 finishes rather than after, for the same
reason #96 came before #97: the demo is the sales tool, and showing it means
showing the panel behind it. Doing it afterwards means doing it twice.

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
#66, #67 and #97.** Remaining: **#96** (built, its review open) and **#98**,
and Phase 1 is closed. The first three were added on 2026-09-05 (see Amendments) and cost
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

Note that **rooms and facilities need no engineering at all**: they are modules
built in the existing builder, with listing pages core already renders. That is
the schema-driven design working as intended — and the reason #68 came first is
that without it the most important of those modules could not hold its content.

**The home page was the exception, and it was missed here.** A slider is a
module like any other, but nothing can *render* it: `theme::home` receives the
chrome and a list of module names and addresses, so the front page cannot show
a slide, a featured room, or a sentence of its own. One small read-only service
in core closes it; #62 scopes it, along with the two decisions that come with
it — where the theme's CSS is built to, and how a module that is a front-page
component stays out of the public menu.

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

**#70 cookie consent** lands with the first client that replaces an existing
site — which will be most of them. Then **#71 relations between entries**, the
next real gap in the type system after #68. **#69 redirects came early**, as
step three of #114: our own rename moves URLs, so the mechanism was needed
before any client's old site was.

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

### 62. The demo site — client #0 — IN PROGRESS

A complete accommodation site with a name, a location and a character.
**Never lorem ipsum** — a prospect has to see themselves in it.

- **Every language filled completely.** Half-finished English demonstrates the
  exact opposite of what is being sold.
- Menu hand-written
- Live on a domain, with staging on a subdomain of the same VPS

Built as a paying client would be, so it doubles as the first template.

#### It is a real hotel, and that was decided on purpose

The demo is **City Marina Hotel**, Donzelot 15, Corfu old town — 54 rooms, a
real business whose site (`citymarina.gr`) dates from 2011 and says so in its
own footer. The owner intends to approach them with it.

A real prospect beats an invented business: the content is true, the
photographs exist, and the meeting has a reason to happen. **The constraint is
that it stays local or on staging.** Publishing it on a domain under their
name and photographs needs their permission, and the whole point of the CMS is
that swapping the name, the palette and the photographs for a neutral public
sample is ten minutes in the panel.

What the research turned up, and what the pitch rests on:

- **They have no German**, on Corfu. Their site is English, Greek and French
  (`index.php`, `index-el.php`, `index-fr.php`).
- **They have no `hreflang` at all** — three language versions and nothing
  telling a search engine they are the same page. Ours does this from #59.
- **Their booking engine sells rooms their website does not mention.** The site
  advertises *Executive Rooms* and *Suites*; WebHotelier sells Economy,
  Economy Triple, Superior, Superior Triple and Family.
- **Their speed is not a weakness** — 1.4 s, 53 requests. Measured, so nobody
  builds an argument on it.

#### The theme is hand-written in Tailwind, not bought

The original item budgeted €20–60 for a template. Reversed, for reasons that
are not about money: `tailwindcss.com` sells thirteen templates at €89, every
one of them React or Next.js and not one of them hospitality — and our public
side is Blade baked to files. A bought Bootstrap template would put a second
CSS framework beside the panel's Tailwind for the sake of components this site
does not use; the only interactive thing on the front page is a `<details>`.

What replaced it is a set of constraints rather than a design: light ground,
**one accent — terracotta `#B4552D`, taken from the roof tiles in the client's
own photograph** — a serif for headings and a sans for text, nothing laid over
a photograph, no carousel, a visible horizontal menu. The whole scheme is eight
variables in one `@theme` block, which is what makes client #2 a change of
tokens rather than a rebuild.

#### Where it stands (2026-09-07)

**The database was emptied** of fifteen test modules and their 54 entries, and
the baked pages flushed. The dump taken first is the only copy of that data —
see CLAUDE.md → Environment for where it is.

**Languages are `el` (default), `en`, `de`.** French was a test language and is
now inactive: an active language nobody fills puts a link in the switcher to an
empty site, which is the impression this item exists to avoid.

**Six modules exist with their schemas and no content.** The panel's slug is
English because it is an identifier, not an address; the public slug is per
language, and the Greek ones were written by hand because `Str::slug` produced
`skhetika`, `parokhes` and `fotoghrafies`.

| key | el | en | de | | fields |
|---|---|---|---|---|---|
| `slider` | slider | slider | slider | list | heading, subheading, image |
| `rooms` | domatia | rooms | zimmer | list | title, description, photos, sleeps, size_m2, price_from |
| `facilities` | paroches | facilities | ausstattung | list | title, description, photo |
| `gallery` | fotografies | photos | fotos | singleton | title, photos |
| `about` | sxetika | about | uber-uns | singleton | title, body, photos |
| `contact` | epikoinonia | contact | kontakt | singleton | title, body |

**The front page exists as a throwaway mock-up** in `public/mockup/`, served at
`http://mini-cms.test/mockup/`. Plain HTML with the Tailwind browser build,
outside git, deleted once it becomes Blade. Its five sections are: hero, the
booking hand-off, three rooms, four facts, location, and a closing *book
direct*. The enquiry form (#66) is **not** on it — it belongs on the contact
page. The front page has one job, which is to start a booking.

**Every page of the site is now a mock-up, in the same language** (2026-09-08):
`index`, `rooms` (a list module's listing), `room` (one entry), `facilities`
(the second list module), `gallery`, `about` and `contact` (the three
singletons, the last carrying the enquiry form). The chrome that repeats -
focus rings, reduced motion, the `<details>` panel, and the rich-text block -
is in `public/mockup/chrome.css` so the seven pages cannot drift apart before
they become Blade.

Four things came out of drawing them, and they change what Blade has to do:

- **`theme::entry` cannot stay a blind loop over `$fields`.** The `rooms`
  schema is title, description, photos, sleeps, size_m2, price_from - and the
  design puts three of those on one line under the heading and the photographs
  above the text. A designed theme **addresses fields by name**, which is the
  argument for handing templates a map keyed by field name rather than the
  ordered list. The generic loop stays as the fallback for a module nobody has
  styled.
- **The two listings share one template and differ only in which fields they
  print.** `theme::module` branches on `$module->slug` *inside the theme* - the
  theme is allowed to know the names of its own modules, and core stays out of
  it.
- **The header has two variants**, white over the hero photograph and ink on
  paper everywhere else. One template with a flag, not two.
- **The theme's stylesheet must cover exactly what `RichTextRenderer` emits**:
  `p`, `ul`/`ol`/`li`, `blockquote`, `h1`-`h6`, `hr`, `br`, `pre>code` and the
  marks `strong`, `em`, `s`, `u`, `code`, `a`, `mark`. The renderer hands over
  one `HtmlString` with no classes on it. That block is written and working in
  `chrome.css`; it moves to `site/theme/theme.css` unchanged.

The menu is five items - Δωμάτια, Παροχές, Φωτογραφίες, Το ξενοδοχείο,
Επικοινωνία - horizontal, and it **wraps onto two lines on a phone** rather
than collapsing into a hamburger. The earlier `hidden md:flex` left a phone
with no navigation at all.

#### The core work this item still needs

**1. The front page cannot show content, and that is the only real gap.**
`PageController::home` hands `theme::home` the chrome and `$modules` — a name
and an address per module — and nothing else. There is no way for the front
page to carry a hero, a sentence of its own, or three featured rooms. So the
claim that the home-page slider needs no engineering is wrong.

The fix is one small read-only service in core, so the theme names *which*
modules it wants while core keeps deciding *how* they are read:

```
App\Services\PublicContent
    ->entries(string $moduleKey, string $language, ?int $limit): Collection
    ->singleton(string $moduleKey, string $language): ?array
```

Published only, in `sort_order`, filtered to entries with a slug in that
language, fields already through `EntryPresenter` — which is exactly what
`PageController::index` does today, lifted so both can call it. `$moduleKey` is
`modules.slug`: since #114 that column is the panel's alone and never appears
in a public address, which makes it the one stable identifier available.

Doing this in Blade instead would put `published()`, ordering, rich-text
rendering and per-language address composition into a template. That is what
`EntryPresenter` and #114 exist to prevent.

**2. The theme's CSS has no home.** `site/README.md` → *Assets* defers this
decision explicitly to this item. Vite's inputs are the panel's; nothing builds
`site/`, and `resources/css/app.css` scans `site/theme` only so the panel's
stylesheet keeps those utilities alive.

Recommended: `site/theme/theme.css` built to **`public/theme.css` with no
hash**, on the same reasoning as `public/forms.js` in #97 — a baked page is a
file that lives for ever, and a hashed `app-4f3a.css` baked into one dies at
the next `npm run build` while the page pointing at it survives. Cache-busting
by a content hash in the query string changes the HTML, so `pages:warm` notices.
The alternative, `@vite` and a hashed name, is correct only for as long as
nobody ever forgets `pages:warm` after a build; when they do, the site serves
naked. An unhashed path fails to stale CSS instead.

**3. `slider` has public addresses and should not.** It is a component of the
front page, not a section: `/el/slider` renders an empty listing and sits in
the menu and the sitemap. Removing its `module_slugs` rows removes it from
public view while leaving it editable in the panel — #114's rule that a module
untranslated into a language has no page there, used deliberately.

Open with it: since there is no carousel, a **singleton `home`** holding one
photograph, one heading and one sentence is probably better than a list of
slides.

#### Still to check with the owner

Prices in the mock-up are real — read off their booking engine for mid-October
— but a real site needs low-season *from* prices, not one date's. *Breakfast
with a view of the old port* and the telephone hours are invented.

The other pages added four more, all of them content rather than code:

- **Two of the five prices are invented.** Economy triple (149) and Superior
  triple (174) were interpolated; the other three are read off the engine.
- **There are four photographs of rooms and five room types.** The fifth card
  shows the empty state - a tinted box saying the photograph is coming - rather
  than a photograph of something else. It is also a fair test of what an entry
  with an empty `photos` field looks like.
- **The reception hours are invented and now stated in three places**
  (the floating panel, the facilities card, the contact page). They say
  08:00-22:00 everywhere; the first draft said "24 hours" on one page and
  08:00-22:00 on another, which is the failure mode a demo cannot afford.
- **Breakfast 07:30-10:30 is invented**, as is the walking time to the ferry
  port (ten minutes).

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

**It costs less than "almost nothing": it costs no code at all.** WebHotelier's
engine answers a plain `GET`, so the form is ordinary HTML and the browser
composes the query string itself. Verified live against the demo's hotel — this
lands straight on the availability results with the engine's own fields filled
in:

```
https://<hotel>.reserve-online.net/?lang=EL&checkin=2026-11-20&checkout=2026-11-23&rooms=1&adults=2&children=0
```

Two consequences worth keeping. **No JavaScript**, so the page carrying the
form stays a file on disk — unlike the enquiry form, which needed an island
(#97). And the parameter names belong to **WebHotelier rather than to one
hotel**, so a single setting is enough for every client on it, which in the
Greek market is most of them. That setting already exists: `booking_url` in
`SiteSettings` (#67).

`checkin`/`checkout` in `YYYY-MM-DD` is what `<input type="date">` submits
natively, so the two ends agree without a line of glue. `nights` is accepted in
place of `checkout`.

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

### 96. Translated interfaces, panel and public — DONE (CHANGELOG §36)

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

**The review is done** (CHANGELOG §34 and §36). #99 was the one a visitor
could see; #100–#108 and #110 were defects in what had just been built rather
than debt beside it, and five of them were the test mechanism failing to hold
what its own docblocks claimed - a mount test that passed without the mount
(#101), a parity test that skipped exactly the locales a client adds (#102), a
catalogue nothing compared with the code (#103), an assertion that compared
order rather than membership (#105), and two that could never fire (#108).

**#96 is closed.**

### 97. Static HTML pages, served before PHP starts — DONE (CHANGELOG §27, §28)

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
  the answer rendered from JSON. **DONE** (CHANGELOG §27) — `public/forms.js`,
  `data-cms-form`, and `EnquiryController` answering in two shapes. Verified
  live: `home:el` was in the cache for the first time, with no `_token` in it.

**The deployment dependency has to fail loudly.** `.htaccess` covers Apache;
nginx needs `try_files` in the server block, which `.htaccess` cannot reach. A
missing rewrite does not break the site — it silently serves every page through
PHP, which looks like nothing at all. `pages:doctor` asks for a page known to
be cached and reports whether the answer came from PHP.

**Done** (CHANGELOG §28). `StaticPages` replaced `PageCache`, which is deleted.
Verified live against Apache: `pages:warm` baked 60 of 63 pages and **named the
three it could not** — a module whose slug is `τεστ κεις`, which the address
guard refuses and which does not route publicly either — and `pages:doctor`
answered *"Served from a file. PHP did not run."*, with `ETag` and
`Last-Modified` present and no `Set-Cookie`. Touching one entry took 61 files to
51 and left another module's pages alone.

Three things to know before touching it:

- **`pages:warm` is the deploy step.** A release that changes a template leaves
  every page on disk serving the old markup, and there is no expiry underneath.
  The `.stamp` beside the pages is only a net: the check runs from `write()`,
  which runs only when PHP renders, and after a deployment Apache answers every
  page and PHP never starts. Warming renders, so it notices. `pages:doctor`
  refuses when the stamp is stale.
- **The entry is saved before its slugs are replaced**, and that order is what
  lets the observer read the old addresses while the rows still hold them.
  Swapping the two lines leaves the old page on disk for ever.
- **There is no expiry.** The old cache had a seven-day TTL underneath its
  explicit invalidation. A file has none, so anything that changes a page has
  to say so — which is why `Language` is observed now and never was.

### 118. Sign-in: remember me, and a password reset

Both are **drawn on the login screen and not wired** (#117 item 9). They are
referenced from a comment beside them in `Login.jsx`, and each says
*"Not available yet."* in its `title` — because a control that looks ready and
does nothing is a support call on the one screen where a person is already
unsure whether they typed their password wrong.

Neither is UI work. **Remember me** wants a `remember` parameter on
`POST /api/login` and `Auth::attempt($credentials, $remember)`, which changes
how long a session survives — worth thinking about beside the login rate limit
(CHANGELOG §13) rather than bolting on. **Password reset** is a whole flow:
routes, a signed token, expiry, a mail template, and its own throttle, on an
application whose only mail today is the enquiry notification (#66).

Until then a client who loses their password asks the agency, which is one
support call against the ceiling in `BUSINESS.md` §5 — so this is worth doing,
just not by faking it.

> The reset is the more valuable half. Remember me saves a login a week;
> a reset saves a telephone call at an hour when nobody wants one.

### 122. The PHP the panel is waiting on (#117's debt)

#117 redesigned the panel under one rule: **no PHP that pass.** Whatever needed
an endpoint was drawn from static figures, wrapped in `ui/Preview`, and left a
TODO **naming** what it wants. This is that list, gathered in one place so it is
a decision rather than a scavenger hunt. Each is independent; none blocks
Phase 2.

They are ordered by what they cost against what they return, not by screen.

**1. `data` must be `sometimes` on the update path — the only one that is
already broken in front of a user.**

`PUT /api/entries/{entry}` with `{ status: 'published' }` answers **422**.
`SchemaRuleBuilder::build()` hard-codes `'data' => ['required', 'array']`, so a
status-only update is refused for lacking a payload it does not need. The fix is
one line plus a flag from `UpdateEntryRequest`; **create must keep it
required**, or an entry can be made with no content at all.

Until it lands, the listing's bulk *Publish* and *Unpublish* are **disabled with
the reason in their accessible name** — the button is drawn because the feature
is real, and disabled because the API will not take it.

Found by pressing the button against the running app with 701 tests green. No
test could see it: the panel's tests mock the client, and the PHP suite never
sends a status-only update. **That is the half of the contract a live check
exists for.**

**2. `GET /api/stats/entries` — the dashboard's per-module counts.**

Answering `{ module_slug: { total, draft, published } }`, which is a single
`GROUP BY module_id, status` over `entries`. The dashboard's section and enquiry
counts are **already real** — they come from `/api/modules` and `/api/enquiries`
— and only this block is invented, so only this block wears the marker.

**3. Sorting and filtering the listing.**

`GET /modules/{module}/entries` takes a page and nothing else, so the column
sort and the status filter are **drawn and disabled**. They want
`?sort=<column>&direction=asc|desc` and `?status=draft|published`.

**Applied inside `Entry::inListOrder()`, not on top of it.** The paginator and
`PUT /entries/order` must keep agreeing about what the list's order *is*, or a
reorder computed against one order is applied to another — which is #75, already
fixed once. A control that sorts only the fifteen rows of the current page is
the thing the marker exists to prevent: it tells the owner their four hundred
entries are ordered when they are not.

**4. `GET /api/stats/traffic` — a decision before it is an endpoint.**

The Analytics screen is invented end to end, which is why it sits inside one
`ui/Preview` rather than marking a block at a time. The reason it cannot simply
be written is #97: **the public site is static HTML served by Apache before PHP
starts**, so a visit never reaches Laravel and there is nothing to count.

Two plausible answers, both Phase 3 conversations: parse Apache's access log on
a schedule, or have the baked pages carry a one-pixel beacon. `BUSINESS.md`'s
ceiling on **support minutes per client** argues for the log — nothing to embed
in a template, nothing for a client to break, and no third party in the page.

**5. `users.theme` and `users.accent`, beside `users.locale`.**

The theme and accent live in `localStorage` because that pass added no
migrations, so a choice follows the person to their second **tab** rather than
their second machine. Two columns and a save; the panel's own half already
resolves both against an allow-list before applying them.

### 128. The flyout's own hit-area was narrower than what it showed — DONE (CHANGELOG §50)

The row stayed 44px wide even once the flyout beside it had grown to show a
name like *Facilities* - so a mouse aimed at the middle of the visible label
was, for most of its width, past the real row's edge and on whatever the
sidebar sits over. That is why the label could not be clicked along its whole
length, and it is the boundary reports of a flicker on press and a wrong
colour flashing between rows both sat on too, though neither was pinned to one
provable cause - a live probe for a browser-internal hover recalculation did
not reproduce one on demand.

Fixed by making the flyout a real `Link`, reusing the row's own address and
navigate callback, with its own `onMouseEnter`/`onMouseLeave` extending the
same open/close state the row's do - `aria-hidden` plus `tabIndex={-1}`, since
a real `<a href>` is focusable by default and a hidden-but-reachable element is
the anti-pattern that pairing exists to avoid. A short grace period
(`FLYOUT_LEAVE_GRACE_MS`) gives the flyout's own enter a window to cancel the
row's leave before either closes anything.

### 127. A click on the flyout still flickered, and its colour still lagged — DONE (CHANGELOG §49)

Not closing on navigation (#126) was not the end of it. Two things left,
described by the owner as a small flicker during the press and a stale colour
after release.

The flicker: clicking a link focuses it in most browsers, a few milliseconds
after the hover that already opened the flyout - the same open running twice
for one row, each time resetting the entrance to invisible before its two
`requestAnimationFrame`s could raise it again. Fixed by tracking which element
currently owns the flyout, so a second open for the same one merges in place
rather than restarting.

The colour: `flyout.active` was set once at hover-time, before the click that
would make the row actually current. Nothing revisited it afterwards - the
route no longer closes the flyout, and the row's own transition into
`bg-accent` ran invisibly underneath. Fixed with an explicit `activateFlyout()`
called at the moment of navigating, since a click on this rail *is* the choice.

### 126. Closing the rail's flyout on a click still wasn't smooth — DONE (CHANGELOG §48)

The fade added for #124 fixed the abrupt cut, and the owner still saw something
"weird" on a plain click. Measured live: closing on the route change made the
flyout fade out at the exact moment the clicked row's own background began its
own, differently-timed `transition-colors` into `bg-accent` - two motions of
different lengths on the same pixels, which reads as broken even though neither
one is, individually.

The fix was to stop closing on navigation at all - only the rail itself
widening still does, since that is the one case where a floating label would
duplicate one now sitting inline. The pointer never left the row it clicked, so
there was nothing to close *for*; `onMouseLeave`/`onBlur` already do this
correctly and now carry the whole job.

### 125. The entry form's heading had the module's name backwards — DONE (CHANGELOG §47)

Found by the owner opening Contact from the collapsed rail (#124): the heading
read *New entry*, big and bold, with *Contact* shrunk to the muted line under
it — every other screen puts the section's own name in the heading and a
sentence about it underneath, and `EntryEditScreen` alone had the two swapped.

Worse now than it would have been before #124: the collapsed rail names a
module with one letter, so this heading is the only place left saying which
section is open. One prop swap; `PageHeader` needed no change.

### 124. The rail's Content group is a submenu — DONE (CHANGELOG §46)

Raised by the owner the day after #117 closed. The modules in the rail each
carried a tile holding the initial of their name, because a module has no icon
of its own, and six of them stacked between two groups of line icons read as a
column of broken images. **The idea survives where it earns its place** — at
68px the label is not rendered and the initial *is* the icon — and everywhere
else `Content` is now a parent row with the sections indented under it on a
guide line.

Two things came out of doing it, and both are the reason this is worth a number:

- **`title` was the only thing naming a collapsed row.** It is a real accessible
  name, last in the computation, which is what made it comfortable to leave
  there — and replacing it with a flyout would have removed the name with it.
  The label is rendered `sr-only` now. ARCHITECTURE → *Naming controls*.
- **The group headings were at 3.56:1.** `text-sidebar-fg-muted/70` writes a
  colour the token does not name, so the file whose entire subject is measured
  contrast could not see it. The guard is general: no `text-` utility in the
  panel carries an opacity modifier.
- **The obvious animation for the flyout was the wrong one.** Growing its width
  open, seen live, read as a progress bar rather than a name appearing. It
  mounts at its finished size and fades in instead, the label a beat behind the
  highlight — CHANGELOG §46 has the numbers.

`Sidebar.jsx` had no test at all before this and has eight now.

### 123. `--ui-surface-raised` is measured against nothing — P2

`theme.css.test.js` measures `fg`, `fg-muted` and `fg-subtle` against `bg`,
`surface` and `surface-muted`, and the rail's own inks against the rail. It does
**not** include `surface-raised`, which is the ground the appearance menu paints
`text-fg-subtle` and `text-fg-muted` on.

That is the same shape as the defect the file was written for: `--ui-fg-muted`
measured 4.35:1 on `--ui-surface-muted` and nothing in the suite could see it.
Found while choosing a surface for the rail's tooltip (#124), which took
`bg-surface` instead precisely because that pair is measured and this one is not.

Adding `'surface-raised'` to the `SURFACES` list is one word. Whether it passes
is the question — measure before assuming either way.

---

### 117. The panel redesign — DONE (2026-09-10 → 2026-09-12, CHANGELOG §37–§45)

See the Amendment above for **why**, which is a business argument rather than a
visual one. This item records **how**, and the constraint that shapes it.

**The rule of this pass: appearance only.** No PHP, no migrations, no controller
changes. Which splits every screen in two:

> Whatever works today against real data **keeps** working against real data.
> Whatever is **new** and would need PHP or a query is drawn with static data,
> wears a visible marker, and leaves a TODO naming the endpoint it wants.

That covers column sorting, filters, the bulk-action bar, the dashboard and the
analytics screen. It is a deliberate choice and the reason is #76's: a control
that sorts only the fifteen rows of the page in front of you is **worse than no
control**, because it answers confidently and wrongly. The listing endpoint
takes `?page` and nothing else — `EntryController::index` is three lines — so
real sorting is `sort`, `direction` and `q` with an allow-list behind them, and
that is PHP.

**Decisions taken with the owner, 2026-09-10:**

- **Accent palettes and Light/Dark are two independent axes**, carried as
  `data-accent` and `data-theme` on `<html>`. Six accents × two themes as one
  list would be twelve blocks that drift; as two axes it is eight. The
  **sidebar keeps its own tokens, fixed dark in both themes** — the reference
  the owner chose has a dark sidebar against a light page, so it must not flip
  with the switch.
- **Deep linking, at last.** A URL per screen. `routes/web.php` has carried
  `Route::get('/admin/{any?}')->where('any', '.*')` since the panel was built,
  so the server has always been able to serve it and only the client never
  read it — **zero PHP**. Today a reload always lands on the module list, which
  a sidebar of ten destinations makes worse, and the browser's Back button
  currently leaves the panel altogether.
- **The form's right column holds only what is structural** — status, first
  published, and the per-language slug. Every schema field stays in the main
  column. The rule is not invented: `EntryForm` already separates exactly these
  into their own blocks, so the column is a move rather than a redesign. A
  per-field `column` key was considered and deferred, because it is PHP.
- **The theme choice lives in `localStorage` for now**, with a TODO: `users.locale`
  already exists and `users.theme` is where this belongs, but that is a
  migration.

#### The twenty items, in order

Each stands alone and is verifiable on its own. **Items 1–7 change nothing a
person can see** — they are the layer that makes 8–20 cheap. From item 8 onward
every screen moves.

| # | Item | Done when |
|---|---|---|
| 1 | Component test harness | ✅ a `Login` render test passes and the existing suite still does |
| 2 | `lucide-react` | ✅ an icon renders and the `npm run build` delta is measured and written down |
| 3 | The token layer + anti-flash script | ✅ flipping `data-theme` repaints, and a dark hard-reload shows no white flash |
| 4 | `lib/theme.js`, `useTheme`, `ThemeMenu` | ✅ the accent survives a reload; read/apply/fallback covered |
| 5 | `lib/router.js`, `routes.js`, `useRoute` | ✅ an entry address is pinned in both directions |
| ~~6~~ | ~~`ui/` batch 1~~ — **folded into 8**, see below | |
| ~~7~~ | ~~`ui/` batch 2~~ — **folded into 8**, see below | |
| 8 | `Shell` / `Sidebar` / `Topbar`, wired to the router | ✅ every existing screen has a URL and a reload lands on it |
| 9 | Login, two panels | ✅ a 401 still reads "Wrong email or password." under test |
| 10 | `ModulesList` restyle | ✅ real modules render; a singleton links straight to its fields |
| 11 | `EntriesTable` restyle | ✅ the reorder arrows and pagination still work **live** |
| 12 | `EntriesManager` split into two screens | ✅ `/admin/content/rooms/12` loads the real entry after a cold reload |
| 13 | `EntryForm` step 1 — `FieldInput` extracted | ✅ every field type still saves, against real data |
| 14 | `EntryForm` step 2 — three blocks, two columns | ✅ the right column holds only status, date and slug, and a save round-trips |
| 15 | Gallery + RichText restyle | ✅ an upload and a highlight are readable in **both** themes |
| 16 | The four Module screens restyle | ✅ a rename still writes redirects (#69) |
| 17 | Enquiries + Settings restyle | ✅ grouped settings save |
| 18 | Dashboard + Analytics, static | ✅ both wear a visible marker and a TODO **naming** the endpoint they want |
| 19 | Static sort / filter / bulk bar on the listing | ✅ same |
| 20 | Catalogue + docs sweep | ✅ `php artisan test` green, and the three docs updated |

Items 18 and 19 are the ones the rule at the top of this item governs: they are
drawn with static data because the listing endpoint takes `?page` and nothing
else, and making them real is PHP.

> **Amendment, 2026-09-10: items 6 and 7 are folded into 8.** They asked for
> thirteen `ui/` primitives, built and tested, **that no screen imported yet** —
> which is designing for imagined needs. This repo has already answered that
> question once, in Decisions (2026-09-05) about the generator: *"written
> **before** two of them exist automates what was imagined rather than what
> hurt. Write bookings and invoicing by hand first, then decide."* The same
> shape.
>
> Instead: the Shell extracts only what it actually needs, and each screen after
> it extracts what it lacks. A pattern's real shape is visible on its **second**
> use, not before its first. The risk this accepts is drift between hand-rolled
> components — mitigated because item 3's tokens already hold the line where
> drift is most visible, which is colour.

**Where it stands.** All twenty are done. **The PHP this pass deferred is
#122**, gathered in one place: five items, none of them blocking Phase 2.

- **1. Component test harness — DONE.** See #94, which this closed. It found two
  defects within ten minutes of existing, one of them a test file that no
  pattern collected.
- **2. `lucide-react` — DONE.** The panel had no icon library at all: ten
  hand-written SVGs, one of them pasted three times in `ModulesList` alone, and
  `↻` and `+` as text standing in for icons.

  **Measured rather than assumed**, because the bundle is already 686 kB and
  #90's lesson is that a number decides this kind of question:

  | Build | Raw | Gzip |
  |---|---|---|
  | Baseline, no icons | 686.30 kB | 212.66 kB |
  | One icon | 689.29 kB | 213.97 kB |
  | Thirty icons | 697.39 kB | 216.83 kB |

  So the library costs **~3 kB once** and **~0.28 kB raw / ~0.10 kB gzip per
  icon** after that — tree-shaking confirmed working, and the fifty icons this
  redesign wants are about 14 kB raw over baseline. That holds **only for named
  imports**: `import * as icons` defeats it and pulls all ~1,400.
- **3. The token layer — DONE.** Three tiers in `resources/css/app.css`: an
  accent ramp per palette keyed on `[data-accent]`, semantic `--ui-*` roles per
  `[data-theme]`, and `@theme inline` turning those into utilities. Anything
  written from here on inherits both axes without asking.

  **`--accent-solid` is declared per palette rather than derived, and that is
  the finding.** A fixed ramp step does not survive contact with hue:
  `emerald-600` on white measures **3.4:1** and fails WCAG AA for normal text,
  while `violet-600` measures 5.9:1 and is fine. Each palette therefore names
  the darkest step it needs — emerald, teal and amber take `700`; blue, violet
  and rose take `600`. Dark mode has no such problem and maps uniformly: a
  `400` with near-black text clears 4.5:1 for all six.

  Two rules that are not style:

  - **Every `--ui-*` is defined on plain `:root`**, and the dark block only
    re-points it. Tailwind compiles `bg-accent/50` to `color-mix(…,
    var(--color-accent) 50%, …)`, and a variable that exists only inside
    `[data-theme='dark']` resolves to nothing in light mode — the modifier goes
    silently transparent rather than failing.
  - **`@theme inline`, not `@theme`.** Without `inline` Tailwind copies the
    declarations into its own `:root`, freezing each to the value it held at
    that point, so `bg-surface` would keep light mode's white after the
    attribute flipped. Verified in the built CSS: it emits
    `--color-accent:var(--ui-accent)`, which is the live form.

  **The sidebar keeps its own tokens and stays dark in both themes**, because
  the design being copied puts a dark rail against a light page.

  The anti-flash script sits in `admin.blade.php` **before** `@vite` and is a
  classic script, while the bundle is `type="module"` and therefore deferred —
  so the attributes are on `<html>` during parsing, before anything is painted.
  Reading `localStorage` is wrapped: a browser set to block site data *throws*
  rather than answering null, and this is the first script on the page.
- **4. The theme switcher — DONE.** `lib/theme.js` (pure resolve/read/write/
  apply), `hooks/useTheme.js`, and `layout/ThemeMenu.jsx`, mounted into the old
  chrome so it is reachable before the sidebar exists.

  The stored value is **resolved against an allow-list before it reaches the
  DOM**, in both halves. A stored theme beats the system preference in both
  directions — the media query is a fallback for having no choice yet, never an
  override, or the switch looks broken to anyone whose machine disagrees.

  `theme.test.js` carries a **contract test** naming `admin.blade.php`: that
  script duplicates the keys and the allow-lists on purpose, and the test is
  what says which other file to edit when the lists change.

  Verified live over a cold reload: `light`/`amber` survived, with
  `--ui-accent` resolving to `#b45309` — amber's own tuned step.

  **A review of items 1–4 found ten things**, and the two worth carrying
  forward are both about where a value lives. The theme was being *stored* on
  mount, which turned `prefers-color-scheme` — a fallback for having made no
  choice — into a recorded decision on the first page load, permanently
  decoupling the panel from the machine. And the swatch colours had been
  hand-copied out of the stylesheet into JavaScript, where nothing could see
  them drift; they now live only in `app.css` as `--swatch-*`, with
  `theme.css.test.js` reading that file and asserting each equals the step its
  palette actually paints with.
- **5. The router — DONE.** `lib/router.js` (pure `matchPath`, `buildPath`,
  `matchRoute`), `routes.js` (the table), `hooks/useRoute.jsx`
  (`RouterProvider`, `useRoute`, `hrefFor`). **Not yet wired into the panel** —
  that is item 8, where the Shell can be verified in a browser.

  **Hand-written rather than `react-router`.** Ten routes, no nesting, no
  loaders, against ~20 kB on a bundle already at 686 kB — and a pure matcher
  runs in `environment: 'node'`, which is where this project's confidence
  lives. It is 32 tests, including a real `history.back()`.

  **Content sits under `/content/:module`, and the prefix is the decision.**
  A module slug has exactly the shape of the panel's own words, so a client
  section slugged `settings` or `analytics` would shadow that screen and become
  unreachable — and no pattern constraint can separate them, because there is
  nothing to constrain. Craft and Directus both prefix content for this reason.
  Same instinct as the public side's non-optional language prefix: one page,
  one address, no ambiguity, paid for with a longer URL.

  **The table is an array because order disambiguates**, exactly as
  `routes/web.php` declares `/admin` above `/{language}`. `routes.test.js`
  checks that invariant *generally* rather than case by case: any route made
  only of literal segments that some earlier pattern already matches is
  reported unreachable, by name. Enumerating today's pairs would pass while
  saying nothing about the pair somebody adds next.

  Three things the tests pin that were not obvious:

  - `decodeURIComponent` **throws** on a malformed escape, and `%E0%A4%A` from
    a truncated address is enough. Thrown from the matcher it would come out of
    render, so a mistyped URL would blank the panel instead of simply not being
    a route.
  - `buildPath` refuses a parameter it was not given rather than emitting
    `/content/undefined` — a link that looks right and leads nowhere is harder
    to trace than a throw at the site that produced it.
  - An address nothing matches is **rewritten** with `replaceState`, not merely
    ignored. Rendering the dashboard under `/admin/nonsense` would leave the
    URL describing a screen that is not on show.

  `RouterProvider` is a provider from the start, for the reason `ThemeProvider`
  had to become one: the sidebar navigates and the content area renders the
  result, so per-component state would move the rail and nothing else.
- **8. The Shell — DONE, and the first item anyone can see.** `layout/Shell`,
  `Sidebar`, `Topbar`, with `app.jsx` no longer holding a `view` in state: the
  route decides the screen. Every existing screen has an address, and typing
  `/admin/content/rooms` lands on it.

  **Sidebar items are anchors with real `href`s**, not buttons. Middle-click,
  ctrl-click and "copy link address" all work on one and none work on the
  other, and the click handler stands aside for every modifier so the browser
  does its own thing. A module shows its **initial in a small square** rather
  than an icon: six identical glyphs in a collapsed rail tell you nothing.

  `lib/moduleStore.js` is `languageStore` **with invalidation**, and the
  difference is the point. Languages change only when the agency runs an INSERT
  by hand, so that store caches for the life of the page. Modules are created
  and renamed *from the panel*, and since this item they are also the
  navigation — so a create that left the rail stale would be a section the
  client just made and cannot reach.

  **A colour sweep came with it, and it was not optional.** 415 hardcoded
  palette classes across thirteen components became semantic tokens. This is
  not the restyle — no layout or markup changed — it is that the panel was
  **unreadable in dark mode**: `text-gray-900` on a dark ground is black on
  black, so the sign-in card was near-white text on white and the entries
  heading was invisible. The defect arrived with item 3 and item 8 is merely
  what put a person in front of it.

  Three things the sweep turned up:

  - `bg-indigo-150` **is not a Tailwind class**. It had never painted anything,
    so that hover state has been dead since it was written.
  - White on a filled button is wrong under the dark theme, where the accent is
    a `400` and its foreground is near-black — so `text-white` became
    `text-accent-fg`, which is the token that already knew.
  - The sign-in form had no `autocomplete` on either field, so a password
    manager could not fill it. WCAG 2.2 asks for it, and a client who cannot
    use their manager picks a worse password.

  Verified live in **both** themes: the rail stays dark in light mode, which is
  the design being copied, and the accent is emerald-700 there and emerald-400
  under dark.

  **A review then found the rail had no breakpoint at all.** It was a flex
  child fixed at 256px at every width, so on a 375px phone it left 119px for
  the screen - every page in the panel unusable on a telephone, which is where
  an accommodation owner checks an enquiry. Below `lg` it is now a drawer:
  `fixed` and translated out of view, a hamburger in the Topbar, a backdrop, a
  close button, Escape, and it shuts itself when the route changes so following
  a link does not leave it hanging open. Verified at 375 and at 1280.

  Two more from the same review. `ByModuleSlug` reported **a failed request as
  "That section no longer exists."**, which tells a client their Rooms are gone
  because the wifi blinked. And the rail's section headings were loose
  paragraphs above unrelated lists, so the grouping a comment claimed was "real
  to a screen reader" was visual only - they are `h2`s with `aria-labelledby`
  now, which is what lets a reader tell the client's content from the agency's
  tooling.

  Not yet real: `entryCreate` and `entryEdit` resolve to the entries screen,
  because `EntriesManager` still owns create and edit as internal state.
  Nothing in the panel produces those addresses, so they are unreachable except
  by typing one. Item 12 splits that component and makes them true.
- **9. The sign-in screen — DONE.** Two panels: a brand half carrying the
  product's own line, and the form. The brand half is **hidden below `lg`
  rather than stacked** — on a phone it would push the form below the fold, and
  the form is the only thing anybody came here for. Its two accent washes are
  drawn from `--ui-accent`, so choosing a different accent changes this screen
  too.

  **A reveal toggle on the password**, which is not decoration: a person who
  cannot see what they typed retypes it, and on a form whose only refusal is
  *"wrong email or password"* that is the difference between one attempt and
  five — which the login limiter counts (CHANGELOG §13). It carries
  `tabIndex={-1}`, so Tab from the password reaches *Login* rather than a
  control that only changes how the text looks.

  **`Remember me` and `Forgot password` are drawn and not wired**, at the
  owner's instruction, with a comment beside them in the source and
  **#118** carrying the PHP both need. Each says *"Not available yet."* in its
  `title`, and asking for a reset explains what to do instead of doing nothing.
  A test pins that `signIn` is still called with two arguments — when #118
  lands, that assertion is what has to change, which is the point of writing it.

  The refusal banner gained `role="alert"`: it appears *after* the form was
  sent, by which time a screen reader has moved on, so it has to announce
  itself rather than only be drawn.

  Verified live, signed out and therefore in Greek — the reveal toggle flips
  the field between `password` and `text` and swaps its own label with it.
- **10. The module list — DONE.** `ui/PageHeader` and `ui/Badge` came out of it,
  both at a use that already existed: the header was **copied three times** in
  this one file, once each for loading, error and ready, and a badge is drawn
  for the singleton marker, for each missing language, and by `EntriesTable`
  for draft and published, which item 11 folds in.

  **It now reads the shared store instead of fetching for itself.** The rail is
  built from the same list, so opening this screen asked for `/api/modules`
  **twice**. Measured after: one request per page load, and Refresh drops the
  shared copy so both the table and the rail move together — two subscribers,
  one request.

  **The screen finally shows which languages a section is missing.**
  `ModuleController::index` has eager-loaded `slugs` since #114 with a comment
  saying it is there so the panel can show exactly this without a request per
  row, and nothing had ever read it. Since #114 that is not decoration: a
  module untranslated into a language **has no address there**, is absent from
  that menu and absent from the sitemap. The languages are **named, not
  counted** — "2 missing" makes somebody open the module to find out which.

  `missingTranslations` is pure and in `lib/modules.js`, and two of its seven
  tests are about agreeing with the rest of the panel rather than about the
  feature: it reads a code through `getLangCode` (`locale`, then `code`, then
  `short_code`), and treats a row that says nothing about `is_active` as active,
  which is what `languagesFrom` does. Two helpers disagreeing on either point is
  how a module reads complete on one screen and incomplete on another.

  **A singleton says so and its action reads *Open*, not *Entries*** — calling
  it Entries promised a list that is never shown, because the panel opens
  straight into the single entry.

  At 375px the table drops the Slug and Languages columns and the slug moves
  under the name rather than being lost, so the page never scrolls sideways.
- **11. The entries table — DONE.** `Badge` replaced three hand-rolled pills
  (status, and the boolean cell's Yes/No), the reorder arrows became
  `IconButton` with real chevrons, and each schema field's cell moved into a
  `Cell` component so the row is readable.

  **Three defects came out of it that were not about styling:**

  - **`Yes` and `No` were English literals outside `t()`.** No test demanded
    them - `CatalogueCoversTheCodeTest` only sees `t('…')` - so every boolean
    column read English on a Greek panel.
  - **`toLocaleDateString()` with no argument asks the *browser*'s language.**
    A Greek owner on an English Windows read `9/10/2026` and could not tell
    September from October. `lib/format.js` now reads the panel's own locale;
    `EntryForm`'s *First published* had the same bug **and** was an untranslated
    literal, and is fixed with it.
  - **The Edit button was `opacity-0 group-hover:opacity-100`.** A touch screen
    has no hover, so on a phone or a tablet the only way to open an entry was
    invisible.

  The wrapper's negative margins are gone too: they existed to escape the old
  page padding and now fought the Shell's, so a table wide enough to need
  scrolling took the whole page sideways instead of scrolling in its own box.

  **Verified live against 18 real entries.** Seventeen were created through the
  API and deleted afterwards, per CLAUDE.md. Pagination read *Showing 1–15 of
  18* and *Page 2 of 2*; a move on the first row of page 2 swapped it with the
  last row of page 1 and the server's own order confirmed the write - which is
  #75's fix still holding, since the arrows work on the module's order rather
  than the page's.
- **12. Two screens, and entry addresses that are real — DONE.**
  `EntriesManager` held the listing *and* the form and chose between them with
  a `view` string. That string was the panel's only record of where you were,
  so the form had no address at all and a reload threw the work away. It is now
  `screens/EntriesScreen` and `screens/EntryEditScreen`, and the router
  decides; the old component is deleted.

  **The guard that made this worth doing carefully.** `EntryForm` seeds its
  state in `useState` initialisers from `initialData` and `languages` - so
  mounting it before the entry arrives does not merely show a blank form, it
  *captures* blank as the entry's content, and the first save writes that over
  whatever was there. A deep link is precisely the case that would do it, so
  `EntryEditScreen` renders nothing until both have landed. Verified by cold-
  loading an entry with content: `sleeps`, `size_m2`, `price_from` and the
  title all arrived seeded.

  **The page moved into the query string**, and that was forced by the split
  rather than chosen for elegance: held in state it was lost the moment the
  form replaced the listing, so editing an entry from page two and saving
  returned the reader to page one. `?page=2` is now part of the address, which
  also makes it survive a reload and a bookmark. Page one is the plain path -
  `buildPath` drops empty query values, so there are never two URLs for the
  same fifteen rows - and a page past the end still clamps, with the address
  following it back.

  **Three navigations use `replace`**, which is what that option existed for: a
  singleton opening straight into its entry, a create becoming an edit once the
  entry has an id, and paging. Pushed instead, Back would walk into a create
  form for an entry that already exists, or bounce off a singleton that
  immediately sends the reader forward again.

  `EntryForm.onSaved` now hands back the saved row, because a create has to
  know where it landed. All three entry endpoints already answer with the row
  read back from the database (ARCHITECTURE §5), so it is the whole entry.

- **13. `FieldInput` extracted — DONE.** `renderInput` was a closure inside a
  530-line component, so the branch choosing between **eight field types** could
  not be reached without mounting the whole form, its language tabs and its
  error plumbing. It is `components/entry/FieldInput.jsx` now — props in, no
  state — and `EntryForm` is 410 lines. Fourteen tests, one per type.

  **Two more untranslated literals, both outside `t()` and therefore invisible
  to `CatalogueCoversTheCodeTest`:** `-- Select Option --`, which made every
  select in the panel read English, and `` `Enter ${field.name}...` ``. The
  second was **removed rather than translated** — it printed *Enter title…*
  directly beneath a label already reading "title", which is noise, and it was
  built from a schema key that can never be translated anyway.

  `ui/Input` collects the class string that had been copied into four
  components and had already drifted in its vertical padding.

  **Verified against a probe module carrying all eight types**, filled through
  the interface and saved: string, rich text, integer (coerced to a number),
  boolean, date, select, a real PNG upload, and a gallery. Every one round-
  tripped through the API. The module, its entry and the uploaded file were
  removed afterwards — there is no module-delete endpoint, so that was a
  scratchpad script, as CLAUDE.md prescribes.

  One test worth naming: `value` arrives **null** for a field nobody has
  filled, and React turns `value={null}` into an *uncontrolled* input — which
  warns and then stops tracking what is typed. `?? ''` covers it and a test now
  pins it.

- **14. Two columns — DONE.** The three blocks `EntryForm` already had became
  `StaticFields`, `TranslatableFields` and `PublicationPanel`, with
  `FieldErrors` shared by the first two. The form is **281 lines**, from 530
  before item 13: state, `handleSubmit` and the error routing never moved.

  **The rule for the side column is the database's, not a layout preference.**
  It holds status, first-published and the per-language slug — the three things
  that mean the same for *every* Module, which is exactly why they are indexed
  columns rather than keys inside `data` (ARCHITECTURE §2). A schema field never
  belongs there however well it would fit: which fields a Module has is the
  client's decision, so a column that sometimes held one would move under them
  as they edited the schema.

  **Two columns from `xl`, not `lg`.** The rail already takes 256px at `lg`, so
  splitting there leaves both halves too narrow to be worth it — a form squeezed
  into half a laptop is worse than one honest column. The side column is sticky,
  because the form is as long as the Module's schema and nobody should scroll
  back to the top to publish what they have just written.

  Verified live at 1440: the grid measured `727.2px 320px`, the side column held
  only the four slug boxes and the two status buttons, and **no schema field
  appeared in it**. A save changed one thing in each column — `sleeps` on the
  left, the Greek slug on the right — and both round-tripped while `status` was
  left alone, which is #86's rule still holding. The entry was restored
  afterwards and the `redirects` table checked for debris: none.

  **A review then found the page fix was half-done, and both screens untested.**
  The page went into the listing's address and nowhere else, so opening an entry
  lost it and saving still returned the reader to page one - the regression this
  item claimed to have ended. It now travels into the entry's address and back
  out. And a singleton whose listing failed showed *Loading…* for ever, its own
  message sitting below an early return and unreachable.

  Both were wiring defects, which is what #94 said the harness was for and what
  the first pass had not used: **the two screens now carry sixteen tests**, and
  removing either fix fails them. The mount guard - the one that stops a blank
  form being saved over a real entry - is pinned by four.

  **A second review found the same shape one level down**, and it is the third
  round in a row to do so: four components were extracted in this item and one
  of them had a test. Ten findings, the worst of them real defects rather than
  polish:

  - **`TranslatableFields` rendered with no resolved language.** `FieldErrors`
    reads a null `langCode` as *not translatable, show everything*, so a form
    whose active id matched no row put **every** language's complaints under
    **every** box - #96's defect arriving through a different door. It now
    refuses to render and says so.
  - **`FieldLabel` pointed `for` at nothing** for rich text and gallery. Neither
    is a labelable element, so the association resolved to nothing: no
    accessible name, clicking did nothing, and the markup claimed otherwise.
    Those two are named with `aria-labelledby` on a `role="group"` now.
  - **The boolean carried two labels**, its field name and *Enable this field*,
    which every reader announces differently. The second is a `span`.
  - `activeLangId` could resolve to null while languages existed; a dangling
    `@param` sat above a `return`; the spinner ignored `prefers-reduced-motion`;
    `PublicationPanel` had a raw `<input>` beside `INPUT_CLASSES` instead of the
    `Input` it was extracted alongside.

  **The fix round is 33 new tests** - `FieldBlocks.test.jsx` over the three
  blocks and `FieldErrors`, and `EntryForm.test.jsx` over the wiring that never
  moved: the payload, #86's omission rules, and the jump to a failing language.
  All twelve fixes were mutation-tested, each breaking exactly the test that
  covers it and nothing else.

  Verified live against MySQL on a probe module carrying all eight field types:
  every `for` resolved, every composite control was named, no control had two
  labels, and a save that failed on Greek while English was open **switched to
  Greek**, marked that tab in words as well as in colour, and filed the one
  message under the Greek box alone. Error text measures 6.2:1 light and 9.9:1
  dark. The probe was deleted afterwards.

- **15. Gallery and rich text — DONE.** The criterion was *readable in both
  themes*, and measuring found the panel's worst contrast failure so far.

  **`prose` brings its own palette and it is not the panel's.** The editor wears
  `prose` for its type scale and list markers, and the plugin paints
  `--tw-prose-body` a fixed gray - so the words a client had typed measured
  **8.4:1 on the light surface and 2.01:1 on the dark one**. The surface was
  tokenised in item 3 and the text was not, and nothing failed: the one place in
  the panel where switching theme made the *content* unreadable. Twelve
  `--tw-prose-*` variables now point at `--ui-*`, and the list is the
  **server's** - `RichTextDocument::NODES` and `::MARKS` decide what can be
  stored, so a colour outside it would be paint for markup that cannot survive a
  save.

  **Then the same question was asked of the gray tiers, and two of them failed.**
  `--ui-fg-muted` measured **4.35:1** on `--ui-surface-muted` in light - the pair
  under every card's secondary line and every small-caps label - and
  `--ui-fg-subtle` measured 2.5:1. Light's pair moved one step darker
  (slate-500/400 → slate-600/500), which is the asymmetry light mode needs: a
  light surface wants darker ink than a dark surface wants lighter ink. Dark was
  already fine and is untouched. **`theme.css.test.js` measures all of it now**,
  at 4.5:1 for the two tiers that carry sentences and 3:1 for the hint tier -
  the same *measure, do not eyeball* rule item 3 settled for `--accent-solid`.

  The toolbar is twelve `lucide` icons instead of `H1 B I S` and four translated
  words, and each carries `aria-pressed`: whether the selection is bold was
  information a sighted reader had and nobody else, the same defect the language
  tabs had. `role="toolbar"` names the set.

  **The gallery's alt boxes are labelled** - what the owner asked for by name.
  Two photographs in four languages is eight identical boxes, and the language
  code was a `span` beside an input, which associates with nothing. Each image is
  a `role="group"` named by position; each box carries a real `label`; and the
  three controls read *Move image 2 up* rather than *Move up*, because a column
  of identical buttons says nothing about which row you are standing in.

  `ui/FileInput` collects the `file:` class string, which existed in **three**
  copies and had already drifted - two painted the button `accent-text`, the
  colour for text on the *page*, where one used `accent-soft-fg`, the one that
  belongs on `accent-soft`. `INPUT_LABEL_CLASSES` did the same for the small-caps
  label.

  **Measured live**, on a real upload through the real endpoint, in both themes
  and two accents:

  | | light | dark |
  |---|---|---|
  | rich-text body | 17.85 | **15.37** (was 2.01) |
  | highlighted text | 15.45 | 4.58 |
  | toolbar control, on | 5.48 | 9.79 |
  | toolbar control, off | 6.92 | 5.71 |
  | gallery language label | 7.24 | 6.14 |

  Two readings had to be taken twice, and both lessons are worth keeping: the
  first was caught mid-`transition-colors` and reported a colour the panel never
  rests on, and the second came from a hand-rolled parser reading the three
  numbers out of `oklab(…)` as if they were RGB. The figures above are painted
  to a canvas and read back as pixels, composited through the row's own
  transparency. **A contrast number that was not measured on settled, composited
  pixels is a guess.**

  30 tests: the two editors had none between them. Every fix was mutation-tested.

- **16. The four Module screens — DONE.** `ModuleBuilder`, `ModuleFields`,
  `ModuleTranslations` and `ModuleTranslator`, which between them had **no
  tests at all** and the worst labelling in the panel.

  **Every label in `ModuleFields` was `sm:hidden`.** Above 640px there was no
  label at all - field name, type and validation sat as three unnamed boxes in a
  row with no column headings either - and on a telephone, where they did
  render, they carried no `htmlFor` and the inputs no `id`, so they named
  nothing there either. The select's options box had no label at any width. The
  only two controls that *were* named were named `Lang` and `Req`, which is an
  abbreviation rather than a name. Same shape in `ModuleTranslations`: two boxes
  per language, their labels associated with nothing, the code beside them a
  `span`. Four languages and one field row is eleven controls, and a reader
  could name none of them.

  Each field row is now a `role="group"` named by position and each language a
  group named by its code; every control has a real label; and the flags are
  written out. This is the third screen in a row where the fix was the same one,
  which is why it is worth naming as a pattern rather than three bugs:
  **a `span` beside an input is not a label, and a label hidden by a breakpoint
  is not one either.**

  **The locked reason was in a `title` on a disabled control**, which is
  unreachable by design: a disabled control takes no focus and fires no pointer
  events, so neither keyboard nor hover could get at it. #115's whole
  explanation of why four boxes are grayed out was invisible. It is text on the
  page now, with the gallery's reason beside it.

  **`ui/Alert` was extracted on its sixth copy**, which is five too late - and
  only the first of those six announced itself. A banner that appears after a
  failed save is the one thing on a screen that has to interrupt: it arrives
  after the press, often below the fold, and without a live role the person is
  left on a form that did nothing. `role` lives in the component rather than in
  a class string for exactly that reason, and it is `status` rather than `alert`
  for anything that is not a failure.

  Also: `FIELD_TYPES.map((t) => …)` **shadowed the `t` import** for the length
  of the expression, so a `t('…')` added inside it would have called an option
  object. Renamed while the file was open.

  **The criterion, verified live against MySQL**: a probe module with a
  published entry, renamed through the restyled screen - not through the API -
  and the `redirects` table then held exactly the two rows #69 promises:

  ```
  301  /en/old          ->  /en/brand-new
  301  /en/old/a-page   ->  /en/brand-new/a-page
  ```

  Both old addresses answered **301** over real HTTP and both new ones **200**.
  The module, its entry and both redirect rows were removed afterwards, and the
  table is back to zero.

  58 tests, and every fix mutation-tested. **One mutation did not bite**, which
  is the result worth keeping: removing `defaultLangCode` from the builder's
  name still passed, because the test typed Greek first and the fallback
  therefore happened to give the same answer. Typing English first makes the two
  paths distinguishable. A mutation check that finds nothing proves the code;
  one that finds a survivor proves the test.

### 121. Every control on the Settings screen is unnamed — DONE (item 17)

Found on 2026-09-11 while reviewing item 16. `SettingsManager.jsx` contains
**no `htmlFor` at all**: its `<label>` sits as a *sibling* of the control rather
than wrapping it, so the association is never made and every settings input -
text, boolean, image - is announced as an unnamed box.

It is the same defect item 16 fixed one screen along, and the third file to
carry it, so the rule from CHANGELOG §39 applies unchanged: a label that neither
wraps its control nor points at it is not a label.

**Not fixed inline, deliberately.** The screen is item 17's and the fix is not
one line: the fields are generated from `SiteSettings`' schema, so the ids have
to be derived from `field.name` and threaded through `renderField`, and the
file-input branch should then take the `FileInput` **component** rather than the
bare `FILE_CLASSES` string it uses today. `ui/FileInput.jsx` carries a note
saying exactly that and naming this item.

- **17. Enquiries and Settings — DONE.** The criterion was that grouped
  settings save, and #121 was already waiting here.

  **`SettingsManager` had no `htmlFor` anywhere.** Its `<label>` sat as a
  *sibling* of the control rather than wrapping it, so nineteen boxes - text,
  select, switch, picker, and two boxes per language for each translatable
  setting - were every one of them unnamed. Testing-library states the defect
  better than prose does: *"Found a label with the text of: Site name, however
  no form control was found associated to that label."* The ids come from
  `field.name`, which is the one thing the server guarantees is unique, and
  `renderField` now takes the id it must carry rather than inventing one.

  **Two more that the tests turned up while fixing it**, both of which had been
  shipping:

  - The `boolean` branch rendered its **own** `<label>` carrying `field.label`,
    underneath the field label already showing it - the words printed twice and
    the control had two labels.
  - A 422 was shown **twice**: once in the banner and once beside the field,
    because the banner took `errorSummary` rather than `messagesNotForFields`.
    `EntryForm` settled that rule; this screen never got it.

  **`EnquiriesManager` formatted dates in the browser's locale.** It called
  `toLocaleString()` and `toLocaleDateString()` with no argument, so a Greek
  panel on an English machine printed `9/3/2026` for the third of September -
  which reads as the ninth of March. `lib/format.js` was written in item 13
  after the identical defect in `EntryForm`; this file kept its own two
  one-liners and never received the fix. Dates are `<time dateTime=…>` now, so
  the machine gets the ISO value and the reader gets their own language.

  `ui/Pagination` is extracted at its second use: `EntriesTable` and this screen
  ask the same question of the same shape, and the second copy had already
  drifted - still carrying the arrows and the older button styling that item 11
  removed from the first.

  Each enquiry is its own `<article>` named by whoever sent it, and the delete
  control carries *Delete the enquiry from :name* in the accessibility tree
  while still reading `Delete` on screen: a column of identical buttons says
  nothing about which row it belongs to, and spelling the sender out in the row
  would be a sentence where a verb belongs.

  **Verified live against MySQL**, on the demo site's real settings. A field
  from each group and one language of a translatable field were changed and
  saved: `page_cache` true → false, the telephone, and the Greek address. All
  three round-tripped, **English and French were untouched**, every field
  nobody edited survived the whole-form send, and *Αποθηκεύτηκε.* was announced
  through `role="status"`. The three originals were then restored and read back
  byte for byte. The screen reports nineteen controls, **zero unnamed, zero
  double-labelled, zero labels pointing at nothing**, and the two translatable
  settings as named groups of four labelled boxes each. Lowest contrast across
  both screens and both themes: 5.48:1.

  42 tests where there were none, and all eleven fixes mutation-tested.

- **18. Dashboard and Analytics — DONE.** Both were a `Placeholder` reading
  *This screen is not built yet*, which the route table has now stopped
  rendering; the component is deleted and its string dropped from both
  catalogues.

  **The phase rule was applied rather than assumed: real where an endpoint
  already exists, invented where one does not.** `/api/modules` and
  `/api/enquiries` are served today, so the Dashboard's section count, enquiry
  total and three most recent enquiries are this site's own. What is missing is
  a count of entries per module, so that block - and only that block - is drawn
  and marked.

  `ui/Preview` is the marker, and it is a `region` named by its own warning, not
  a tint: a dashboard showing *47 room views last week* convincingly is worse
  than one showing nothing, because the owner makes a decision on it. That is
  CHANGELOG §27's lesson one layer up, where a green test described a world that
  did not exist.

  **Analytics sits inside one `Preview` entirely**, because nothing on it is
  real and a marker around part of a screen implies the rest did not need one.
  Its TODO is the interesting half: the screen wants `GET /api/stats/traffic`,
  but **that is not one endpoint's worth of work** - the public site is static
  HTML served by Apache before PHP starts (#97), so a visit never reaches
  Laravel and there is nothing to count. The two plausible answers are parsing
  Apache's access log on a schedule, or a beacon the baked pages carry, and
  `BUSINESS.md`'s ceiling on support minutes is the argument for the log:
  nothing to embed, nothing for a client to break. That is recorded in the file
  rather than decided here.

  `screens/preview-markers.test.js` reads both files and **checks the item's own
  definition of done**: each wears the marker, and each leaves a TODO naming a
  verb and an `/api/` path. *Make this real later* is not a task;
  `GET /api/stats/entries` is.

  **Two findings on the way**, both mine and both caught by the suite rather
  than by reading:

  - A docblock containing a quoted `t(…)` example **appeared to break the
    catalogue test** — and it did not. `CatalogueCoversTheCodeTest` strips
    comments before scanning; the report came from an ad-hoc script written that
    session which did not, and its output was mistaken for the suite's.
    Corrected in item 20.
  - `t('Sections')` means two different things. The sidebar uses it for its
    `nav` label, where Greek correctly reads *Ενότητες πλοήγησης*; on a card
    counting content that is wrong. **A catalogue maps one key to one string and
    cannot tell two senses of an English word apart**, so the only lever is to
    pick a different key - the card uses `Modules`, which the panel already
    reads as *Ενότητες* everywhere else.

  Verified live in both themes: the Dashboard shows the real six sections and
  the real enquiry, with all six invented counts inside the marker and **nothing
  invented outside it**; Analytics has zero headings outside its marker and its
  bar chart is `aria-hidden` with a sentence carrying the same range. Lowest
  contrast across both screens and both themes: 4.84:1.

  23 tests, and all ten fixes mutation-tested.

  **A review over item 18 found nine, and the first was live.** The Dashboard
  drew a failed load as an empty site: the catch set an error, `finally` cleared
  `loading`, and the empty defaults then rendered *No sections yet* beside the
  alert - an owner whose network blipped was told their content was gone. That
  is `ByModuleSlug`'s defect again, where a failed fetch once read *That section
  no longer exists*.

  The fix is three things, not one. A `failed` state kept **apart from**
  emptiness, so the screen can tell "there are none" from "these could not be
  read". `Promise.allSettled` instead of `all`, because three independent
  requests were collapsing into one all-or-nothing result and an unreachable
  inbox discarded the sections that had already arrived - the reasoning
  `GalleryEditor` already records for keeping the uploads that succeeded. And a
  *Try again*, because a screen that can fail needs a way out of the failure.

  Also fixed: `ui/Preview` announced the default sentence over a caller's note,
  which on the Dashboard **reversed the meaning** - the visible text said only
  the counts are examples while the region announced that everything was;
  `ui/Link` is extracted at the click guard's third copy, the two newest of
  which had dropped `SidebarLink`'s `defaultPrevented` check; the stat cards
  state their accessible name rather than leaving *6Modules* to be joined by
  whatever the engine does; Analytics stopped inventing an enquiry count that
  contradicted the real one on the dashboard; and `preview-markers.test.js` got
  a name that matches what it checks.

  **One finding is recorded and not fixed**, because it cannot be: the item's
  thirteen Dashboard tests were written after the screen and passed on the first
  run, against CLAUDE.md's first rule. That is how the misleading test name got
  in. Every fix in this round was written test-first and confirmed red.

- **19. The listing's action bar — DONE.** Tick boxes, a bulk bar, and sort and
  filter drawn behind the marker.

  **The split follows the rule rather than the item's title.** `DELETE` on an
  entry exists, so **bulk delete is real** - n requests, no new PHP. The listing
  endpoint takes a page and nothing else, so sort and filter are drawn,
  **disabled**, and marked.

  **And bulk publishing turned out to need PHP, which only the live check
  found.** `PUT { status }` alone answers 422: `SchemaRuleBuilder::build()`
  hard-codes `data` as `required` and both entry requests share it. Sending the
  whole document back instead would re-post everything the listing happened to
  be holding - #86's defect pointing the other way - so the two publish controls
  are drawn, disabled, and carry the reason in their **accessible name**, not a
  tooltip a disabled control cannot deliver. **701 tests were green and twelve
  mutation checks had passed while the feature did not work.**

  `lib/selection.js` holds the tick logic as pure functions, for the reason
  `moduleFields.js` gives: three defects shipped in one commit while that kind
  of logic lived in a component, and this one decides what a **delete** acts on.
  Ids compare as strings, because they arrive as numbers from JSON and strings
  from the DOM. `screens/bulk.js` applies an action with `allSettled` and
  reports *2 of 3 could not be done* - a delete that half-succeeded cannot be
  undone by retrying the set.

  A selection is **per page**, derived through `onlyPresent` rather than cleared
  in an effect, so no render exists in which the bar names a count the page no
  longer holds. Deleting **asks first**; publishing would not have, because it
  is reversible by the button beside it.

  **Verified live against MySQL** on a probe module of five entries: two were
  ticked, the bar announced *2 επιλεγμένα*, the two publish controls were
  disabled and said why, Delete asked *Οριστική διαγραφή 2 εγγραφών;* and after
  confirming the database held exactly the other three. The probe was removed.

  53 tests, and twelve mutation checks.

- **20. The catalogue and docs sweep — DONE, and it found a hole in the
  mechanism it was meant to tidy.**

  The sweep began by asking the obvious question nobody had: the catalogue was
  checked in one direction only. `CatalogueCoversTheCodeTest` fails on a string
  the catalogue lacks; nothing failed on a **key nothing asks for**, and a
  catalogue is the list a translator works from — `BUSINESS.md` prices adding a
  language as a billable service, so every orphan is a sentence somebody is paid
  to translate into a language nobody reads it in. Three had arrived in one item
  of this redesign alone, when `Lang` and `Req` became `Translatable` and
  `Required`.

  `CatalogueHasNoOrphansTest` reported **twenty-one** — and most of them were
  plainly in use. That was the finding: `accept="image/*"` ends in a slash and a
  star, which the comment stripper read as the start of a block comment, so
  **everything from there to the next real terminator was thrown away before the
  scan ran**. In `GalleryEditor.jsx` that is 4,700 characters. The consequence is
  the guarantee reversed: `CatalogueCoversTheCodeTest` was passing on the three
  files with an image picker **because it could not see them**. A comment opener
  now has to look like one, `TranslatedLiteralsTest` pins it, and the scan
  itself moved to `tests/Support/TranslatedLiterals` so both directions read the
  code the same way.

  With the hole closed, eleven real orphans remained. Nine were the **field type
  names** — `String`, `Gallery`, `Boolean` and the rest — translated into Greek
  by somebody and never asked for, because the dropdown labelled its options by
  capitalising the generated key. They are `FIELD_TYPE_LABELS` now, written as
  literal calls so the scan can see them, with a test that fails if
  `fieldTypes.json` and the map ever disagree. Two were genuinely dead and are
  deleted.

  **A claim in CHANGELOG §41 was wrong and is corrected there.** That entry said
  a docblock containing a quoted example broke the catalogue test. It does not —
  the scan strips comments. What reported it was an ad-hoc script written that
  session which did not, and its output was mistaken for the suite's; a comment
  was then reworded to satisfy a rule the codebase does not have. The lesson
  survives pointed the other way: **check the tool that enforces the rule, not
  one that resembles it.**

  Docs: `ARCHITECTURE.md` gained four sections the redesign had never recorded —
  how the panel is put together (tokens, the `ui/` vocabulary and why each
  primitive waited for its second use), what a screen must do with a failure,
  the rule that invented figures wear a marker, and the naming rule that four
  screens in a row got wrong. `CLAUDE.md`'s file tables and component list were
  four items out of date.

  **Its own review found eight, five of them in that scanner.** The comment
  fix had asked the wrong question — *what precedes this slash* rather than *is
  this slash part of a word* — so it stripped the mime pattern and stopped
  stripping every comment that follows punctuation: `foo(/* … */)` counted a
  commented-out call as a real one, which demands a key nothing renders and
  keeps a dead one alive. `(?<![\w/])/\*` and `(?<![\w:])//` ask the right
  question, and a data provider pins the four forms. The skip list covered
  `.test.js` but not `.test.jsx`, which matters now that the orphan check reads
  the same scan — a test is not a call site that ships. `inPhp` and `inBlade`
  had no tests of their own, which is §44's own lesson applied to §44's own
  work: a scanner reading too little reports success either way. And
  `everywhereCoreTranslates` merged its three scans, so a string translated on
  both sides was attributed to whichever ran last, when naming the file is the
  map's whole purpose.

  The eighth was in the fix itself: `FIELD_TYPE_LABELS[type]()` is `undefined()`
  for a generated type the map does not name, so a field type added in PHP took
  both screens that create a field to the ErrorBoundary — where the code it
  replaced had merely shown an English word. `fieldTypeLabel()` falls back to
  the capitalised key: **a missing label is a missing translation, not a dead
  screen**, with the list-comparison test still the enforcement. It moved to
  `lib/moduleFields.js` while it was open, because what a type is called is a
  data question and answering it in a component meant importing lucide and two
  `ui/` primitives into a jsdom test.

  531 PHP tests, 719 JS tests.

### 119. The entry form offers a language the site has switched off — P2

Found live on 2026-09-11 while verifying #117 item 14. French is
`is_active: false` in the development database, and the entry form still draws
an **FR tab** and an `slug-fr` box. An author can write a French translation and
give it an address for a language that has no public pages at all.

Pre-existing, and a deliberate consequence rather than an oversight:
`LanguageController` returns every language since #114 so a **Module** can be
translated ahead of going live, and `EntriesManager` carried a comment saying
exactly that. What nobody decided is what an **Entry** form should do with one.

The two screens already disagree. `ModuleTranslations` marks an inactive
language visibly; the entry form says nothing. `contentLangCode` excludes them
from the opening tab (#116) but not from the tabs themselves.

Three possible answers, and the owner picks: hide inactive languages in the
entry form; show them marked, the way the module translator does; or keep them
plain and accept that translating ahead is the point. **Showing them marked is
the likely one** - it matches the screen that already solved this, and writing
ahead of a launch is a real thing an agency does.

### 120. A validation message says `data.title.el` to the client — P2

Found live on 2026-09-11, in the same session. A required translation left empty
answers *"Το πεδίο data.title.el είναι υποχρεωτικό."* - the attribute path,
raw, in the sentence an accommodation owner reads.

It is correct and unusable. The panel puts the message under the right box, in
the right language tab, so the path carries no information the position does not
already give - it only makes the sentence look like a stack trace.

The fix is PHP and therefore not this phase: `SchemaRuleBuilder` knows each
field's name and its language, so it can hand Laravel an `attributes()` map
turning `data.title.el` into the field's own name. **Where it goes is the
question worth thinking about** - a schema field's name is the client's word and
untranslatable, so the sentence will read *"Το πεδίο title είναι
υποχρεωτικό."*, which is better but still half English. The language belongs in
the wording rather than in the attribute.

### 116. The panel's language decides which content language it opens on — DONE (CHANGELOG §32)

Raised by the owner on 2026-09-07: the panel had el/en, the site had el/en/fr,
and switching the panel to English still listed every module and entry in
Greek. *"If I am an English speaker and I switch the panel to English to find
my way around, I want the listings in English too."*

Right, and it does not contradict #96's split. Those remain different axes —
files on disk against rows in a table, and a German owner may well run a Greek
and English site — but *where they overlap*, following is obviously what
somebody meant. Leaving the interface translated and the content on the default
is the half of the job nobody asked for.

The rule, as the owner put it: **follow the panel when the site has that
language, and fall back to the site's default when it does not.** A panel in
German over a site of el/en/fr opens on Greek; a panel in English over the same
site opens on English.

`contentLangCode(languages, panelLocale)` in `lib/languages.js` decides it, and
it decides the **initial** language only — the selector still switches it by
hand. Switching the panel's own language reloads the page, so the two cannot
drift apart while somebody is looking at them. An **inactive** language is
excluded: it is offered in the panel so it can be translated ahead of going
live (#114), which is not a reason for a listing to open on it — and the
review made that true of the fallback as well, which reached `is_default`
without looking at `is_active`.

Four screens read it: the module list (the names — the Slug column beside
them stays the panel's own key), the entries table, that screen's own heading,
and the entry form's opening tab. `lib/modules.js` holds the name decision the
first two share, and `lib/languageStore.js` fetches the language list once per
page load for all five screens that want it.

### 115. A Module's schema is editable, additively — DONE (CHANGELOG §31)

Raised by the owner on 2026-09-07, immediately after #114's rename screen
landed: *"why can I only rename? I might want to add a column. Leave out
deleting a column or renaming one or changing its type, but what harm do the
rest do? Why can I not make a field required after creating a module?"*

None, and the objection was right. See **To discuss** → *What does editing a
Module mean for its Entries?*, which is now settled: additive edits only.

| Allowed | Refused, needs a migration |
|---|---|
| add a field | rename a field |
| reorder fields | remove a field |
| `required` | change a `type` |
| `validation` | flip `translatable` |
| a select's `options` | |

`translatable` is the one that was not on the owner's own list and belongs
there: it decides whether a stored value is a scalar or a map of language to
value. `EntryPresenter` guards with `is_array`, so turning it on does not
crash - it prints the Greek text on the French page, which is worse.

`PUT /api/modules/{module}` takes a `schema` and refuses the four; `ModuleFields`
is the shared editor and **disables** them on a field that already exists,
rather than letting somebody fill in a form the API will reject.

### 114. A Module has no translation, and the front site shows it — P0

Raised by the owner on 2026-09-06, from three live URLs:

```
/el/ypiresies/proino
/en/ypiresies/breakfast
/fr/ypiresies/petit-dejeuner
```

The **entry** is translated; the **module** is not. `modules` holds one `name`
and one `slug`, so every language gets the Greek transliteration in the middle
of its address. It is not only the URL — checked live on `/fr/ypiresies`:

| | What a French visitor gets |
|---|---|
| URL | `/fr/ypiresies/petit-dejeuner` |
| `<title>` and `<h1>` | **Υπηρεσίες** |
| The home page's menu | the Greek names of every module |
| `hreflang` alternates | three URLs that share one Greek segment |

**This is the product's one differentiator failing in the shop window.**
BUSINESS.md puts the whole argument on multilingual-by-data-model against a
cheap WordPress build, and this is the first thing a client sees in a demo.

### What it touches

Fourteen call sites compose an address or print the name from those two
columns: `PageController` (three actions, both alternate builders),
`SitemapController` (three), `StaticPages::forgetEntry` and `forgetModule`,
`StoreEntryRequest`, and the theme's `home` and `module` templates.

And **there is no endpoint that updates a Module** — `ModuleController` has
`store` and `index` and nothing else. Today a name and slug can only be set at
creation, so this item either brings module editing with it or ships as a
hand-written migration for existing rows.

### The decisions it rests on

1. **Rows, not JSON.** `module_slugs`, mirroring `entry_slugs`. The public
   lookup `Module::where('slug', …)` runs on every cache miss and #56 already
   settled that it has to stay one indexed read — a JSON column would make it
   a scan. Same reasoning, one level up.
2. **The name is content**, so it is translated per *content* language and the
   panel shows it in the content language already selected. Not the panel
   locale: that is #96's other axis, files rather than rows.
3. **A module untranslated into a language has no page there.** *Decided by
   the owner, 2026-09-06.* The rule entries already follow: no slug in a
   language means no address in it, the listing does not show it and the
   sitemap does not advertise it. The cost is accepted — a client who adds
   French sees an empty menu until they translate — and the alternative was
   rejected because falling back to the default language's slug is exactly
   what produced `/fr/ypiresies` and tells Google a Greek address is a French
   page.
4. **Existing addresses are translated too, and #69 comes with this item.**
   *Decided by the owner, 2026-09-06.* `/en/ypiresies/breakfast` becomes
   `/en/services/breakfast`, so every URL a live site already has changes —
   which is a mass 404 on the day of delivery unless redirects ship in the
   same change. #69 stops being *first real client* work and becomes step
   three of this one.

### The three steps

Each is separately verifiable, and the order is what keeps the site working:

1. **The data and the public side — DONE** (CHANGELOG §29). `module_slugs`,
   a per-language name, the lookup, all fourteen call sites, and a migration
   that gives every existing row its current slug in every active language.
   Verified on the live database: 39 rows for 13 modules across three
   languages, and the three addresses this item was raised about still
   answered 200 immediately afterwards. Then `ypiresies` was translated by
   hand and `/fr/prestations/petit-dejeuner` served a page titled
   *Petit-déjeuner* with all three `hreflang` alternates pointing at real
   addresses — while `/en/ypiresies/breakfast` answered **404**, which is
   step 3's whole reason for existing.
2. **The panel — DONE** (CHANGELOG §30). `PUT /api/modules/{module}`, the
   first endpoint that has ever edited a Module; per-language name and address
   fields in `ModuleBuilder`; and `LanguageController` no longer hiding a
   language the public site has not published.

   **It also has to let the panel see inactive languages**, and that is what
   blocks the agency's billable workflow rather than being a nicety.
   `LanguageController::index` filters `where('is_active', true)`, so one
   endpoint serves two audiences that need different answers:

   | The language is | The public site | The panel |
   |---|---|---|
   | active | switcher links to a half-empty site while the client works | can translate |
   | inactive | correct — 404, not offered | **cannot see it at all** |

   Neither is usable. The agency inserts the language, the client fills it in,
   and only then does it go live — which needs the panel to list every language
   with its state, while `activeLanguages()` keeps deciding what a visitor
   sees. That split exists everywhere else already; this endpoint was the one
   place it did not. **Fixed with step 2.**
3. **#69 redirects — DONE** (CHANGELOG §33). A rename writes its own rows:
   the listing, and every entry page underneath it in that language. Verified
   live — `/en/zz-services/zz-breakfast` answered 301 to
   `/en/zz-facilities/zz-breakfast` from Apache, against MySQL.

### Sequenced

Bigger than #98 — comparable to #56/#57/#58. It also has to land **after
#96's review**, because the panel screens it adds are new translated
interface, and before **#62**, or the bought theme is wired to the old shape
and done twice.

### 113. A module slug with a space in it is unreachable — P2

`pages:warm` reported three addresses it could not bake, all of one module
whose slug is `τεστ κεις`. They answer **404**, and not because of #97: the
`module` route pattern is `[a-z0-9]+(?:-[a-z0-9]+)*`, so that module has had no
public page since #59 — the bake only made it visible.

It is development data, so nothing is broken for a client. What is worth
knowing is that **nothing stops the row existing**: `ModuleController` derives
a safe slug on create, but there is no endpoint that updates a Module, so this
one was written by hand. If module editing is ever added, the slug needs the
same derivation, and the existing rows need a migration.

### 98. One source for a number — DONE (CHANGELOG §35)

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

**What shipped.** The widths are constants on the model that owns the column
(`Enquiry`, `Module`, `EntrySlug`), read by the migration, the rules and the
theme's `maxlength`; `ColumnWidthTest` pins all three readers. The two page
sizes are `Entry::PER_PAGE` and `Enquiry::PER_PAGE` and now say why they
differ, the upload ceiling is `UploadController::MAX_KILOBYTES`, and
`SLUG_MAX_LENGTH` moved from a private constant on `ModuleController` — where
the migration could not see it — onto the model. A migration narrows
`enquiries.name` and `email` to the rules that fill them, checked against the
live data first and read back afterwards: 120, 180, 40, 512.

**The test could not read a column's width, and that shaped the design.**
Laravel's SQLite grammar writes `varchar` with no length at all
(`SQLiteGrammar::typeString`), so the suite's driver has nothing to report. The
first version answered this by having the migrations read the constants, which
the review reversed: a migration is a record of what the schema became on the
day it ran, and one that reads a constant means something different on a fresh
database than on one that has already run it. **The literals are back, and
`php artisan schema:doctor` is what compares the columns to the constants** —
run it on a deployment, beside `pages:doctor`.

**Two numbers were below a sum nobody had done**, found by the review: a public
path reaches 518 characters, so `redirects.from_path` at 512 could not record
where a renamed module's longest pages went, and `enquiries.source_url` at 512
made a page with long slugs refuse every enquiry sent from it. 640 and 2048 now,
with the sums asserted rather than the numbers.

It was **fourteen** test files rather than eight by the time this ran, and they
share `TestCase::languages('el', 'en')` now. The default is only claimed when
the site has none, so a test that adds a language part way through does not
move it.

**Left deliberately**, and recorded per file in ARCHITECTURE §8a:
`language_code` is `varchar(5)` in four places and would take a constant on
`Language`, but nothing has needed to move it.

### 69. Redirects — DONE (CHANGELOG §33)

When a client's existing website is replaced, its old URLs must redirect to the
new ones. Otherwise they answer 404 on the day of delivery and Google drops the
rankings the client already had — caused by your delivery, and they will say so.

Brought forward from *first real client* by #114 item 4: translating a Module
moves every URL underneath it, so the mechanism was needed by our own rename
before any client's old site arrived.

`redirects` is the table — `from_path`, `to_path`, `status`, 301 by default.
**Not a middleware in the end**: `bootstrap/app.php` asks `Redirects::answer`
while rendering a 404, which is the only moment the question is worth asking
and the only way a row can never hide a page that is live. Renames write their
own rows; the client's old site is rows the agency writes by hand, like a
language (#52), because a client editing redirects is a support call about a
loop.

**What is not done**: nothing reads the old site to produce those rows. That
is an import against a client's own URL list, and it belongs to the first
delivery that needs it.

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

One was visible to a visitor and is now fixed (#99, with #109). Five are the
test mechanism failing to hold what its docblocks claim (#101—#103, #105,
#108). One belongs with the panel half (#100). The remaining four are small
(#104, #106, #107, #110).

That the review found this much in a green, live-verified, mutation-tested
commit is worth naming: **every mutation proved a test bites, and none proved a
test is sufficient.** The mutations were written from the same understanding as
the code, so they exercised the paths the code already handled.

### 99. A Greek visitor is refused half in English — DONE (CHANGELOG §34)

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

**The panel has it too**, confirmed live on 2026-09-06. #67 solved the
`:attribute` half there — the settings screen passes its declared labels as
`attributes`, so a bad URL is reported against the field's own wording — and
that makes the remaining gap read as the exact mirror of the public form's:

```
The Σελίδα Facebook field must be a valid URL.
```

Greek field name, English sentence around it. So the file this needs is not
only the public forms' rules: `url` is a settings rule and does not appear on
an enquiry. Publishing `lang/el/validation.php` for the rules **both** surfaces
use settles both, and the `attributes` array is only needed for the enquiry
form, which is the one place the request key is what a reader would otherwise
see.

Decided with #109, which was the other half of the same `lang:publish`:
`auth.php`, `pagination.php` and `passwords.php` are **deleted**. Nothing reads
them, and the framework carries its own copies as a search path underneath
`lang/`, so English is unchanged.

**What shipped.** `lang/el/validation.php` for the rules both surfaces use, and
`StoreEnquiryRequest::attributes()` for the names — the labels are declared
once in the request rather than per locale, so a language a client's site has
gets them too. The keys are core's own (*Full name*, *Arrival date*) rather
than the theme's *Name* and *Arrival*, because `TranslationTest` refuses a key
both sides translate (#61): a client whose form says *Όνομα* gets a refusal
that says *Ονοματεπώνυμο*, which is the price of that line being in the right
place.

**Found live, not by the tests**: `after_or_equal:today` interpolates `:date`
with the rule's own parameter, so the Greek sentence ended *«…μεταγενέστερη της
today»*. It has a written-out message now, like the rule beside it. The test
that missed it asked only whether a message *contains* Greek — which is true
of an English sentence around a Greek label, and is the whole shape of this
finding. It now refuses any Latin word outside a named list of loanwords.

**Still open, one screen over**: the panel's entry form reports against
`data.title`, so a Greek reader gets *«Το πεδίο data.title είναι
υποχρεωτικό»*. It reads under the field it belongs to, which is why #99 scoped
the `attributes` half to the enquiry form — but it is the same mechanism and
about five lines in the Entry requests. Worth doing with #104's neighbours.

### 100. The owner's notification will be sent in the visitor's language — DONE (CHANGELOG §36)

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

### 101. The mount test asserts something that is true without the mount — DONE (CHANGELOG §36)

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

### 102. The parity test skips exactly the locales a client adds — DONE (CHANGELOG §36)

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

### 103. Nothing checks the catalogue against the code — DONE (CHANGELOG §36)

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

**Settled with #110**, which the new test decided as predicted: the template
stops translating the label, so there is nothing in the catalogue to drop.

`CatalogueCoversTheCodeTest` reads `__('…')` out of PHP **as tokens** rather
than by pattern - the first version of the scan reported a comment in
`AppServiceProvider` that explains the mechanism by quoting `__('Name')` - and
covers the theme, core's PHP and Blade, and the panel's `t('…')`, which shares
core's catalogue. It found two real gaps on the day it was written: the
settings screen's *Serve pages from files* label was in no catalogue at all, so
a Greek owner read it in English, and `Give it a name, a slug and the fields its
entries hold.` had been *reworded in its value* when #114 made the slug per
language, leaving the code asking for a sentence about a slug that is no longer
there. A third assertion pins that the English files stay identity maps, which
is what makes an untranslated string read as English rather than as a key.

### 104. A client's own routes get no locale — DONE (CHANGELOG §36)

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

**Both halves shipped**, because either alone does nothing: `SetLocale` is on
the whole `web` group now, and it reads the first segment when the route has no
`{language}` parameter. The pattern comes from `Route::getPatterns()` rather
than a second copy of the expression, so `admin`, `storage` and `sitemap.xml`
cannot match it. `CoreSiteBoundaryTest` proves it through a routes file of its
own making, and a mutation that accepts any first segment as a language is
caught there.

### 105. The key-parity assertion compares order, not membership — DONE (CHANGELOG §36)

`assertSame(array_keys($reference), array_keys(…))`. Alphabetising a
translation file, or inserting a new pair at the top rather than the bottom,
fails the suite with a whole-array diff that reads as a missing translation.

`assertEqualsCanonicalizing` states the actual rule.

### 106. The boundary test still promises two mounts — DONE (CHANGELOG §36)

`CoreSiteBoundaryTest`'s docblock says "both mounts must actually work", and
the file checks the theme and the routes file. `config/site.php` now carries a
third.

CLAUDE.md §1a sends a fresh session to that test as *the* enforcement of the
core/site line, so the translations mount sits outside the one place a reader is
told to look. **CLAUDE.md's own copy of the sentence is already corrected**;
what is left is the docblock and the check it describes, which means taking
#101's test in rather than leaving it in `TranslationTest` — see #101 for why
that move is a precondition rather than tidying.

### 107. A rate-limited visitor is refused in English — DONE (CHANGELOG §36)

`->middleware(['throttle:enquiries', 'locale'])` runs the limiter first, so a
429 is rendered before the locale is set.

**And swapping the order does nothing**, which is what the fix turned out to
be about: `ThrottleRequests` is in Laravel's own `$middlewarePriority`, so it is
sorted ahead of any middleware that is not, whatever a route asks for. A
mutation swapping it back passed. So the refusal reads the language itself -
`SetLocale::languageFor($request)`, the same question the middleware asks - and
says something a visitor can act on instead of the framework's untranslatable
*"Too Many Attempts."*. Verified live: `/el/enquiries` answers in Greek and
`/en/enquiries` in English.

### 108. Two assertions that cannot fire — DONE (CHANGELOG §36)

`assertDontSee('>Name<')` never matches, because the label renders as `Name *`;
if the translation of `Name` were dropped, `/el` would render `>Name *<` and
the assertion would still pass. `assertDontSee('theme.', false)` guards against
a namespaced-key format this design deliberately does not use.

Both read as safety nets and neither is one. Only the `assertSee('Όνομα')` half
does any work.

### 109. Three published language files nothing reads — DONE (CHANGELOG §34)

`lang:publish` wrote `auth.php`, `pagination.php` and `passwords.php` beside
`validation.php`. The application has no Blade auth screens, no password reset
and no paginated Blade views, so 61 lines of framework defaults entered the
repository as things a future translator will work through for nothing.

**All four are gone**, `validation.php` included, and the first version of
this said otherwise. Nothing in `app/`, `resources/` or `site/` reads an
`auth.`, `passwords.` or `pagination.` key — and `lang/en/validation.php`
turned out to be **byte-identical** to the framework's own copy, which
`TranslationServiceProvider` already searches first (`new FileLoader($files,
[__DIR__.'/lang', $app['path.lang']])`). Keeping it as "the fallback base #99
relies on" was 200 lines held on a reason that was not true. English is
unchanged with `lang/en/` deleted; `php artisan lang:publish` writes it back
whenever a translator wants a reference to copy from.

### 110. The honeypot's label is now translated — DONE (CHANGELOG §36)

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

### 52. Languages have no write API — and are not getting one

**This item used to argue the opposite**, and was wrong. It read: "the set of
languages is configuration a user should own rather than a fixture." That
contradicts `BUSINESS.md` §5, which lists languages as the **first of two
revenue levers** — "an upsell, not a setting — which is why clients must not be
able to add one themselves" — and BUSINESS.md outranks this file when the two
disagree. Confirmed by the owner on 2026-09-06: **adding a language is a
billable service the agency performs.**

So the absence is the feature. `LanguageController` has `index` and nothing
else, and adding, renaming, deactivating or defaulting a language stays a
manual SQL statement run by the agency.

**What actually enforces it today is nothing.** There are no roles: `users`
holds `id, name, email, password` and timestamps, and every signed-in person
can do everything the API offers. The rule holds only because the endpoint does
not exist — which is enough now, and is exactly why it is written down here.
**Do not "complete" this API.** A write endpoint would hand every client a
service they are meant to pay for, and there is no permission to hide it behind.

Two real things remain, and neither needs a client-facing writer:

- **#49's rule has nowhere to live.** "Exactly one language is the default" is
  enforced by nobody. An agency-only artisan command is where that belongs.
- **The panel cannot see an inactive language** — see #114, step 2. That is the
  one that blocks the billable workflow today.

If roles ever arrive (#72's tier work would need them), this becomes a screen
behind an agency role rather than a thing to leave out.

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

### 94. The panel has no component-test harness — DONE (2026-09-10)

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

**Done, 2026-09-10**, as the first step of the panel redesign — a redesign that
rewrites every component is exactly the moment the argument above stops being
theoretical. `@testing-library/react` over jsdom, `resources/js/test/setup.js`
stubbing `window.miniCms`, and `vitest.config.js` carrying `@vitejs/plugin-react`
so `.jsx` is transformed at all.

Two things it caught in the first ten minutes, and they are the reason the item
was right:

- **`vitest.config.js` matched `*.test.js` only.** A `Login.test.jsx` was
  collected by nothing and reported by nothing — the run stayed green at 214
  and the file may as well not have existed. A test that never runs is worse
  than no test, because the count still goes up. The pattern is now
  `*.test.{js,jsx}`.
- **`Login.jsx` had no `for`/`id` on either label**, so neither input had an
  accessible name: a screen reader announced "edit text, blank", and tapping a
  label did not focus the field. Found by `getByLabelText` refusing to resolve,
  which is the query doing its job rather than a test being awkward.

**One trap for anyone adding a component test.**
`CatalogueCoversTheCodeTest::literalsInJavaScript()` skips `*.test.js` and, by
`str_ends_with`, does **not** skip `*.test.jsx` — so a `t('…')` written inside a
component test is demanded of `lang/en.json` as though the panel used it. Assert
the **raw English** instead: the setup file leaves `messages` empty on purpose,
so `t()` answers its own key and the key is the English text.

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

### What does editing a Module mean for its Entries? — SETTLED (2026-09-07)

**Additive edits only**, the first of the three shapes below. Decided by the
owner: *"why can I only rename? I might want to add a column, or make a field
required after the fact."* Answered in #115 and CHANGELOG §31.

The line drawn is not "editing is dangerous" but one question asked per change:
**does this reshape data already stored?** Adding a field, reordering, and
changing `required`, `validation` or `options` do not. Renaming, removing,
retyping and flipping `translatable` do, and stay a hand-written migration.

`translatable` was added to that list during the work and is not in the
original analysis below: it decides whether a stored value is a scalar or a map
of language to value, so it is a type change wearing a checkbox. Turned on, a
stored scalar sits where a map is expected and the Greek text prints on the
French page.

The consequence the owner accepted knowingly is the third bullet below - a
field made required leaves every entry that lacks it unsaveable until it is
filled. Nothing is lost, and it is what "required" means.

*The original analysis, kept because the two shapes not chosen are still the
shapes:*

`routes/api.php` offered `POST /modules` and `GET /modules` and nothing else —
no `show`, no `update`, no `destroy`. A Module was created once and was then
permanent, so a misspelled field name or a forgotten field meant building a
second Module and re-entering its content by hand. For a product whose central
feature is *defining content types*, that was the largest gap in it.

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
