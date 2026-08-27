# Frontend Architecture

## 1. Purpose

This document describes the frontend architecture of the CMS, including:

- application structure
- component responsibilities
- API communication
- authentication flow
- state management
- form handling
- dynamic module and schema rendering
- multilingual data handling
- rich-text editing
- file uploads
- frontend/backend boundaries
- known architectural concerns

The frontend is implemented as a React application integrated into the Laravel application.

The frontend is responsible for presentation, user interaction, local UI state, and communication with the backend API.

It is **not** responsible for security or authorization enforcement.

---

## 2. Frontend Technology Stack

The current frontend stack consists of:

- React
- Vite
- Axios
- Tailwind CSS
- Tiptap
- Laravel Sanctum session authentication

The main frontend source directory is:

resources/js/

The main application entry points are:

- resources/js/app.js
- resources/js/app.jsx

---

## 3. Frontend Project Structure

The relevant frontend structure is:

resources/js/

├── app.js
├── app.jsx
│
├── components/
│   ├── EntriesManager.jsx
│   ├── EntriesTable.jsx
│   ├── EntryForm.jsx
│   ├── Login.jsx
│   ├── ModuleBuilder.jsx
│   ├── ModulesList.jsx
│   └── RichTextEditor.jsx
│
└── lib/
    └── api.js

Component responsibilities are described below.

---

## 4. Application Entry Point

The React application is initialized from:

resources/js/app.jsx

This file is responsible for bootstrapping the React application and rendering the main application component.

The application entry point should remain lightweight.

Business logic, API requests, authorization decisions, and domain-specific behavior should not be concentrated in the application bootstrap layer.

---

## 5. API Communication

API communication is centralized through:

resources/js/lib/api.js

The application uses Axios for HTTP communication with the Laravel backend.

The API client is responsible for communicating with endpoints under:

