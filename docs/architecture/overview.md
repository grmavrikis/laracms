# Architecture Overview

## 1. Purpose

This document describes the current high-level architecture of the CMS.

It documents how the main application layers and components are structured
and how they interact.

This document describes the **current implementation**.

It does not define:

- security findings
- known vulnerabilities
- proposed fixes
- future architecture
- technical debt
- unresolved architectural decisions

Those are documented separately under `docs/security/` and `docs/review/`.

---

## 2. Technology Stack

The CMS is a web application built with:

- **Backend:** Laravel / PHP
- **API:** Laravel HTTP API
- **Authentication:** Laravel Sanctum with session-based authentication
- **Frontend:** React
- **HTTP Client:** Axios
- **Database:** SQLite during the current development setup
- **Rich Text Editing:** Tiptap
- **Styling:** Tailwind CSS

The frontend communicates with the backend through the `/api/*` endpoints.

---

## 3. High-Level Architecture

The application is divided into the following main layers:

```text
┌──────────────────────────────┐
│            User              │
└──────────────┬───────────────┘
               │
               │ Browser
               ▼
┌──────────────────────────────┐
│        React Frontend        │
│                              │
│  Components                  │
│  ├── Login                   │
│  ├── ModulesList             │
│  ├── ModuleBuilder           │
│  ├── EntriesManager          │
│  ├── EntriesTable            │
│  ├── EntryForm               │
│  └── RichTextEditor          │
│                              │
│  Axios API Client            │
└──────────────┬───────────────┘
               │
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│       Laravel API            │
│                              │
│  Routes                      │
│      ↓                       │
│  Controllers                 │
│      ↓                       │
│  Form Requests               │
│      ↓                       │
│  Services / Models           │
│      ↓                       │
│  Database                    │
└──────────────────────────────┘
```

---

## 4. Backend Architecture

The backend is responsible for:

- authentication
- authorization
- request validation
- module management
- entry management
- language management
- file uploads
- persistence
- API responses

The main backend areas are:

```text
app/
├── Http/
│   ├── Controllers/
│   │   ├── Api/
│   │   │   ├── AuthController.php
│   │   │   ├── EntryController.php
│   │   │   └── ModuleController.php
│   │   ├── EntryController.php
│   │   └── UploadController.php
│   │
│   └── Requests/
│       ├── StoreEntryRequest.php
│       └── UpdateEntryRequest.php
│
├── Models/
│   ├── Entry.php
│   ├── EntryTranslation.php
│   ├── Language.php
│   ├── Module.php
│   └── User.php
│
├── Services/
│   └── SchemaRuleBuilder.php
│
└── Providers/
    └── AppServiceProvider.php
```

### Controllers

Controllers receive HTTP requests and coordinate application behavior.

The API controllers currently include:

- `AuthController`
- `ModuleController`
- `EntryController`

Additional controllers handle application-level functionality such as
entries and file uploads.

### Form Requests

The entry Form Requests are responsible for request validation:

- `StoreEntryRequest`
- `UpdateEntryRequest`

Entry validation is dynamic and depends on the schema defined by the
corresponding Module.

### Models

The main domain models are:

- `User`
- `Module`
- `Entry`
- `EntryTranslation`
- `Language`

These models represent the primary application entities and their database
relationships.

### Services

`SchemaRuleBuilder` converts a Module schema definition into Laravel
validation rules used when creating or updating entries.

---

## 5. Frontend Architecture

The frontend is implemented using React components.

The main application areas include:

```text
resources/js/
├── app.js
├── app.jsx
│
├── components/
│   ├── Login.jsx
│   ├── ModulesList.jsx
│   ├── ModuleBuilder.jsx
│   ├── EntriesManager.jsx
│   ├── EntriesTable.jsx
│   ├── EntryForm.jsx
│   └── RichTextEditor.jsx
│
└── lib/
    └── api.js
```

### Main responsibilities

#### `Login.jsx`

Handles the login interface and authentication flow.

#### `ModulesList.jsx`

Displays the modules available to the authenticated user.

#### `ModuleBuilder.jsx`

Creates and manages Module definitions and their schemas.

#### `EntriesManager.jsx`

Coordinates entry listing, creation, and editing.

#### `EntriesTable.jsx`

Displays entries for a selected Module.

#### `EntryForm.jsx`

Renders the dynamic entry form based on the Module schema.

#### `RichTextEditor.jsx`

Provides rich-text editing functionality using Tiptap.

#### `api.js`

Provides the Axios API client used by the React application.

---

## 6. Domain Structure

The primary domain hierarchy is:

