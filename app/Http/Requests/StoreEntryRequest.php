<?php

namespace App\Http\Requests;

use App\Models\Module;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;

class StoreEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $moduleSlugOrId = $this->route('moduleSlug');

        $module = Module::where('slug', $moduleSlugOrId)
            ->orWhere('id', $moduleSlugOrId)
            ->firstOrFail();

        return SchemaRuleBuilder::build($module->schema);
    }
}
