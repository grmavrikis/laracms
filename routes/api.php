<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LanguageController;
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

    Route::get('/languages', [LanguageController::class, 'index']);


    // Modules Routes
    Route::post('/modules', [ModuleController::class, 'store']);
    Route::get('/modules', [ModuleController::class, 'index']);

    // Entries Routes
    //
    // {module} resolves by slug (Module::getRouteKeyName). scopeBindings()
    // makes {entry} resolve through $module->entries(), so an Entry that
    // does not belong to this Module is a 404 - enforced by the framework
    // rather than by a check each controller method has to remember.
    Route::scopeBindings()->group(function ()
    {
        Route::get('/modules/{module}/entries', [EntryController::class, 'index']);
        Route::post('/modules/{module}/entries', [EntryController::class, 'store']);
        Route::get('/modules/{module}/entries/{entry}', [EntryController::class, 'show']);
        Route::put('/modules/{module}/entries/{entry}', [EntryController::class, 'update']);
        Route::delete('/modules/{module}/entries/{entry}', [EntryController::class, 'destroy']);
    });

    // Upload Route
    Route::post('/upload', [UploadController::class, 'store']);
});
