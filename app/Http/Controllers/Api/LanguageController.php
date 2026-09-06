<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Language;
use Illuminate\Http\JsonResponse;

class LanguageController extends Controller
{
    /**
     * The languages entries can be translated into - **all of them, including
     * the ones the public site does not serve yet** (TASKS.md #114).
     *
     * This used to filter `is_active`, and that made one endpoint answer two
     * audiences that need different answers. A language switched on so the
     * client can translate into it puts a link in the public switcher to a
     * half-empty site while they work; switched off, the panel cannot see it
     * at all and they cannot translate. Neither is usable, and the workflow
     * this blocks is a paid one: the agency adds a language (BUSINESS.md 5 -
     * there is deliberately no endpoint), the client fills it in, and only
     * then does it go live.
     *
     * The public side never asked this endpoint anything - `PageController`
     * and `SitemapController` query `is_active` themselves - so what a visitor
     * sees is untouched. `is_active` is in the payload, and the panel shows it.
     *
     * Installation-wide rather than per-owner, so there is no ownership check;
     * the route group requires a session.
     */
    public function index(): JsonResponse
    {
        // The order matters: the admin panel selects the first language it is
        // given as the one to display. Without an explicit ordering that is
        // whatever the database happens to return.
        return response()->json(Language::orderBy('id')->get());
    }
}
