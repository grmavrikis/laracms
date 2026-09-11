import { messagesForField } from '../../lib/apiErrors';

/**
 * A field's own validation messages, beneath the field.
 *
 * `langCode` narrows them to the translation being edited. Without it a
 * complaint about French was rendered under the Greek input - telling the
 * author the Greek box was wrong when it was not, and giving no hint that the
 * problem was on a tab they could not see.
 *
 * Pass no `langCode` for a field that is not translatable: a gallery's keys
 * nest deeper than one segment and must not be filtered.
 */
export default function FieldErrors({ errors, fieldName, langCode = null }) {
    const messages = messagesForField(errors, fieldName, langCode);

    if (messages.length === 0) {
        return null;
    }

    return (
        <ul className="mt-1.5 space-y-0.5 text-xs text-danger-text">
            {messages.map((message, i) => <li key={i}>{message}</li>)}
        </ul>
    );
}
