# Request Flow

## 1. Purpose

This document describes how requests move through the CMS from the frontend to the Laravel backend and back to the frontend.

It defines the responsibilities of the main layers involved in a request:

- React frontend
- Axios API client
- Laravel routes
- Authentication middleware
- Controllers
- Form Requests
- Services
- Eloquent models
- Database
- API responses

This document describes the current architecture and request flow.

Security findings, architectural inconsistencies, and proposed changes are documented separately under `docs/review/` and `docs/security/`.

---

## 2. General Request Flow

The general request flow is:

    React Component
          │
          ▼
    Axios API Client
          │
          ▼
    Laravel API Route
          │
          ▼
    Authentication
          │
          ▼
    Controller
          │
          ├──────────────► Form Request
          │                    │
          │                    ▼
          │              Input Validation
          │
          ▼
    Application Logic
          │
          ▼
    Eloquent Models
          │
          ▼
    Database
          │
          ▼
    JSON Response
          │
          ▼
    Axios
          │
          ▼
    React State
          │
          ▼
    UI

The exact responsibilities of each layer are described below.

---

## 3. Frontend Request Layer

The CMS frontend is implemented using React.

Frontend components communicate with the Laravel API through Axios.

The main API client is located at:

    resources/js/lib/api.js

Components use this client for operations such as:

- authentication
- retrieving languages
- retrieving modules
- creating modules
- updating modules
- retrieving entries
- creating entries
- updating entries
- deleting entries
- uploading files

Example:

    api.get(`/modules/${module.slug}/entries`)

The frontend is responsible for:

- collecting user input
- displaying application state
- sending API requests
- displaying API responses
- displaying validation or operation errors

The frontend is not responsible for enforcing security boundaries.

Any authorization requirement must ultimately be enforced by the backend.

---

## 4. Authentication Flow

The application uses Laravel Sanctum for session-based authentication.

The authentication flow is approximately:

    React
      │
      │ GET /sanctum/csrf-cookie
      ▼
    Laravel
      │
      │ CSRF cookie
      ▼
    React
      │
      │ POST /api/login
      ▼
    AuthController
      │
      ▼
    Authenticated Session
      │
      ▼
    Protected API Requests

Protected API routes use Sanctum authentication middleware.

Authentication establishes the identity of the current user.

Conceptually:

    HTTP Request
          │
          ▼
    Sanctum
          │
          ▼
    Authenticated User

Authentication and authorization are separate concerns.

Authentication answers:

    Who is the user?

Authorization answers:

    Is this user allowed to access this resource?

---

## 5. API Routes

API routes are defined in:

    routes/api.php

The API is organized around the main CMS resources.

The primary resource relationships are:

    User
      │
      ▼
    Module
      │
      ▼
    Entry
      │
      ▼
    EntryTranslation

Entry endpoints currently follow the structure:

    /modules/{moduleSlug}/entries
    /modules/{moduleSlug}/entries/{id}

The Module identifies the parent resource while the Entry identifies the child resource.

The relationship between these resources is important because an Entry belongs to a Module and the Module belongs to a User.

---

## 6. Controller Layer

API controllers are located under:

    app/Http/Controllers/Api/

The main API controllers include:

    AuthController.php
    EntryController.php
    ModuleController.php

Controllers coordinate the request and application flow.

A typical controller flow is:

    HTTP Request
          │
          ▼
    Controller
          │
          ├── Resolve required resources
          │
          ├── Apply authorization
          │
          ├── Use validated input
          │
          └── Execute operation
          │
          ▼
    Model / Service
          │
          ▼
    API Response

Controllers should not contain unnecessary business logic when that logic belongs in a dedicated service or model layer.

---

## 7. Form Requests

Entry validation is handled through Laravel Form Requests.

The relevant classes are:

    app/Http/Requests/StoreEntryRequest.php
    app/Http/Requests/UpdateEntryRequest.php

Their primary responsibility is input validation.

The validation rules are generated dynamically from the Module schema.

The flow is:

    HTTP Request
          │
          ▼
    Form Request
          │
          ▼
    Module Schema
          │
          ▼
    SchemaRuleBuilder
          │
          ▼
    Laravel Validation Rules
          │
          ▼
    Validated Data

Authorization and validation are separate responsibilities.

Authorization determines whether the current user may perform the operation.

Validation determines whether the supplied data satisfies the rules defined for the resource.

---

## 8. Dynamic Schema Validation

Modules contain a dynamic schema defining their fields.

