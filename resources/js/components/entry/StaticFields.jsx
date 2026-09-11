import FieldInput from './FieldInput';
import FieldErrors from './FieldErrors';

/**
 * The schema fields that hold one value, whatever language anybody reads in.
 *
 * A photograph, a price, how many the room sleeps. They sit above the
 * translated ones because they are the entry's facts - what is true regardless
 * of the words chosen to describe it.
 */
export default function StaticFields({ fields, values, onChange, languages, errors, onError }) {
    if (fields.length === 0) {
        return null;
    }

    return (
        <div className="space-y-6">
            {fields.map((field) => (
                <div key={field.name}>
                    <label
                        htmlFor={`field-${field.name}`}
                        className="block text-sm font-semibold capitalize text-fg"
                    >
                        {field.name}
                    </label>
                    <FieldInput
                        field={field}
                        value={values[field.name]}
                        onChange={(value) => onChange(field.name, value)}
                        languages={languages}
                        onError={onError}
                    />
                    <FieldErrors errors={errors} fieldName={field.name} />
                </div>
            ))}
        </div>
    );
}
