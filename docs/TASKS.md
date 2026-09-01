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
in the MVP. Three of them are.

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
- [ ] #55 rich-text renderer, Tiptap document → HTML
- [ ] #56 publication state, with a Publish action
- [ ] #57 manual ordering
- [ ] #58 per-language entry slugs
- [ ] #59 public Blade routes, page cache cleared on publish, sitemap + hreflang
- [ ] #60 `singleton` modules
- [ ] #61 core/site boundary drawn
- [ ] #68 gallery field — several images on one entry
- [ ] #66 enquiries
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

**#55, #56, #57, #58, #59, #60, #61, #68, #66, #67.** This is the real gap: the
CMS stores content today, has no way to show it to anybody, and no way to
receive anything back.

Do **#68** early. It changes the field-type system, and every module built
before it will have to be revisited afterwards.

### Phase 2 — the demo site, as client #0 (3–5 days)

**#62, #65.** Built exactly the way a paying client would be built — same
directory layout, same way of binding a module to a template, same deployment —
so that client #1 is a copy with a different theme and different content rather
than a fresh start. The demo is simultaneously the sales sample and the first
template in the library.

Note that **rooms, facilities and the home-page slider need no engineering at
all**: they are modules built in the existing builder, and the slider gets its
ordering free from #57 (one entry per slide). That is the schema-driven design
working as intended — which is exactly why #68 has to land first, since without
it the most important of those modules cannot hold its content.

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

### 59. Public rendering in Blade, with a cache cleared on publish

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

### 60. `singleton` modules

"About" is one entry; "Blog" is many. Today both are collections, so a client
opening About finds a list and a "new entry" button that must never be pressed.

A `singleton` flag on the module: the admin opens straight into the single
entry, with no list and no create button. Small, and much cheaper before five
sites exist than after.

### 61. Draw the core/site boundary

Core code and per-client code go into separate directories now — theme,
per-client modules and site routes on one side, everything shipped on the other.

No packaging, no Composer work, no tooling: only the line. The line is what
makes the eventual extraction (client #2) mechanical, and it costs almost
nothing today.

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

### 66. Enquiries — and the first inbound path in the application

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

### 67. Site settings

A singleton (#60) holding phone, email, address, map coordinates, social links,
logo, opening hours, and the channel-manager URL that #65 links out to.

Without it these values live inside templates, which means **the client cannot
change their own phone number without calling you.** That contradicts the one
promise the product makes, and it is the kind of call that arrives on a Sunday.
Half a day, and it removes a category of support permanently.

### 68. Several images on one entry — a gallery field *(blocking)*

`SchemaRuleBuilder::SUPPORTED_TYPES` offers `image`, which holds a single URL,
and there is no repeatable field of any kind. An entry therefore cannot carry a
set of images.

For tourist accommodation this is fatal rather than awkward. A room needs 8–15
photographs because **the photographs are the product** — nobody books an
apartment from one picture. The "rooms" module builds without a line of code in
the existing builder and comes out unusable.

Needs a `gallery` type; an ordered list of images as its value; rules for it in
`SchemaRuleBuilder`; an editor in `EntryForm` that uploads several files,
reorders and removes them; and `php artisan schema:sync-field-types` re-run
afterwards, which `FieldTypeConsistencyTest` will insist on.

Two decisions to take while building it:

- **Alt text per language.** Selling multilingual SEO while shipping images
  whose alt text cannot be translated contradicts the pitch.
- It is **not** the media library. A gallery is several images on one entry;
  the library is reuse of one image across entries, and stays deferred.

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

Numbered **#36–#53**, from two reviews. The two that were in the MVP, #47 and
#48, are done and gone from here. **Nothing else on this list is scheduled** —
the rest are real, stay recorded, and are not being worked on. Grinding through
them before the MVP ships is the most plausible way to spend three months and
reach no client.

The priority labels rank these *against each other*, not against the MVP.
**P1** is behaviour that is wrong now, **P2** is correctness with small blast
radius, **P3** is tidying. There is no P0 open.

Items **#36–#46** came from a review of the work in `CHANGELOG.md`, so most are
the cost of recent changes rather than old debt — noted per item where that is
so. Items **#47–#53** came from a review of the project as a whole and are
largely the opposite: gaps present from the beginning that no single change is
responsible for.

**#47 and #48 are gone from this list — they are done** (CHANGELOG §13). The
numbers are not reused.

---

## P1 — wrong today

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

### 39. Schema errors are keyed to fields the request does not have

`SchemaRuleBuilder` now serves two different requests, and its exception keys
suit only one each:

- `unsupportedType()` throws keyed **`data`**, but `ModuleController::store`
  calls `build()`, and a module-creation request has no `data` field.
  Unreachable today only because `Rule::in` and the `required` rule catch bad
  and missing types first — adding a type to `SUPPORTED_TYPES` without a
  match arm would expose it.
- `assertCustomRulesFit()` throws keyed **`schema`**, and is also reached
  from entry validation, where no `schema` field exists. It lands in the
  banner via `messagesNotForFields`, which happens to be right, but by
  accident rather than design.

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

# Backlog

Deliberately out of scope for MVP.

- **Component tests.** The suites cover PHP and the pure JS helpers; nothing
  renders `EntryForm` or `ModuleBuilder`. Needs jsdom and a heavier setup.
- **Select options as `{value, label}`** instead of flat strings. The current
  format works but cannot carry a label distinct from its value.
- **Frontend routing / global state.** Not needed at the app's current size;
  `app.jsx` switches on a local `view` value.
