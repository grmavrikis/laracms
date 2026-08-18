<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EntryTranslation extends Model
{
    protected $fillable = ['entry_id', 'language_id', 'data'];

    protected $casts = [
        'data' => 'array',
    ];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(Entry::class);
    }

    public function language(): BelongsTo
    {
        return $this->belongsTo(Language::class);
    }
}
