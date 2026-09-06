/*
 * The public site's only JavaScript (TASKS.md #97).
 *
 * **Why this exists.** A page is a file on disk, and a file cannot carry a
 * CSRF token, a confirmation, or the errors from somebody's last attempt -
 * all of which belong to one visitor. So the form markup stays server-rendered
 * and only the submit is JavaScript: this fetches the token when a visitor
 * first touches a form, posts, and renders the answer from JSON.
 *
 * **One submitter, not one per form.** A client's home page will carry an
 * enquiry, a newsletter box and a search before long. Any form opts in by
 * carrying `data-cms-form`; nothing here knows what an enquiry is.
 *
 * **Not built.** No bundler, no dependencies, and a fixed path on purpose: a
 * cached page is a file, and a hashed asset name baked into one is a script
 * that disappears on the next `npm run build` while the page pointing at it
 * survives. The panel's bundle is a separate world.
 *
 * The contract, all optional except the form's own attribute:
 *
 *   <form data-cms-form
 *         data-cms-form-sending="…" data-cms-form-error="…"
 *         data-cms-form-sent="…">
 *     <p  data-cms-form-status role="status" hidden></p>
 *     <ul data-cms-form-errors role="alert" hidden></ul>
 *
 * `data-cms-form-sent` is only a floor: the endpoint's own confirmation wins
 * when it sends one, and a form pointed at an endpoint that does not - a 204,
 * something a theme wrote - would otherwise empty itself and say nothing,
 * which reads as a failure.
 *
 * The wording arrives translated: the attributes from the template,
 * the confirmation from the endpoint's JSON. There is deliberately no
 * catalogue in here - that is the thing #96 took out of the panel's bundle,
 * and it would be worse on a public page, where it would ship every language
 * to every visitor.
 */
(function ()
{
    'use strict';

    var pending = null;

    /**
     * The forms whose answer has not come back yet.
     *
     * Disabling the submit button is not a guard: a form may have no button
     * this can find, and Enter in a text field submits without touching one.
     * Two enquiries from one impatient visitor is a real cost to the owner,
     * who reads both.
     */
    var inFlight = new WeakSet();

    /* --------------------------------------------------------- the token */

    function csrfCookie()
    {
        var match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);

        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * The cookie, fetching it first if this visitor has none.
     *
     * This is the moment the public site sets its first cookie, and it is why
     * the request is made on interaction rather than on load: somebody who
     * only reads a page is never given one.
     *
     * `/sanctum/csrf-cookie` already exists and is the same ordering `api.js`
     * uses to sign in - the token has to be in hand before the credentials
     * are sent, not after.
     */
    function token()
    {
        var existing = csrfCookie();

        if (existing)
        {
            return Promise.resolve(existing);
        }

        if (!pending)
        {
            pending = fetch('/sanctum/csrf-cookie', { credentials: 'same-origin' })
                .then(csrfCookie)
                .catch(function () { return null; })
                .then(function (value) { pending = null; return value; });
        }

        return pending;
    }

    /* -------------------------------------------------------- the answer */

    function show(element, text)
    {
        if (!element)
        {
            return;
        }

        element.textContent = text || '';
        element.hidden = !text;
    }

    function showErrors(form, messages)
    {
        var list = form.querySelector('[data-cms-form-errors]');

        if (!list)
        {
            return;
        }

        // Blanks are dropped rather than rendered. Every attribute except
        // `data-cms-form` is optional, so a theme that omits
        // `data-cms-form-error` would otherwise get a visible alert box
        // holding one empty line - announced as nothing by a screen reader
        // and read as a broken page by everybody else.
        var lines = messages.filter(function (message)
        {
            return typeof message === 'string' && message !== '';
        });

        list.textContent = '';

        lines.forEach(function (message)
        {
            var item = document.createElement('li');

            item.textContent = message;
            list.appendChild(item);
        });

        list.hidden = lines.length === 0;
    }

    /**
     * Laravel's 422 shape: `{ message, errors: { field: [line, …] } }`.
     * Flattened, because the markup that showed these server-side was one
     * list and a theme should not have to grow a slot per field to keep it.
     */
    function linesFrom(body)
    {
        var errors = (body && body.errors) || {};

        return Object.keys(errors).reduce(function (lines, field)
        {
            return lines.concat(errors[field]);
        }, []);
    }

    /* -------------------------------------------------------- the submit */

    /**
     * The button that submits this form, if it has one this can find.
     *
     * `[type="submit"]` alone is not enough: `<button>Send</button>` carries
     * no type attribute and its default *is* submit, so a theme writing the
     * shorter form got no disabling at all.
     */
    function submitButton(form)
    {
        return form.querySelector('button:not([type]), button[type="submit"], input[type="submit"]');
    }

    /**
     * Where this form posts.
     *
     * Read as an **attribute**, not as `form.action`: a control named `action`
     * shadows the property and hands back an element instead of a URL, and a
     * search or filter form carrying `<input name="action">` is ordinary. The
     * same shadowing is why `reset` is called off the prototype below.
     */
    function actionOf(form)
    {
        return form.getAttribute('action') || window.location.href;
    }

    function send(form)
    {
        if (inFlight.has(form))
        {
            return;
        }

        inFlight.add(form);

        var button = submitButton(form);
        var status = form.querySelector('[data-cms-form-status]');

        show(status, form.dataset.cmsFormSending || '');
        showErrors(form, []);

        if (button)
        {
            button.disabled = true;
        }

        return token()
            .then(function (value)
            {
                return fetch(actionOf(form), {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-XSRF-TOKEN': value || '',
                    },
                    body: new FormData(form),
                });
            })
            .then(function (response)
            {
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (body) { return { response: response, body: body }; });
            })
            .then(function (answer)
            {
                if (answer.response.ok)
                {
                    HTMLFormElement.prototype.reset.call(form);
                    show(status, answer.body.message || form.dataset.cmsFormSent || '');

                    return;
                }

                if (answer.response.status === 422)
                {
                    show(status, '');
                    showErrors(form, linesFrom(answer.body));

                    return;
                }

                // Anything else - 419 on an expired session, 429 from the
                // limiter, 500, a dropped connection - gets the template's own
                // wording rather than the body's. The framework's messages are
                // English until #99 lands, and a Greek visitor reading "Too
                // Many Attempts." would read it as a broken site.
                show(status, '');
                showErrors(form, [form.dataset.cmsFormError || '']);
            })
            .catch(function ()
            {
                show(status, '');
                showErrors(form, [form.dataset.cmsFormError || '']);
            })
            .then(function ()
            {
                inFlight.delete(form);

                if (button)
                {
                    button.disabled = false;
                }
            });
    }

    /* ---------------------------------------------------------- the wiring */

    // Delegated from the document, so a form added to the page later - a
    // theme that opens a contact panel on a click - needs no registration.
    document.addEventListener('submit', function (event)
    {
        var form = event.target.closest ? event.target.closest('[data-cms-form]') : null;

        if (!form)
        {
            return;
        }

        event.preventDefault();
        send(form);
    });

    // Warm the token on the first touch of any form, so the submit is one
    // request rather than two. Failing here costs nothing: `send()` asks
    // again, and the cookie check makes the second ask free.
    document.addEventListener('focusin', function (event)
    {
        if (event.target.closest && event.target.closest('[data-cms-form]'))
        {
            token();
        }
    });
})();