A simplified example is:

    Module
      │
      └── schema
            │
            ├── title
            │     type: string
            │
            ├── description
            │     type: richtext
            │
            └── published
                  type: boolean

The schema is processed by:

    app/Services/SchemaRuleBuilder.php

The resulting validation rules are used by the Entry Form Requests.

The general flow is:

    Module.schema
          │
          ▼
    SchemaRuleBuilder
          │
          ▼
    Validation Rules
          │
          ▼
    Validated Entry Data

The Module schema therefore acts as an important part of the CMS data model and validation system.

---

## 9. Module Request Flow

A Module request generally follows:

    React
      │
      ▼
    Axios
      │
      ▼
    API Route
      │
      ▼
    Authentication
      │
      ▼
    ModuleController
      │
      ▼
    Module
      │
      ▼
    Database
      │
      ▼
    JSON Response
      │
      ▼
    React

Module operations include:

- listing modules
- creating modules
- updating modules
- deleting modules

The Module contains the schema used by Entries belonging to that Module.

---

## 10. Entry Creation Flow

Creating an Entry follows the general flow:

    React EntryForm
          │
          ▼
    POST /modules/{moduleSlug}/entries
          │
          ▼
    Authentication
          │
          ▼
    EntryController
          │
          ▼
    StoreEntryRequest
          │
          ▼
    SchemaRuleBuilder
          │
          ▼
    Validation
          │
          ▼
    Entry
          │
          ▼
    EntryTranslation
          │
          ▼
    Database
          │
          ▼
    JSON Response
          │
          ▼
    React

The Entry payload contains the data defined by the Module schema.

Static fields and translatable fields are handled separately according to the current implementation.

---

## 11. Entry Retrieval Flow

Retrieving Entries follows:

    React EntriesManager
          │
          ▼
    GET /modules/{moduleSlug}/entries
          │
          ▼
    Authentication
          │
          ▼
    EntryController
          │
          ▼
    Module
          │
          ▼
    Module Entries
          │
          ▼
    Database
          │
          ▼
    JSON Response
          │
          ▼
    EntriesManager
          │
          ▼
    EntriesTable

Retrieving a single Entry follows:

    React
      │
      ▼
    GET /modules/{moduleSlug}/entries/{id}
      │
      ▼
    Authentication
      │
      ▼
    EntryController
      │
      ▼
    Entry
      │
      ▼
    Database
      │
      ▼
    JSON Response
      │
      ▼
    EntryForm

The parent Module and child Entry relationship must remain consistent throughout this flow.

---

## 12. Entry Update Flow

Updating an Entry follows:

    React EntryForm
          │
          ▼
    PUT /modules/{moduleSlug}/entries/{id}
          │
          ▼
    Authentication
          │
          ▼
    EntryController
          │
          ▼
    UpdateEntryRequest
          │
          ▼
    SchemaRuleBuilder
          │
          ▼
    Validation
          │
          ▼
    Entry
          │
          ▼
    Database
          │
          ▼
    JSON Response
          │
          ▼
    React
          │
          ▼
    EntriesManager
          │
          ▼
    EntriesTable

After a successful update, the frontend refreshes the Entry list.

---

## 13. Entry Deletion Flow

The Entry deletion flow is:

    React
      │
      ▼
    DELETE /modules/{moduleSlug}/entries/{id}
      │
      ▼
    Authentication
      │
      ▼
    EntryController
      │
      ▼
    Entry
      │
      ▼
    Database
      │
      ▼
    Response
      │
      ▼
    React

Deletion must operate within the same Module and ownership boundaries as retrieval and update.

---

## 14. Translation Flow

The CMS supports translatable fields.

The frontend currently represents a translatable field using language codes.

Conceptually:

    Entry data
        │
        └── title
              │
              ├── en
              └── el

For example:

    {
        "title": {
            "en": "Hello",
            "el": "Γεια"
        }
    }

The database also contains a dedicated:

    entry_translations

table with:

    entry_id
    language_id
    data

Therefore the exact relationship between the frontend representation and the database representation must be explicitly defined.

The two possible representations are:

### Representation A

    Entry.data
        │
        └── title
              ├── en
              └── el

### Representation B

    Entry
      │
      ├── EntryTranslation
      │       ├── language = en
      │       └── data
      │
      └── EntryTranslation
              ├── language = el
              └── data

The final canonical representation is an architectural decision that is documented separately.

---

## 15. Image Upload Flow

