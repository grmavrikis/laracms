<?php

namespace App\Http\Requests;

use App\Models\Module;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;

class UpdateEntryRequest extends FormRequest
{
    /**
     * Updating an Entry means writing into the Module, so it requires
     * ownership of that Module. The Entry itself is already guaranteed to
     * belong to this Module by the scoped route binding.
     */
    public function authorize(): bool
    {
        $module = $this->route('module');

        return $module instanceof Module
            && $this->user()?->can('update', $module);
    }

    public function rules(): array
    {
        // Taken from the Module in the URL, not from a global Entry lookup:
        // the scoped binding guarantees the Entry belongs to this Module.
        return SchemaRuleBuilder::build($this->route('module')->schema);
    }
}
