<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesStructuralFields;
use App\Models\Language;
use App\Models\Module;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;

class StoreEntryRequest extends FormRequest
{
    use ValidatesStructuralFields;

    /**
     * Creating an Entry means writing into the Module, so it requires
     * ownership of that Module. Runs before rules(), which keeps the
     * Module's schema from leaking to users who cannot write to it.
     */
    public function authorize(): bool
    {
        $module = $this->route('module');

        return $module instanceof Module
            && $this->user()?->can('update', $module);
    }

    public function rules(): array
    {
        // Already resolved by route model binding - no second lookup.
        //
        // `data` is what this request carries, so a complaint about the schema
        // is reported against a field it actually has. Keyed `schema` it named
        // one that only exists when a Module is being created.
        $module = $this->route('module');

        // The schema decides `data`; the structural columns are the same for
        // every Module and are described separately.
        // `required` on a translatable field means the default language.
        // See SchemaRuleBuilder for why, and Language::default() for what
        // happens when no row carries the flag.
        return SchemaRuleBuilder::build($module->schema, 'data', Language::default()?->code)
            + $this->structuralRules($module);
    }
}
