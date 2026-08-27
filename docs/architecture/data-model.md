# Data Model

## 1. Purpose

This document describes the current database structure and domain
relationships of the CMS.

It defines:

- the main entities
- their relationships
- ownership boundaries
- stored data
- schema representation
- translation representation
- relevant database constraints

This document describes the **current implementation**.

Security findings, architectural problems, proposed changes, and unresolved
questions are documented separately under `docs/review/` and
`docs/security/`.

---

## 2. Core Entities

The CMS currently contains the following primary entities:

```text
User
 │
 └── Module
      │
      └── Entry
           │
           └── EntryTranslation
                │
                └── Language
```

The main database entities are:

- `users`
- `modules`
- `entries`
- `entry_translations`
- `languages`

---

## 3. User

The `User` model represents an authenticated CMS user.

Users are associated with Modules through the `modules.user_id` foreign key.

Conceptually:

```text
User
 │
 │ 1:N
 ▼
Module
```

The ownership relationship is:

```text
users.id
   │
   │
   ▼
modules.user_id
```

A Module therefore has a direct owner.

The exact authorization rules associated with this relationship are documented
in:

`docs/security/authorization.md`

---

## 4. Module

The `Module` model represents a content type defined within the CMS.

A Module contains the definition of the fields that its Entries can contain.

The important Module properties include:

- `id`
- `user_id`
- `name`
- `slug`
- `schema`

Conceptually:

```text
Module
├── id
├── user_id
├── name
├── slug
└── schema
```

### `user_id`

Identifies the User that owns the Module.

Relationship:

```text
User
 │
 └── hasMany
      │
      ▼
    Module
```

### `slug`

The Module has a human-readable identifier used by the API.

The current model configuration uses the Module slug as its route key.

### `schema`

The `schema` defines the structure of the content that can be stored in
Entries belonging to the Module.

Conceptually:

```text
Module
└── schema
    ├── field
    ├── field
    └── field
```

The schema is used by both the frontend and backend.

The exact schema contract is documented separately during the architecture
and validation review.

---

## 5. Entry

The `Entry` model represents an individual piece of content belonging to a
Module.

The relationship is:

```text
Module
 │
 │ 1:N
 ▼
Entry
```

Conceptually:

```text
modules.id
     │
     │
     ▼
entries.module_id
```

An Entry therefore belongs to exactly one Module.

The main Entry properties include:

- `id`
- `module_id`
- `data`
- timestamps

Conceptually:

```text
Entry
├── id
├── module_id
├── data
├── created_at
└── updated_at
```

### `data`

The `data` column contains the Entry's content.

Static/non-translatable fields are stored directly in the Entry data.

Conceptually:

```json
{
    "title": "Example",
    "status": "published",
    "featured": true
}
```

The exact representation of translated fields requires separate verification
against the current controller, model, validation, and frontend behavior.

---

## 6. EntryTranslation

The `EntryTranslation` model represents translated content associated with
an Entry and a Language.

The intended database relationship is:

```text
Entry
 │
 │ 1:N
 ▼
EntryTranslation
 │
 │ N:1
 ▼
Language
```

Conceptually:

```text
entries.id
     │
     │
     ▼
entry_translations.entry_id

languages.id
     │
     │
     ▼
entry_translations.language_id
```

The main properties include:

- `id`
- `entry_id`
- `language_id`
- `data`
- timestamps

Conceptually:

```text
EntryTranslation
├── id
├── entry_id
├── language_id
├── data
├── created_at
└── updated_at
```

The `data` column stores the translated content associated with the specific
language.

For example:

```json
{
    "title": "Hello",
    "description": "Example description"
}
```

The exact relationship between `Entry.data` and `EntryTranslation.data` must
be verified against the complete application flow.

---

## 7. Language

The `Language` model represents an available CMS language.

Languages are referenced by EntryTranslation records.

Conceptually:

```text
Language
 │
 │ 1:N
 ▼
EntryTranslation
```

The Language entity contains information identifying the language and whether
it is currently active.

Relevant properties include:

- `id`
- language code / locale
- active status

The exact field names and fallback behavior are determined by the current
database schema and application code.

---

## 8. Entity Relationships

The current domain relationships can be represented as:

```text
┌──────────────┐
│     User     │
└──────┬───────┘
       │
       │ 1:N
       ▼
┌──────────────┐
│    Module    │
│              │
│ id           │
│ user_id      │
│ name         │
│ slug         │
│ schema       │
└──────┬───────┘
       │
       │ 1:N
       ▼
┌──────────────┐
│    Entry     │
│              │
│ id           │
│ module_id    │
│ data         │
└──────┬───────┘
       │
       │ 1:N
       ▼
┌────────────────────┐
│ EntryTranslation   │
│                    │
│ id                 │
│ entry_id           │
│ language_id        │
│ data               │
└──────────┬─────────┘
           │
           │ N:1
           ▼
┌────────────────────┐
│      Language      │
│                    │
│ id                 │
│ code / locale      │
│ is_active          │
└────────────────────┘
```

