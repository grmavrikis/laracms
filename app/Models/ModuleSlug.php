<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Module's name and URL segment in one language (TASKS.md #114).
 *
 * The pair travels together because they are the same decision: "in French
 * this section is called Services and lives at /fr/prestations". Splitting
 * them would let a client translate the name and leave the address, which is
 * the state #114 was raised about.
 */
class ModuleSlug extends Model
{
    /** Nothing reads them, and a module's history is the module's. */
    public $timestamps = false;

    protected $fillable = ['module_id', 'language_code', 'name', 'slug'];

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }
}
