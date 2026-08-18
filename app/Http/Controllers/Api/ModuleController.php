<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ModuleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255|unique:modules,slug',
            'schema' => 'required|array',
            'schema.*.name' => 'required|string|alpha_dash',
            'schema.*.type' => 'required|string|in:string,text,textarea,integer,boolean,date,datetime,select,image',
            'schema.*.translatable' => 'required|boolean',
            'schema.*.validation' => 'nullable|string',
            'schema.*.options' => 'nullable|array',
            'schema.*.options.*' => 'string'
        ]);

        $slug = $validated['slug'] ?: Str::slug($validated['name']);

        $module = Module::create([
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'slug' => $slug,
            'schema' => $validated['schema'],
        ]);

        return response()->json([
            'message' => 'Module created successfully.',
            'data' => $module
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $modules = Module::where('user_id', $request->user()->id)
            ->latest()
            ->get();

        return response()->json($modules);
    }
}
