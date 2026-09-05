<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LanguageController;
use App\Http\Controllers\Api\ModuleController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\EnquiryController;
use App\Http\Controllers\Api\EntryController;
use App\Http\Controllers\UploadController;
use Illuminate\Support\Facades\Route;

// Public Routes (Don't require login)
//
// The only unauthenticated write in the application, so it carries a limit of
// its own on top of the group's: five attempts a minute per email+address.
// See the `login` limiter in AppServiceProvider for why it is keyed that way.
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

// Protected Routes (Require login)
Route::middleware('auth:sanctum')->group(function ()
{
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    /*
     * The reader's own panel language (TASKS.md #96). A preference rather
     * than a setting, so it is on the user and each colleague sets their own;
     * the installation's default is `config('site.locale')`, and #67 moves
     * that into the database.
     */
    Route::put('/user/locale', [AuthController::class, 'setLocale']);

    Route::get('/languages', [LanguageController::class, 'index']);

    /*
     * What the site says about itself (TASKS.md #67). One screen, one row -
     * the notification address and the panel's default language among them,
     * which is why it is core's rather than a Module the client could rename.
     */
    Route::get('/settings', [SettingController::class, 'show']);
    Route::put('/settings', [SettingController::class, 'update']);


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

        // Both before {entry}, or the binding would try to resolve an Entry
        // called "order" - which is a 404 rather than an error that says so.
        //
        // Reordering is one request for the whole list rather than one per
        // row, so dragging three rows is not three round trips. The GET is
        // what makes that possible from a paginated table: the panel holds
        // fifteen rows and the order it sends has to cover the module.
        Route::get('/modules/{module}/entries/order', [EntryController::class, 'order']);
        Route::put('/modules/{module}/entries/order', [EntryController::class, 'reorder']);
        Route::get('/modules/{module}/entries/{entry}', [EntryController::class, 'show']);
        Route::put('/modules/{module}/entries/{entry}', [EntryController::class, 'update']);
        Route::delete('/modules/{module}/entries/{entry}', [EntryController::class, 'destroy']);
    });

    /*
     * The owner's enquiry inbox (TASKS.md #66). Read and delete only - there
     * is no update route, because an enquiry is a record of what was sent
     * rather than a document to revise, and the absence is the enforcement.
     */
    Route::get('/enquiries', [EnquiryController::class, 'index']);
    Route::delete('/enquiries/{enquiry}', [EnquiryController::class, 'destroy']);

    // Upload Route
    Route::post('/upload', [UploadController::class, 'store']);
});
