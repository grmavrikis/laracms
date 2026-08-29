# Open work

What is left to do. Completed work and the reasoning behind it is in
[`CHANGELOG.md`](CHANGELOG.md); how the system is put together is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Priorities.** **P1** is behaviour that is wrong now. **P2** is correctness
with small blast radius. **P3** is tidying. There is no P0 open.

Everything below came from a review of the work in `CHANGELOG.md`, so most of
it is the cost of recent changes rather than old debt — noted per item where
that is the case.

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

---

## Backlog

Deliberately out of scope for MVP.

- **Component tests.** The suites cover PHP and the pure JS helpers; nothing
  renders `EntryForm` or `ModuleBuilder`. Needs jsdom and a heavier setup.
- **Select options as `{value, label}`** instead of flat strings. The current
  format works but cannot carry a label distinct from its value.
- **Frontend routing / global state.** Not needed at the app's current size;
  `app.jsx` switches on a local `view` value.
