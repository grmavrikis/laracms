// @vitest-environment jsdom

/**
 * The public site's form submitter (TASKS.md #97).
 *
 * **Not beside its source**, and that is deliberate: the source is
 * `public/forms.js`, which is web-reachable, so a `.test.js` next to it would
 * be served to visitors. It is loaded from disk and evaluated verbatim rather
 * than copied here - the file that ships is the file under test, which is the
 * whole reason it is not built.
 *
 * This is the first test in the project to need a DOM. `jsdom` arrived with
 * it, which is also what #94 has been waiting for.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const source = readFileSync(resolve(__dirname, '../../public/forms.js'), 'utf8');

/** Let the submitter's promise chain finish. */
const settle = () => new Promise((done) => setTimeout(done, 0));

const answer = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

/** The posts the submitter made, ignoring the token fetch. */
const posts = () => fetch.mock.calls.filter(([url]) => !String(url).includes('csrf-cookie'));

const form = (attributes = '', fields = '<button type="submit">Send</button>') =>
{
    document.body.innerHTML = `
        <form method="POST" action="/el/enquiries" data-cms-form ${attributes}>
            <p data-cms-form-status hidden></p>
            <ul data-cms-form-errors hidden></ul>
            <input type="text" name="name">
            ${fields}
        </form>`;

    // Typed rather than written as an attribute: `reset()` restores a field to
    // its *default*, so `value="typed"` in the markup would make the reset a
    // no-op and the test would assert nothing. This is what a visitor does.
    const element = document.querySelector('form');

    element.querySelector('[name="name"]').value = 'typed';

    return element;
};

const submit = async (element) =>
{
    element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await settle();
};

beforeAll(() =>
{
    // The listeners are registered on `document` once, exactly as a page does
    // it. Evaluating the file is the only setup there is - it has no exports
    // and takes no configuration.
    // eslint-disable-next-line no-eval
    (0, eval)(source);
});

beforeEach(() =>
{
    document.cookie = 'XSRF-TOKEN=a-token; path=/';
    globalThis.fetch = vi.fn(() => Promise.resolve(answer(200, { status: 'sent', message: 'Thank you.' })));
});

describe('the happy path', () =>
{
    test('posts to the form\'s action and shows what the endpoint said', async () =>
    {
        const element = form();

        await submit(element);

        const [url, options] = posts()[0];

        expect(url).toBe('/el/enquiries');
        expect(options.method).toBe('POST');
        expect(options.headers['X-XSRF-TOKEN']).toBe('a-token');
        expect(document.querySelector('[data-cms-form-status]').textContent).toBe('Thank you.');
        expect(document.querySelector('[data-cms-form-status]').hidden).toBe(false);
    });

    test('empties the form, because the page never reloads', async () =>
    {
        const element = form();

        await submit(element);

        expect(element.querySelector('[name="name"]').value).toBe('');
    });

    /**
     * An endpoint that answers 2xx without wording would otherwise empty the
     * form and say nothing, which a visitor reads as "it did not send" - and
     * they send it again.
     */
    test('falls back to the template\'s wording when the answer carries none', async () =>
    {
        fetch.mockResolvedValue(answer(204, {}));

        const element = form('data-cms-form-sent="Sent."');

        await submit(element);

        expect(element.querySelector('[data-cms-form-status]').textContent).toBe('Sent.');
    });
});

describe('the token', () =>
{
    test('is fetched first when the visitor has no cookie yet', async () =>
    {
        document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';

        fetch.mockImplementation((url) =>
        {
            if (String(url).includes('csrf-cookie'))
            {
                document.cookie = 'XSRF-TOKEN=fetched; path=/';

                return Promise.resolve(answer(204, {}));
            }

            return Promise.resolve(answer(200, { message: 'ok' }));
        });

        await submit(form());

        expect(fetch.mock.calls[0][0]).toBe('/sanctum/csrf-cookie');
        expect(posts()[0][1].headers['X-XSRF-TOKEN']).toBe('fetched');
    });

    test('is not fetched again when the visitor already has one', async () =>
    {
        await submit(form());

        expect(fetch.mock.calls.some(([url]) => String(url).includes('csrf-cookie'))).toBe(false);
    });
});

