<?php

namespace App\Http\Requests;

use App\Models\Entry;
use App\Services\SchemaRuleBuilder;
use Illuminate\Foundation\Http\FormRequest;

class UpdateEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $entry = Entry::findOrFail($this->route('id'));

        return SchemaRuleBuilder::build($entry->module->schema);
    }
}
