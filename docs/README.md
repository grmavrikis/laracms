# CMS Documentation

## Purpose

This documentation describes the architecture, security model, data flow,
review process, testing strategy, and known technical risks of the CMS.

The documentation is intended to serve as the reference point for:

- understanding the current system
- performing security and architecture reviews
- recording findings and decisions
- planning and tracking fixes
- defining regression and security tests

---

## Documentation Structure

### Architecture

Documents how the system is structured and how its components interact.

- `architecture/overview.md`
  - High-level application architecture and major components.

- `architecture/data-model.md`
  - Database entities, relationships, ownership, and data representation.

- `architecture/request-flow.md`
  - Request lifecycle from frontend to API, validation, authorization,
    persistence, and response.

- `architecture/frontend-architecture.md`
  - React component structure, state management, API communication,
    and frontend responsibilities.

### Security

Documents the security model and security boundaries of the application.

- `security/authentication.md`
  - Authentication mechanism and session/API authentication flow.

- `security/authorization.md`
  - User permissions, ownership, resource access, and authorization rules.

- `security/input-validation.md`
  - Request validation, dynamic schemas, allowed field types,
    and input constraints.

- `security/file-uploads.md`
  - File upload validation, storage, access, and abuse prevention.

- `security/rich-text.md`
  - Rich-text handling, HTML sanitization, and XSS protection.

- `security/security-checklist.md`
  - Final security verification checklist.

### Review

Contains the actual review process and its results.

- `review/scope.md`
  - Defines what is included and excluded from the review.

- `review/findings.md`
  - Confirmed security, architectural, functional, and reliability findings.

- `review/open-questions.md`
  - Issues that cannot yet be classified because additional investigation
    or architectural decisions are required.

- `review/decisions.md`
  - Explicit architectural and security decisions made during the review.

- `review/review-log.md`
  - Chronological record of the review process and changes.

### Testing

Defines how the system will be verified after changes.

- `testing/test-strategy.md`
  - Overall testing approach.

- `testing/authorization-tests.md`
  - Tests for ownership and access control.

- `testing/validation-tests.md`
  - Tests for schema and input validation.

- `testing/regression-tests.md`
  - Tests ensuring existing functionality is not broken by security
    or architectural changes.

---

## Review Workflow

The review follows this order:

1. **Document the current system**
2. **Map architecture and data flow**
3. **Identify security boundaries**
4. **Review authorization and ownership**
5. **Review input validation**
6. **Review file uploads and rich-text handling**
7. **Identify architectural inconsistencies**
8. **Record confirmed findings**
9. **Record unresolved questions**
10. **Make explicit architectural decisions**
11. **Implement fixes**
12. **Add security and regression tests**
13. **Perform final review**

No production code should be changed solely because an issue is suspected.

A suspected issue must first be:

- reproduced,
- verified against the actual application flow,
- classified,
- and recorded in the review documentation.

---

## Finding Severity

Findings use the following severity levels:

### HIGH

Issues that can lead to:

- unauthorized access to another user's data
- privilege escalation
- data modification or deletion without authorization
- authentication bypass
- significant data exposure
- remote code execution or equivalent critical impact

### MEDIUM

Issues with meaningful security, integrity, reliability, or architectural
impact that require exploitation of additional conditions or have limited scope.

### LOW

Minor security, reliability, maintainability, or consistency issues.

### INFO

Observations, technical debt, cleanup opportunities, or recommendations
without an immediate security or functional impact.

---

## Finding Status

Each finding should have one of the following statuses:

- `OPEN` — confirmed and requires action
- `INVESTIGATING` — requires additional evidence
- `ACCEPTED` — known issue intentionally accepted
- `FIXED` — implementation completed
- `VERIFIED` — fix tested and confirmed
- `REJECTED` — investigation determined that the suspected issue is not valid

---

## Important Principle

The documentation describes the **current state** of the application unless
explicitly marked otherwise.

Proposed architecture, future changes, and remediation plans must not be
presented as if they already exist.

The review therefore distinguishes between:

**Current state**

What the application actually does now.

**Finding**

A verified problem or risk in the current state.

**Decision**

What the system should do.

**Fix**

The implementation of that decision.

**Verification**

Evidence that the fix works and does not introduce a regression.

---

## Source of Truth

When documentation and implementation disagree, the implementation must be
investigated and the documentation updated accordingly.

Documentation must not be used to assume that a security control exists.

For example:

> "Users can only access their own modules"

is not considered true merely because it is documented.

The backend implementation and tests must enforce and verify this rule.

---

## Review Principle

The objective is not simply to remove individual bugs.

The objective is to establish a system where:

- authentication identifies the user correctly
- authorization enforces ownership and permissions
- resources are correctly scoped
- input is validated according to a single consistent schema
- uploaded content is safely handled
- rich text cannot introduce XSS
- frontend restrictions are not treated as security controls
- backend rules are authoritative
- database relationships preserve data integrity
- security-sensitive behavior is covered by tests
- future changes can be reviewed without reintroducing existing vulnerabilities