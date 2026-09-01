<?php

namespace App\Http\Requests;

use App\Models\Module;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;

class StoreEntryRequest extends FormRequest
{
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
        return SchemaRuleBuilder::build($this->route('module')->schema, 'data');
    }
}
