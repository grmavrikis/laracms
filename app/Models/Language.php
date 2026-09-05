<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Language extends Model
{
    protected $fillable = ['name', 'code', 'is_default', 'is_active'];

    protected $casts = [
        'is_default' => 'boolean',
        'is_active' => 'boolean',
    ];

    /**
     * The language the site opens on, and the one a required translation must
     * be written in.
     *
     * Falls back to the first active row, because nothing enforces that
     * exactly one language carries the flag (TASKS.md #49) - and answering
     * `null` would quietly turn every `required` translation optional. The
     * panel's `defaultLanguage()` in `lib/languages.js` falls back the same
     * way, so the two sides open on the same language.
     */
    public static function default(): ?self
    {
        return static::query()
            ->where('is_active', true)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();
    }
}