/api/*

Authentication uses Laravel Sanctum and session-based authentication.

The frontend should treat the backend API as the authoritative source for:

- authentication state
- authorization
- modules
- entries
- languages
- validation
- file upload permissions
- persisted data

The frontend must never be considered a security boundary.

---

## 6. Authentication Flow

The application uses Laravel Sanctum with session-based authentication.

The general flow is:

Browser

    ↓

/sanctum/csrf-cookie

    ↓

CSRF cookie established

    ↓

Login request

    ↓

Laravel authentication

    ↓

Authenticated session

    ↓

Authenticated API requests

The frontend uses the authenticated session when communicating with protected API endpoints.

Authentication answers:

"Who is the current user?"

Authorization is a separate concern and must answer:

"What is this user allowed to access or modify?"

The frontend must not attempt to replace backend authorization checks.

---

## 7. API Client Responsibilities

The API client should provide a consistent interface for API requests.

Typical responsibilities include:

- base API configuration
- CSRF/session handling where required
- HTTP requests
- common request configuration
- centralized error handling where appropriate

The current implementation contains separate Axios usage for the Sanctum CSRF initialization and the API client.

This currently works, but it is a potential cleanup area.

### Review item

Determine whether authentication and API communication should eventually be centralized into a single API/authentication abstraction.

This is currently considered technical debt rather than a security vulnerability.

---

## 8. Module Management

The module-related frontend components are:

- ModulesList.jsx
- ModuleBuilder.jsx

Their responsibilities are broadly divided as follows:

### ModulesList

Responsible for:

- displaying modules
- selecting a module
- initiating module creation
- initiating module editing
- interacting with module-level UI actions

### ModuleBuilder

Responsible for:

- creating and editing module definitions
- defining module name and slug
- defining module schema
- defining field types
- configuring field properties
- configuring translatable fields
- configuring select options

The frontend constructs the module schema representation that is sent to the backend.

However, the backend remains the authoritative validator of the schema.

---

## 9. Dynamic Schema Architecture

One of the core frontend characteristics of the CMS is dynamic form generation.

The module contains a schema definition.

The frontend uses that schema to determine which fields should be displayed.

The general flow is:

Module

    ↓

Module.schema

    ↓

EntryForm

    ↓

Dynamic field rendering

    ↓

User input

    ↓

API request

The frontend therefore does not have a fixed form for every CMS module.

Instead, EntryForm dynamically renders fields according to the module schema.

---

## 10. Entry Management

Entry-related functionality is divided into:

- EntriesManager.jsx
- EntriesTable.jsx
- EntryForm.jsx

### EntriesManager

Acts as the main coordinator for entry management.

Responsibilities include:

- loading languages
- loading entries
- selecting the active display language
- switching between list/create/edit views
- loading an entry for editing
- refreshing the entry list after changes
- coordinating EntryForm and EntriesTable

The component currently uses local React state for UI state.

---

## 11. Entry List

EntriesTable.jsx is responsible for displaying entries.

It receives:

- module schema
- entries
- available languages
- current language
- edit callback

The table dynamically generates columns from the module schema.

For translatable fields, the component selects the value corresponding to the currently selected language.

The frontend currently performs this language selection locally.

Example conceptual structure:

Entry

    ↓

field value

    ↓

if translatable

    ↓

value[currentLangCode]

    ↓

displayed value

This means the backend may return multilingual data while the frontend determines which language to display.

---

## 12. Entry Creation and Editing

EntryForm.jsx is responsible for:

- rendering dynamic fields
- maintaining form state
- handling translations
- coercing values according to field type
- submitting entry data
- handling image uploads
- integrating the rich-text editor

The form separates fields into:

- static fields
- translatable fields

This distinction is determined by:

field.translatable

---

## 13. Static Fields

Non-translatable fields are stored in a single state object.

Conceptually:

staticValues

    ↓

{
    fieldA: value,
    fieldB: value,
    fieldC: value
}

These values are submitted as part of:

data

The frontend performs basic type coercion before submission.

For example:

- integer → Number
- boolean → boolean
- other values → unchanged

This coercion is a convenience for the API contract.

It must not be considered validation.

The backend must validate all incoming values independently.

---

## 14. Translatable Fields

Translatable fields are maintained separately for each language.

Conceptually:

translations

    ↓

language

    ↓

field

    ↓

value

The frontend builds a structure similar to:

{
    languageId: {
        fieldName: value
    }
}

When submitting the form, this is transformed into the API payload.

The exact relationship between this frontend representation and the database representation is a current architectural review item.

See:

docs/architecture/data-model.md

and:

docs/review/open-questions.md

---

## 15. Language Handling

Languages are loaded from the backend API.

The frontend uses language information to:

- populate translation tabs
- select the active language
- display translated entry values
- construct translated entry payloads

The language code is resolved using:

- locale
- code
- short_code
- fallback logic

This fallback behavior should be reviewed because language identification should ideally have one canonical representation.

### Review item

Establish a single canonical language identifier used consistently across:

- database
- API
- frontend
- translations
- validation

---

## 16. Supported Field Types

EntryForm currently renders different input controls according to field type.

Current frontend handling includes:

- text
- richtext
- boolean
- date
- select
- image
- integer
- number
- generic text fallback

The supported field types must be explicitly defined and synchronized with the backend.

Currently there is evidence of inconsistency between frontend and backend field type definitions.

### Review requirement

The final architecture must define a single canonical field-type specification.

The following must not independently define incompatible field types:

- ModuleBuilder.jsx
- EntryForm.jsx
- backend schema validation
- SchemaRuleBuilder.php

This is a review item and should be resolved before the CMS schema system is considered stable.

---

## 17. Rich Text Editor

Rich text editing is implemented using:

resources/js/components/RichTextEditor.jsx

The editor uses:

- Tiptap
- StarterKit
- Highlight
- TextAlign

The editor stores content as HTML.

The general flow is:

User input

    ↓

Tiptap

    ↓

HTML

    ↓

EntryForm state

    ↓

API payload

    ↓

Backend

Rich text is therefore an important security boundary.

HTML generated by the editor must not automatically be considered safe merely because it originated from the CMS frontend.

The backend and/or output layer must define an explicit sanitization policy.

This is covered separately in:

docs/security/rich-text.md

---

## 18. Image Uploads

Image fields are handled by EntryForm.jsx.

The current flow is:

User selects image

    ↓

EntryForm

    ↓

POST /upload

    ↓

Upload API

    ↓

Returned URL/path

    ↓

Form state

    ↓

Entry payload

The frontend currently performs:

- file selection
- client-side MIME filtering through the input accept attribute
- upload request
- storing the returned URL/path
- image preview

The frontend file type restriction is not a security control.

The backend must independently validate:

- file type
- file content
- file size
- filename/path handling
- storage location
- access permissions
- executable file prevention

Upload security is documented separately in:

docs/security/file-uploads.md

---

## 19. Frontend State Management

The current application primarily uses local React state through:

useState

and:

useEffect

There is currently no global state-management library.

State is generally kept close to the component responsible for it.

Examples include:

EntriesManager:

- languages
- entries
- loading state
- errors
- current language
- current view
- selected entry

EntryForm:

- static field values
- translation values
- active language
- submission state

This is acceptable for the current application size.

A global state-management solution should only be introduced if the application develops a real requirement for shared state across unrelated component trees.

---

## 20. Loading and Error States

The frontend currently handles loading and error states locally.

Typical states include:

- loading entries
- loading languages
- loading an entry for editing
- submitting an entry
- upload failure
- API failure

The current implementation contains generic user-facing error messages.

For example, authentication failures may currently be displayed as:

"Invalid credentials"

even when the underlying problem may instead be:

- network failure
- server error
- CSRF failure
- unexpected API response

### Review item

Frontend error handling should distinguish between:

- authentication errors
- authorization errors
- validation errors
- network failures
- server errors
- unexpected responses

Error messages must not expose sensitive backend information.

---

## 21. Frontend Authorization Boundary

The frontend may hide or disable UI elements according to the user's permissions.

However, this is only a UX feature.

It is not authorization.

The backend must enforce every permission independently.

For example:

Hiding an Edit button

does not prevent:

PUT /api/modules/.../entries/...

A malicious user can call the API directly without using the React interface.

Therefore:

Frontend

    ↓

UX restrictions

Backend

    ↓

Actual authorization enforcement

This distinction is fundamental to the security architecture.

---

## 22. Module Ownership

The frontend operates on modules selected by the authenticated user.

However, the frontend must not assume that a module belongs to the current user merely because it was returned by a previous API request.

Every operation involving a module must be authorized by the backend.

The frontend should therefore treat module ownership as backend-enforced state.

---

## 23. Entry Ownership

Entries are indirectly owned through their Module.

The intended relationship is:

User

    ↓

Module

    ↓

Entry

Therefore an authenticated user should only be able to access an Entry when:

Entry belongs to Module

and:

Module belongs to authenticated User

The frontend must not attempt to enforce this relationship.

This relationship must be guaranteed by the API.

This is currently one of the highest-priority security review areas.

---

## 24. Frontend Routing and View State

The current entry management interface uses local component state to switch between views.

For example:

view = "list"

view = "create"

view = "edit"

This is currently sufficient for the application.

However, it means that:

- views are not necessarily represented by browser URLs
- browser back/forward behavior is limited
- deep linking to an edit screen may not be available

This is considered a UX/architecture consideration rather than a security issue.

---

## 25. Data Ownership and Trust Boundaries

The frontend receives data from the backend and sends user-controlled data back to the backend.

Therefore every frontend value must be treated as untrusted from the backend's perspective.

Examples include:

- module names
- module slugs
- schema definitions
- field values
- translation values
- select options
- image paths
- rich-text HTML

The frontend may provide validation and user-friendly constraints.

The backend must perform authoritative validation and authorization.

---

## 26. Frontend / Backend Responsibility Boundary

The responsibility boundary is:

### Frontend

Responsible for:

- rendering
- user interaction
- local UI state
- form state
- basic client-side validation
- API communication
- displaying backend results
- displaying backend validation errors
- UX-level permission handling

### Backend

Responsible for:

- authentication
- authorization
- ownership
- validation
- schema integrity
- database integrity
- file upload security
- rich-text sanitization
- business rules
- data persistence

The frontend must never be relied upon as a security mechanism.

---

## 27. Current Frontend Architectural Concerns

The following items require review:

### HIGH

- Backend authorization must protect every module and entry operation.
- Frontend assumptions about ownership must not replace backend authorization.
- Rich-text HTML must have a defined sanitization policy.
- Image upload security must be enforced server-side.

### MEDIUM

- Frontend and backend field-type definitions are currently inconsistent.
- Translation representation requires architectural clarification.
- Language identifier handling should be standardized.
- API error handling should distinguish different failure classes.
- Pagination is not currently fully represented in the frontend UI.

### LOW

- Authentication/API Axios instances could potentially be centralized.
- Entry view state could eventually be represented through frontend routing.
- Some component responsibilities may be further separated if the application grows.

---

## 28. Architectural Principles

The frontend architecture should follow these principles:

1. The backend is the security boundary.

2. The frontend must never be trusted for authorization.

3. Backend validation is authoritative.

4. UI validation exists for usability, not security.

5. Domain rules should not be duplicated unnecessarily between frontend and backend.

6. Dynamic schemas must have a canonical definition.

7. Translation representation must be consistent across frontend, API, and database.

8. API communication should have predictable request and error handling.

9. Components should have clear responsibilities.

10. Security-sensitive behavior must be enforced server-side.

---

## 29. Review Targets

During the security and architecture review, the following frontend areas must be inspected:

- authentication flow
- API client configuration
- credentials/session handling
- CSRF handling
- module loading
- module creation
- module editing
- module deletion
- entry listing
- entry creation
- entry editing
- entry deletion
- language selection
- translation payloads
- dynamic schema rendering
- field type handling
- select option handling
- image uploads
- rich-text HTML handling
- error handling
- loading states
- pagination
- unauthorized API responses
- unexpected API responses

The review must verify both:

- expected user behavior
- malicious or malformed requests

---

## 30. Related Documentation

Frontend architecture is connected to the following documents:

- docs/architecture/overview.md
- docs/architecture/data-model.md
- docs/architecture/request-flow.md
- docs/security/authentication.md
- docs/security/authorization.md
- docs/security/input-validation.md
- docs/security/file-uploads.md
- docs/security/rich-text.md
- docs/review/scope.md
- docs/review/findings.md
- docs/review/open-questions.md
- docs/testing/test-strategy.md
- docs/testing/authorization-tests.md
- docs/testing/validation-tests.md
- docs/testing/regression-tests.md