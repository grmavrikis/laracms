# Open work

What is left to do. Completed work and the reasoning behind it is in
[`CHANGELOG.md`](CHANGELOG.md); how the system is put together is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Priorities.** **P1** is behaviour that is wrong now. **P2** is correctness
with small blast radius. **P3** is tidying. There is no P0 open.

Items **#36–#46** came from a review of the work in `CHANGELOG.md`, so most of
them are the cost of recent changes rather than old debt — noted per item where
that is the case. Items **#47 and up** came from a later review of the project
as a whole, and are largely the opposite: gaps that have been there from the
beginning and that no single change is responsible for.

Numbering continues from the completed list; it is stable so commits and
comments can cite it.

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

### 47. Seeding a fresh install fails outright

`DatabaseSeeder:14` calls `User::updateOrCreate` with no `use App\Models\User`.
In namespace `Database\Seeders` that resolves to `Database\Seeders\User`, which
does not exist — so `php artisan migrate --seed`, step one of `README.md:62`,
dies before writing anything.

Verified:

```
class_exists('Database\Seeders\User')  ->  false
class_exists('App\Models\User')        ->  true
```

Three more problems sit in the same method and only become visible once the
fatal is fixed:

- the language is seeded as `code => 'gr'`; the ISO code for Greek is `el`,
  which is what the languages migration gives as its own example;
- no language is flagged `is_default` (#49);
- the module is written with `DB::table(...)->updateOrInsert()` and no
  timestamps, so `created_at` is NULL — the column `latest()` orders by.

Not a cost of recent work: nothing in `CHANGELOG.md` touched the seeder.

### 48. No rate limiting anywhere, including `/api/login`

Laravel 13 adds a limiter to the `api` middleware group only when
`throttleApi()` is called — the group is assembled in
`Foundation/Configuration/Middleware.php:495`, where the throttle entry is
conditional on `$this->apiLimiter` being set. `bootstrap/app.php` never calls
it, and there is no `throttle:` anywhere in `routes/` or `app/`.

So `POST /api/login` accepts unlimited password guesses, as fast as Apache will
serve them. That a single account exists makes it easier to attack, not harder.

`->throttleApi()` in `bootstrap/app.php` covers the API surface; the login route
wants something tighter than the shared default, keyed by email as well as IP so
one attacker cannot lock out the real user from a rotating address.

### 49. `is_default` is read but never written

`languages.is_default` decides which language the panel opens on — `getLangCode`
and `defaultLanguage` in `lib/languages.js`, adopted in CHANGELOG §7.

Nothing writes it. Not the seeder, not an endpoint, not a migration beyond
`->default(false)`; searched `app/`, `database/` and `resources/js/`. So
`defaultLanguage()` always falls through to `languages[0]`, and on any install
whose database was not edited by hand the panel is back to opening on whichever
language `orderBy('id')` returns first.

The behaviour CHANGELOG §7 describes is therefore real in code and dormant in
practice. Somewhere has to set the flag — and enforce that exactly one language
carries it, which is a rule with no home until #52.

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

---

## To discuss

Not work items. These need a conversation before anyone can say whether there
is anything to do — putting them in a checklist would imply a decision that
has not been made.

### Should `/` exist?

`routes/web.php` serves the stock Laravel welcome page at `/`. It is a
placeholder: the product is `/admin`, and nothing links to `/` from inside
the app.

It came up while measuring the typography plugin (CHANGELOG §12). Every way
of scoping the CSS cost more than the ~1.5 kB gzipped it would save, and the
cleanest resolution is not a CSS one — a page that does not need `prose` also
does not need to exist.

Three shapes, and they are genuinely different products:

- **Redirect `/` to `/admin`.** The CMS is an admin tool with no public face.
  Simplest, and settles the CSS question.
- **A real landing page.** If people are ever meant to arrive here, the stock
  Laravel page is not it, and the question is what should be.
- **Serve public content.** The CMS stores entries; `/` could render them.
  That is a different project, and would make a full rich-text renderer a
  requirement rather than the excerpt the admin table needs.

Until that is settled, `welcome.blade.php` stays as it is.

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

Deliberately out of scope for MVP.

- **Component tests.** The suites cover PHP and the pure JS helpers; nothing
  renders `EntryForm` or `ModuleBuilder`. Needs jsdom and a heavier setup.
- **Select options as `{value, label}`** instead of flat strings. The current
  format works but cannot carry a label distinct from its value.
- **Frontend routing / global state.** Not needed at the app's current size;
  `app.jsx` switches on a local `view` value.
