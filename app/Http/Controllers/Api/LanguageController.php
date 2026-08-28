<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Language;
use Illuminate\Http\JsonResponse;

class LanguageController extends Controller
{
    /**
     * The languages entries can be translated into.
     *
     * Unlike Modules these are installation-wide, so there is no ownership
     * check - only the requirement to be signed in, which the route group
     * applies.
     */
    public function index(): JsonResponse
    {
        // The order matters: the admin panel selects the first language it is
        // given as the one to display. Without an explicit ordering that is
        // whatever the database happens to return.
        return response()->json(
            Language::where('is_active', true)->orderBy('id')->get()
        );
    }
}
