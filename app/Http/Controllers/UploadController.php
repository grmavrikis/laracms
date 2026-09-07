<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UploadController extends Controller
{
    /**
     * The largest image the panel accepts, in kilobytes (TASKS.md #98).
     *
     * It was an anonymous `2048` in the rule. Named here because it is a
     * decision - about what a phone photograph weighs and what a hotel's
     * upstream connection will finish sending - rather than a column width,
     * and because PHP's own `upload_max_filesize` has to be at least this.
     */
    public const MAX_KILOBYTES = 2048;

    public function store(Request $request)
    {
        $request->validate([
            // Two megabytes: enough for a photograph off a phone, and the
            // ceiling on what a slow connection will finish uploading.
            'image' => 'required|image|mimes:jpeg,png,jpg,webp,svg|max:' . self::MAX_KILOBYTES,
        ]);

        $path = $request->file('image')->store('uploads', 'public');

        return response()->json([
            'url' => Storage::url($path),
        ]);
    }
}
