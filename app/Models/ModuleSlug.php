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
    /**
     * The width of what a **visitor** reads: this module's title and address in
     * one language (TASKS.md #98).
     *
     * Its own constants rather than `Module`'s, although the numbers match:
     * `modules.name` is the panel's and this is the public one, which is the
     * distinction #114 exists for.
     */
    public const NAME_MAX_LENGTH = 255;

    public const SLUG_MAX_LENGTH = 255;

    /** Nothing reads them, and a module's history is the module's. */
    public $timestamps = false;

    protected $fillable = ['module_id', 'language_code', 'name', 'slug'];

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }
}