Image fields use a separate upload endpoint.

The frontend sends the selected file using:

    multipart/form-data

The general flow is:

    EntryForm
       │
       ▼
    File Input
       │
       ▼
    POST /upload
       │
       ▼
    UploadController
       │
       ▼
    File Storage
       │
       ▼
    File URL / Path
       │
       ▼
    EntryForm State
       │
       ▼
    Entry Payload

The upload process is independent from the final Entry creation/update request.

File upload security is documented in:

    docs/security/file-uploads.md

---

## 16. Rich Text Flow

Rich text fields are handled by Tiptap.

The frontend flow is:

    EntryForm
       │
       ▼
    RichTextEditor
       │
       ▼
    Tiptap
       │
       ▼
    HTML
       │
       ▼
    Entry Payload
       │
       ▼
    Laravel API

The RichTextEditor component is located at:

    resources/js/components/RichTextEditor.jsx

The editor produces HTML content.

HTML coming from the editor must therefore be treated as untrusted input.

The security requirements for rich text are documented in:

    docs/security/rich-text.md

---

## 17. Database Flow

The main database relationships are:

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

The main Eloquent models are:

    app/Models/User.php
    app/Models/Module.php
    app/Models/Entry.php
    app/Models/EntryTranslation.php
    app/Models/Language.php

Database operations are performed through these models and their relationships.

---

## 18. Response Flow

After the backend completes the requested operation, it returns a JSON response.

The response flow is:

    Database
       │
       ▼
    Eloquent Model
       │
       ▼
    Controller
       │
       ▼
    JSON Response
       │
       ▼
    Axios
       │
       ▼
    React State
       │
       ▼
    UI

The frontend is responsible for interpreting the response and updating the relevant component state.

For paginated responses, Laravel returns pagination metadata together with the data collection.

---

## 19. Error Flow

Errors can occur at different stages of the request lifecycle.

Conceptually:

    Request
       │
       ├── Authentication error
       │
       ├── Authorization error
       │
       ├── Validation error
       │
       ├── Application error
       │
       ├── Database error
       │
       └── Network / server error
                │
                ▼
           HTTP Response
                │
                ▼
             Axios
                │
                ▼
           React Error State

The backend should return an appropriate HTTP status and structured response.

The frontend should distinguish between different error categories instead of treating all failures as the same type of error.

---

## 20. Security Boundary

The frontend must not be considered a security boundary.

The following flow must be enforced by the backend:

    Request
       │
       ▼
    Authentication
       │
       ▼
    Authorization
       │
       ▼
    Resource Scope
       │
       ▼
    Validation
       │
       ▼
    Application Logic
       │
       ▼
    Database

The frontend may hide functionality that the current user cannot use, but this is only a UI concern.

Backend authorization must independently verify that the authenticated user is allowed to access or modify the requested Module and Entry.

---

## 21. Review Considerations

The request flow will be reviewed against the following questions:

1. Is every protected endpoint authenticated?

2. Is authorization enforced server-side?

3. Is every Entry correctly scoped to its Module?

4. Is every Module correctly scoped to its owner?

5. Can a user access another user's Module or Entry by modifying URL parameters?

6. Are Form Requests responsible only for validation?

7. Is dynamic schema validation strict and consistent?

8. Is the same schema definition used consistently by the frontend and backend?

9. Is the translation representation consistent between frontend, models, and database?

10. Are file uploads validated and stored safely?

11. Is rich-text content sanitized appropriately?

12. Are database operations performed inside the correct ownership scope?

13. Are errors returned consistently?

14. Are important operations covered by automated tests?

The findings from this review are documented in:

    docs/review/findings.md

Open architectural questions are documented in:

    docs/review/open-questions.md

Final architectural decisions are documented in:

    docs/review/decisions.md

---

## 22. Related Documentation

Architecture:

    docs/architecture/overview.md
    docs/architecture/data-model.md
    docs/architecture/frontend-architecture.md

Security:

    docs/security/authentication.md
    docs/security/authorization.md
    docs/security/input-validation.md
    docs/security/file-uploads.md
    docs/security/rich-text.md
    docs/security/security-checklist.md

Review:

    docs/review/scope.md
    docs/review/findings.md
    docs/review/open-questions.md
    docs/review/decisions.md
    docs/review/review-log.md

Testing:

    docs/testing/test-strategy.md
    docs/testing/authorization-tests.md
    docs/testing/validation-tests.md
    docs/testing/regression-tests.md