```text
User
 │
 │ 1:N
 ▼
Module
 │
 │ 1:N
 ▼
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

A Module defines the structure of its Entries through its `schema`.

Conceptually:

```text
User
 └── Module
      ├── schema
      └── Entries
           ├── Entry
           ├── Entry
           └── Entry
```

Translations introduce a separate relationship between Entries and Languages.

The exact persistence and representation rules for translated fields are
documented in:

`docs/architecture/data-model.md`

---

## 7. Module and Schema Architecture

Modules are dynamic content definitions.

A Module contains a schema describing the fields that its Entries can contain.

Conceptually:

```text
Module
 │
 └── schema
      │
      ├── field
      │    ├── name
      │    ├── type
      │    └── configuration
      │
      ├── field
      └── field
```

The schema is consumed by multiple parts of the application:

```text
Module.schema
      │
      ├──────────────► React EntryForm
      │
      ├──────────────► React EntriesTable
      │
      └──────────────► SchemaRuleBuilder
                              │
                              ▼
                       Laravel validation
```

The exact supported field types and schema contract will be documented and
verified separately during the review.

---

## 8. Request Architecture

A typical entry request follows this general flow:

```text
Browser
   │
   ▼
React Component
   │
   ▼
Axios
   │
   ▼
Laravel Route
   │
   ▼
Authentication
   │
   ▼
Controller
   │
   ▼
Form Request
   │
   ▼
SchemaRuleBuilder
   │
   ▼
Validation
   │
   ▼
Model / Relationship
   │
   ▼
Database
   │
   ▼
JSON Response
   │
   ▼
React
```

The exact behavior of each stage is documented in:

`docs/architecture/request-flow.md`

---

## 9. Authentication Boundary

Authentication is handled by Laravel Sanctum.

The authentication mechanism establishes the identity of the current user.

Conceptually:

```text
Browser
   │
   ▼
Authentication
   │
   ▼
Authenticated User
   │
   ├── Modules
   │
   └── Resources owned by those Modules
```

Authentication establishes **who the user is**.

It does not by itself define which Modules or Entries the user is allowed
to access.

Authorization rules are documented separately in:

`docs/security/authorization.md`

---

## 10. Data Persistence

The application uses relational database entities for:

- users
- modules
- entries
- entry translations
- languages

The primary relationships are represented through foreign keys and Eloquent
model relationships.

The exact database structure, relationships, constraints, and translation
representation are documented in:

`docs/architecture/data-model.md`

---

## 11. File Handling

The CMS supports image/file uploads through a dedicated upload endpoint.

The frontend submits files independently from the main Entry payload.

The general flow is:

```text
User
 │
 ▼
EntryForm
 │
 ▼
File Upload Request
 │
 ▼
UploadController
 │
 ▼
Storage
 │
 ▼
URL / Path
 │
 ▼
Entry data
```

Upload security requirements and verification are documented in:

`docs/security/file-uploads.md`

---

## 12. Rich Text

Rich-text fields are edited using Tiptap.

The general flow is:

```text
EntryForm
   │
   ▼
RichTextEditor
   │
   ▼
Tiptap
   │
   ▼
HTML content
   │
   ▼
Entry payload
   │
   ▼
Backend
```

The security implications of accepting and rendering HTML are documented in:

`docs/security/rich-text.md`

---

## 13. Architectural Boundaries

The following boundaries are important to the system.

### Authentication

Determines the identity of the current user.

### Authorization

Determines whether the authenticated user may access a specific resource.

### Validation

Determines whether incoming data conforms to the expected schema and
constraints.

### Persistence

Stores validated application data in the database.

### Frontend

Provides the user interface and sends requests to the backend.

The frontend must not be considered a security boundary.

Security-sensitive authorization and validation decisions must be enforced
by the backend.

---

## 14. Current-State Rule

This document describes the architecture that exists in the implementation
being reviewed.

A behavior must not be documented as an implemented security or architectural
control unless it has been verified in the codebase and, where appropriate,
through tests.

Suspected behavior, proposed changes, and unresolved questions must be
documented separately.

---

## 15. Related Documentation

### Architecture

- `data-model.md`
- `request-flow.md`
- `frontend-architecture.md`

### Security

- `authentication.md`
- `authorization.md`
- `input-validation.md`
- `file-uploads.md`
- `rich-text.md`
- `security-checklist.md`

### Review

- `scope.md`
- `findings.md`
- `open-questions.md`
- `decisions.md`
- `review-log.md`

### Testing

- `test-strategy.md`
- `authorization-tests.md`
- `validation-tests.md`
- `regression-tests.md`