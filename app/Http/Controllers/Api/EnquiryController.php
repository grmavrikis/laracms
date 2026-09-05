<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Enquiry;
use Illuminate\Http\JsonResponse;

/**
 * The owner's inbox: read and delete, and nothing else (TASKS.md #66).
 *
 * There is deliberately no `update`. An enquiry is a record of what somebody
 * sent, not a document to revise - and the absence of the route is the
 * enforcement, so a PUT answers 405 rather than being quietly ignored.
 *
 * Deletion is permanent. A "deleted" enquiry still sitting in the table is
 * hard to explain to anybody asking what happened to their data, and the
 * panel asks for confirmation instead (TASKS.md -> Decisions).
 */
class EnquiryController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Enquiry::query()->newestFirst()->paginate(20));
    }

    public function destroy(Enquiry $enquiry): JsonResponse
    {
        $enquiry->delete();

        return response()->json(null, 204);
    }
}
