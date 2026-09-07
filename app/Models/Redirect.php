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
     * **Derived rather than chosen** (#98): a path this application generates
     * is `/{language}/{module}/{slug}`, and the two slug columns are 255 each
     * (`ModuleSlug::SLUG_MAX_LENGTH`, `EntrySlug::SLUG_MAX_LENGTH`) with a
     * five-character language code between two slashes. That is 518, and at
     * 512 the longest addresses a rename moves could not be recorded at all -
     * they were logged and skipped, so a page quietly kept its old URL dead.
     * `RedirectTest` pins the sum.
     *
     * The ceiling is InnoDB's: `from_path` is a unique index, and utf8mb4 makes
     * 768 characters exactly the 3072-byte key limit. 640 sits between the two
     * with room for a hand-written row's query string.
     */
    public const PATH_MAX_LENGTH = 640;

    protected $fillable = ['from_path', 'to_path', 'status'];

    protected $casts = ['status' => 'integer'];
}
