<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\EntryController;
use App\Http\Controllers\UploadController;
use Illuminate\Support\Facades\Route;

// Public Routes (Don't require login)
Route::post('/login', [AuthController::class, 'login']);

// Protected Routes (Require login)
Route::middleware('auth:sanctum')->group(function ()
{
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/languages', function ()
    {
        return response()->json(\App\Models\Language::where('is_active', true)->get());
    });


    // Modules Routes
    Route::post('/modules', [ModuleController::class, 'store']);
    Route::get('/modules', [ModuleController::class, 'index']);
    Route::delete('/modules/{moduleSlug}/entries/{id}', [EntryController::class, 'destroy']);

    // Entries Routes
    Route::post('/modules/{moduleSlug}/entries', [EntryController::class, 'store']);
    Route::get('/modules/{moduleSlug}/entries', [EntryController::class, 'index']);
    Route::get('/modules/{moduleSlug}/entries/{id}', [EntryController::class, 'show']);
    Route::put('/modules/{moduleSlug}/entries/{id}', [EntryController::class, 'update']);

    // Upload Route
    Route::post('/upload', [UploadController::class, 'store']);
});
