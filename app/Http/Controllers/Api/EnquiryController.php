<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Enquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

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
 *
 * Both methods ask a policy, like every other admin endpoint. The answer today
 * is "anybody signed in" and the route group has established that already - so
 * the calls change nothing yet, which is the point: when group permissions
 * arrive they land in the policies, and the endpoint that never asked one is
 * the hole nobody remembers. This one holds visitors' names, addresses and
 * phone numbers.
 */
class EnquiryController extends Controller
{
    public function index(): JsonResponse
    {
        Gate::authorize('viewAny', Enquiry::class);

        return response()->json(Enquiry::query()->newestFirst()->paginate(20));
    }

    public function destroy(Enquiry $enquiry): JsonResponse
    {
        Gate::authorize('delete', $enquiry);

        $enquiry->delete();

        return response()->json(null, 204);
    }
}
