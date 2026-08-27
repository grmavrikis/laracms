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
        return SchemaRuleBuilder::build($this->route('module')->schema);
    }
}
