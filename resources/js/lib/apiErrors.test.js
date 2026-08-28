import { describe, it, expect } from 'vitest';
import {
    validationErrors,
    errorSummary,
    messagesForField,
    messagesNotForFields,
} from './apiErrors';

// The payload shapes below were taken from the running API, not invented:
// a missing-field 422 returns errors keyed `data`, `data.r1` and `data.r2`,
// and SchemaRuleBuilder's unsupported-type failure returns a single `data` key.
const err = (status, data) => ({ response: { status, data } });

const fieldError = err(422, {
    message: 'The data.title field is required.',
    errors: { 'data.title': ['The data.title field is required.'] },
});

const schemaError = err(422, {
    message: "Module schema field 'x' declares unsupported type 'bogus'.",
    errors: { data: ["Module schema field 'x' declares unsupported type 'bogus'."] },
});

const perLanguageError = err(422, {
    errors: {
        'data.title.en': ['The data.title.en field is required.'],
        'data.title.el': ['The data.title.el field is required.'],
    },
});

describe('validationErrors', () => {
    it('extracts the field errors of a 422', () => {
        expect(Object.keys(validationErrors(fieldError))).toEqual(['data.title']);
    });

    it('returns nothing for any other status', () => {
        expect(validationErrors(err(403, {}))).toEqual({});
    });

    it('returns nothing when the request never reached the server', () => {
        expect(validationErrors({ message: 'Network Error' })).toEqual({});
    });
});

describe('messagesForField', () => {
    it('matches the plain key', () => {
        expect(messagesForField(validationErrors(fieldError), 'title'))
            .toEqual(['The data.title field is required.']);
    });

    it('covers every language of a translatable field', () => {
        expect(messagesForField(validationErrors(perLanguageError), 'title')).toHaveLength(2);
    });

    it('gives nothing for an unrelated field', () => {
        expect(messagesForField(validationErrors(fieldError), 'body')).toEqual([]);
    });

    it('does not treat the name as a loose prefix', () => {
        // `title` must not swallow the errors of `titles`.
        expect(messagesForField({ 'data.titles': ['x'] }, 'title')).toEqual([]);
    });
});

describe('messagesNotForFields', () => {
    it('surfaces a schema-level message that belongs to no field', () => {
        expect(messagesNotForFields(validationErrors(schemaError), ['title', 'body']))
            .toEqual(["Module schema field 'x' declares unsupported type 'bogus'."]);
    });

    it('leaves field messages to be shown beside their input', () => {
        expect(messagesNotForFields(validationErrors(fieldError), ['title'])).toEqual([]);
    });

    it('still surfaces a message for a field the form does not render', () => {
        expect(messagesNotForFields(validationErrors(fieldError), ['body']))
            .toEqual(['The data.title field is required.']);
    });
});

describe('errorSummary', () => {
    it('flattens the messages of a 422', () => {
        expect(errorSummary(fieldError)).toEqual(['The data.title field is required.']);
    });

    it('falls back to the top-level message when a 422 carries no errors', () => {
        expect(errorSummary(err(422, { message: 'Nope' }))).toEqual(['Nope']);
    });

    it('does not report a 403 as a network problem', () => {
        expect(errorSummary(err(403, {}))).toEqual(['You do not have permission to do that.']);
    });

    it('asks a 401 to sign in again', () => {
        expect(errorSummary(err(401, {}))).toEqual(['Your session has ended. Please sign in again.']);
    });

    it('asks a 419 to reload', () => {
        expect(errorSummary(err(419, {}))).toHaveLength(1);
    });

    it('explains that a 404 is gone', () => {
        expect(errorSummary(err(404, {})))
            .toEqual(['That item no longer exists. It may have been deleted.']);
    });

    it('treats a 5xx as a server problem', () => {
        expect(errorSummary(err(500, {})))
            .toEqual(['The server could not complete the request. Please try again.']);
    });

    it('treats an absent response as a connection problem', () => {
        expect(errorSummary({ message: 'Network Error' }))
            .toEqual(['Could not reach the server. Check your connection and try again.']);
    });

    it('uses the caller fallback for an unhandled status', () => {
        expect(errorSummary(err(418, {}), 'Failed to save.')).toEqual(['Failed to save.']);
    });
});

describe('errorSummary status overrides', () => {
    // On the sign-in form a 401 means the credentials were wrong, not that a
    // session expired - the default wording would be actively misleading.
    const signIn = { 401: 'Wrong email or password.' };

    it('replaces the default wording for the given status', () => {
        expect(errorSummary(err(401, { message: 'Invalid credentials' }), 'Could not sign you in.', signIn))
            .toEqual(['Wrong email or password.']);
    });

    it('leaves other statuses alone', () => {
        expect(errorSummary(err(419, {}), 'Could not sign you in.', signIn)).toHaveLength(1);
    });

    it('does not leak into callers that pass no overrides', () => {
        expect(errorSummary(err(401, {}))).toEqual(['Your session has ended. Please sign in again.']);
    });

    it('reports a failed csrf-cookie request as a connection problem, not bad credentials', () => {
        expect(errorSummary({ message: 'Network Error' }, 'Could not sign you in.', signIn))
            .toEqual(['Could not reach the server. Check your connection and try again.']);
    });

    it('does not report a 500 during sign-in as bad credentials', () => {
        expect(errorSummary(err(500, {}), 'Could not sign you in.', signIn))
            .toEqual(['The server could not complete the request. Please try again.']);
    });

    it('wins over the 422 field messages', () => {
        expect(errorSummary(err(422, { errors: { email: ['bad'] } }), 'x', { 422: 'Check your input.' }))
            .toEqual(['Check your input.']);
    });
});
