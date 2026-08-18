<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,webp,svg|max:2048',
        ]);

        $path = $request->file('image')->store('uploads', 'public');

        return response()->json([
            'url' => Storage::url($path),
        ]);
    }
}