describe('a refusal', () =>
{
    test('lists every message the server sent, across fields', async () =>
    {
        fetch.mockResolvedValue(answer(422, {
            message: 'invalid',
            errors: { email: ['Bad address.'], consent: ['Please agree.', 'Really.'] },
        }));

        const element = form();

        await submit(element);

        const shown = [...element.querySelectorAll('[data-cms-form-errors] li')].map((li) => li.textContent);

        expect(shown).toEqual(['Bad address.', 'Please agree.', 'Really.']);
        expect(element.querySelector('[data-cms-form-errors]').hidden).toBe(false);
        expect(element.querySelector('[data-cms-form-status]').hidden).toBe(true);
    });

    test('keeps what was typed, so nobody fills the form twice', async () =>
    {
        fetch.mockResolvedValue(answer(422, { errors: { email: ['Bad address.'] } }));

        const element = form();

        await submit(element);

        expect(element.querySelector('[name="name"]').value).toBe('typed');
    });

    /**
     * A 429 or a 419 carries a framework message, and those are English until
     * #99 lands - a Greek visitor reading "Too Many Attempts." reads a broken
     * site rather than "wait a minute".
     */
    test('shows the template\'s wording rather than the framework\'s', async () =>
    {
        fetch.mockResolvedValue(answer(429, { message: 'Too Many Attempts.' }));

        const element = form('data-cms-form-error="Try again shortly."');

        await submit(element);

        expect(element.querySelector('[data-cms-form-errors]').textContent).toBe('Try again shortly.');
    });

    test('says nothing at all rather than showing an empty box', async () =>
    {
        fetch.mockResolvedValue(answer(500, {}));

        // No `data-cms-form-error`, which the contract allows.
        const element = form();

        await submit(element);

        const list = element.querySelector('[data-cms-form-errors]');

        expect(list.querySelectorAll('li')).toHaveLength(0);
        expect(list.hidden).toBe(true);
    });

    test('is survivable: a dropped connection is not an unhandled rejection', async () =>
    {
        fetch.mockRejectedValue(new TypeError('network'));

        const element = form('data-cms-form-error="Try again shortly."');

        await submit(element);

        expect(element.querySelector('[data-cms-form-errors]').textContent).toBe('Try again shortly.');
    });
});

describe('what makes it a shared mechanism rather than the enquiry form\'s', () =>
{
    test('ignores a form that has not opted in', async () =>
    {
        document.body.innerHTML = '<form action="/somewhere"><button type="submit">Go</button></form>';

        await submit(document.querySelector('form'));

        expect(fetch).not.toHaveBeenCalled();
    });

    /**
     * `<button>` carries no type attribute and its default *is* submit, so a
     * theme writing the shorter form got no disabling at all - and with it no
     * protection against a second submission.
     */
    test('disables a button that never said it was a submit button', async () =>
    {
        let disabledDuringFlight = null;

        const element = form('', '<button>Send</button>');

        fetch.mockImplementation(() =>
        {
            disabledDuringFlight = element.querySelector('button').disabled;

            return Promise.resolve(answer(200, { message: 'ok' }));
        });

        await submit(element);

        expect(disabledDuringFlight).toBe(true);
        expect(element.querySelector('button').disabled).toBe(false);
    });

    /**
     * Enter in a text field submits without touching a button, so disabling
     * one is not the guard. Two enquiries from one impatient visitor is a real
     * cost to the owner, who reads both.
     */
    test('sends once when a visitor submits twice before the answer comes back', async () =>
    {
        const element = form();

        let release;
        fetch.mockReturnValue(new Promise((resolve) => { release = () => resolve(answer(200, { message: 'ok' })); }));

        element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        // Waited for rather than asserted immediately: the token is a promise
        // even when the cookie is already there, so the post is a microtask
        // away and asserting now would pass whether or not the guard exists.
        await settle();

        expect(posts()).toHaveLength(1);

        release();
        await settle();

        // And the guard is released, so a correction can be sent afterwards.
        await submit(element);

        expect(posts()).toHaveLength(2);
    });

    /**
     * A control named `action` or `reset` **replaces** the form property of
     * that name. `HTMLFormElement` is declared `[LegacyOverrideBuiltIns]`, so
     * named controls win over everything, methods included - checked in Chrome
     * against a form carrying all three:
     *
     *     f.action -> HTMLInputElement     f.reset -> object (not callable)
     *     f.method -> HTMLInputElement     f.getAttribute('action') -> "/real"
     *
     * A search or filter form carrying `<input name="action">` is ordinary,
     * and this submitter is advertised as taking any form.
     *
     * **jsdom does not implement that override**, so simply adding the control
     * proves nothing here - an earlier version of these two tests passed
     * whether the fix was present or not. The property is replaced by hand
     * instead, which is what the browser does one layer down.
     */
    const shadow = (element, name) =>
    {
        Object.defineProperty(element, name, {
            configurable: true,
            value: element.querySelector(`[name="${name}"]`),
        });
    };

    test('reads the action as an attribute, so a field named action cannot shadow it', async () =>
    {
        const element = form('', '<input type="hidden" name="action" value="search"><button type="submit">Go</button>');

        shadow(element, 'action');

        await submit(element);

        expect(posts()[0][0]).toBe('/el/enquiries');
    });

    test('resets through the prototype, so a field named reset cannot shadow it', async () =>
    {
        const element = form('', '<input type="hidden" name="reset" value="1"><button type="submit">Go</button>');

        shadow(element, 'reset');

        await submit(element);

        expect(element.querySelector('[name="name"]').value).toBe('');
    });

    test('sends the whole form, honeypot included', async () =>
    {
        const element = form('', '<input type="text" name="website" value=""><button type="submit">Go</button>');

        await submit(element);

        expect([...posts()[0][1].body.keys()]).toContain('website');
    });
});
