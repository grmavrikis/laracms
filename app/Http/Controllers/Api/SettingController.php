<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\SchemaRuleBuilder;
use App\Services\SiteSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * The one screen a client changes their own details on (TASKS.md #67).
 *
 * `show()` hands over **the schema as well as the values**, so the panel
 * builds its form from what the server declares. Adding a field is one edit in
 * `SiteSettings` and none in JavaScript - the same reason the field types are
 * generated rather than listed twice.
 *
 * `update()` validates with `SchemaRuleBuilder`, the same builder an Entry
 * goes through, because the fields are declared in a Module schema's shape.
 * That is the whole argument for the shape: settings get the two-level
 * translatable rules, the type rules and the custom rules for free, and there
 * is no second set to keep in step.
 */
class SettingController extends Controller
{
    public function __construct(private readonly SiteSettings $settings)
    {
    }

    public function show(): JsonResponse
    {
        Gate::authorize('viewAny', Setting::class);

        return response()->json([
            'schema' => $this->settings->schema(),
            'data' => $this->settings->all(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        Gate::authorize('update', Setting::class);

        $schema = $this->settings->schema();
        $rules = SchemaRuleBuilder::build($schema, 'data');

        // `present`, not the builder's `required`. An Entry with no data is
        // meaningless, which is why the builder says so; a settings save that
        // changes nothing is not, and `required` rejects an empty array - so
        // "clear everything" answered "the data field is required".
        $rules['data'] = ['present', 'array'];

        // The builder says what each declared field may hold; it says nothing
        // about a field nobody declared. Without this, an unknown key is
        // simply stored - and the settings row is read by core, so "whatever
        // the client posted" is not a thing to keep in it.
        $rules['data'][] = function (string $attribute, mixed $value, callable $fail): void
        {
            $unknown = array_diff(array_keys((array) $value), $this->settings->names());

            if ($unknown !== [])
            {
                $fail(__('Unknown settings: :unknown.', ['unknown' => implode(', ', $unknown)]));
            }
        };

        // Without these, a complaint reads "The data.facebook url field must be
        // a valid URL" - the request key, spelled out. The labels are already
        // declared and already translated, so the message can name the field
        // the way the screen does. (`:attribute` is the same mechanism #99
        // needs for the public form's Greek.)
        $attributes = [];

        foreach ($schema as $field)
        {
            $attributes["data.{$field['name']}"] = $field['label'];
            $attributes["data.{$field['name']}.*"] = $field['label'];
        }

        $validated = $request->validate($rules, [], $attributes);

        // `?? []` is reachable, and only became so with `present` above:
        // Laravel omits a key from `validated()` when it is an empty array
        // with no nested rule to match, so "clear everything" arrives here
        // with no `data` at all. Under the builder's `required` it could not,
        // which is what made this look like dead code.
        $this->settings->save($validated['data'] ?? []);

        return response()->json(['data' => $this->settings->all()]);
    }
}