---

## 9. Ownership Hierarchy

The intended ownership hierarchy is:

```text
Authenticated User
        │
        ▼
     Module
        │
        ▼
      Entry
```

An Entry does not currently contain a direct `user_id`.

Ownership is therefore derived through the Module relationship:

```text
Entry
 │
 └── module_id
       │
       ▼
     Module
       │
       └── user_id
             │
             ▼
           User
```

This means that determining whether a User owns an Entry requires traversing:

```text
Entry
  → Module
    → User
```

This relationship is security-sensitive and must be enforced by the backend.

Authorization rules are documented in:

`docs/security/authorization.md`

---

## 10. Module Schema and Entry Data

The Module schema defines which fields are available for Entries.

Conceptually:

```text
Module.schema
      │
      ▼
Allowed Entry fields
      │
      ▼
Entry.data
```

For example, a Module may define:

```json
[
    {
        "name": "title",
        "type": "text",
        "translatable": true
    },
    {
        "name": "status",
        "type": "select"
    },
    {
        "name": "featured",
        "type": "boolean"
    }
]
```

The resulting Entry data depends on whether a field is translatable.

Static fields conceptually use:

```json
{
    "status": "published",
    "featured": true
}
```

Translatable fields require a separate representation.

The exact representation must be consistent between:

- Module schema
- frontend form state
- API request payload
- validation
- Entry model
- EntryTranslation model
- API response
- frontend display

This consistency is part of the architecture review.

---

## 11. Translation Architecture

The current database contains a dedicated `entry_translations` table.

This indicates a relational translation model:

```text
Entry
 │
 ├── EntryTranslation (English)
 │
 ├── EntryTranslation (Greek)
 │
 └── EntryTranslation (other language)
```

Conceptually:

```text
Entry #10
 │
 ├── Translation
 │    language_id = 1
 │    data = {
 │        "title": "Hello"
 │    }
 │
 └── Translation
      language_id = 2
      data = {
          "title": "Γεια"
      }
```

However, the current request validation and frontend implementation also
represent translated fields using language keys inside the field value.

Example:

```json
{
    "data": {
        "title": {
            "en": "Hello",
            "el": "Γεια"
        }
    }
}
```

These are two different representations.

The application must therefore be reviewed to establish:

1. which representation is used by the API
2. which representation is used by the frontend
3. which representation is used by validation
4. which representation is persisted
5. which representation is returned by the API
6. whether a conversion layer exists between them

This is an architectural verification point and is not resolved by this
document.

---

## 12. Database Constraints

Database constraints are an important part of data integrity.

The following relationships require verification against the migrations:

```text
modules.user_id
    → users.id

entries.module_id
    → modules.id

entry_translations.entry_id
    → entries.id

entry_translations.language_id
    → languages.id
```

The review must verify:

- foreign key existence
- foreign key behavior on deletion
- nullability
- uniqueness constraints
- indexes
- cascading behavior
- duplicate prevention
- whether application-level assumptions are also enforced by the database

The presence of an Eloquent relationship alone is not considered sufficient
to establish database integrity.

---

## 13. Slugs and Identifiers

Modules currently expose a `slug` in addition to their numeric database ID.

The API uses the Module slug as its route identifier.

Conceptually:

```text
/modules/{moduleSlug}/entries
```

The current implementation must be reviewed for consistency regarding:

- slug generation
- slug normalization
- uniqueness
- frontend-generated slugs
- backend-generated slugs
- whether uniqueness is global or owner-scoped
- whether numeric IDs are also accepted by the API

These questions are documented in the review process rather than assumed to
be resolved here.

---

## 14. Data Integrity Principles

The data model should preserve the following invariants:

### Module ownership

Every Module must belong to a valid User.

```text
Module.user_id → User.id
```

### Entry ownership

Every Entry must belong to a valid Module.

```text
Entry.module_id → Module.id
```

The User owning an Entry is therefore determined through its Module.

### Translation ownership

Every EntryTranslation must belong to:

- one valid Entry
- one valid Language

```text
EntryTranslation.entry_id → Entry.id
EntryTranslation.language_id → Language.id
```

### Schema consistency

Entry data must conform to the schema defined by its Module.

```text
Module.schema
      │
      ▼
Entry.data
```

The enforcement mechanism is documented in:

`docs/security/input-validation.md`

---

## 15. Data Model Review Boundaries

The following areas are explicitly subject to verification during the review:

- Eloquent relationship definitions
- database foreign keys
- migration consistency
- Entry → Module relationship
- Module → User ownership
- EntryTranslation relationships
- translation storage model
- schema/data consistency
- field type consistency
- slug uniqueness and generation
- deletion behavior
- nullable fields
- indexes and uniqueness constraints

Findings resulting from this verification belong in:

`docs/review/findings.md`

Unresolved architectural questions belong in:

`docs/review/open-questions.md`

Architectural decisions belong in:

`docs/review/decisions.md`