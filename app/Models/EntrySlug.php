<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One entry's URL segment in one language.
 *
 * `module_id` is copied from the entry rather than reached through it, so that
 * uniqueness can be enforced per Module and the public lookup is a single
 * indexed read - see the migration for why.
 */
class EntrySlug extends Model
{
    /**
     * Nothing reads them, and a slug's history is the entry's history.
     */
    public $timestamps = false;

    protected $fillable = ['entry_id', 'module_id', 'language_code', 'slug'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(Entry::class);
    }
}
