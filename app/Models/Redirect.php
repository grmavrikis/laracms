<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One address that has moved, and where it went (TASKS.md #69).
 *
 * Read only when nothing else answered - see `Redirects::answer` - so a stale
 * row can never hide a page that is live.
 */
class Redirect extends Model
{
    /**
     * The width of both path columns, and the length `Redirects::remember`
     * refuses above.
     *
     * Here rather than only in the migration because the service checks it
     * before writing, and two numbers that must agree should be one (#98).
     */
    public const PATH_MAX_LENGTH = 512;

    protected $fillable = ['from_path', 'to_path', 'status'];

    protected $casts = ['status' => 'integer'];
}
