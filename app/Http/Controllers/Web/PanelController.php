<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Services\InterfaceLocales;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\View\View;

/**
 * The one page the admin panel is (TASKS.md #96).
 *
 * It used to be a closure returning `view('admin')`. It is a controller now
 * because the page has to carry the reader's language and the strings for it:
 * the panel is a client-side shell, so anything it needs before its first
 * paint has to be in the document.
 *
 * The catalogue is **injected, not bundled**. That is the whole reason a new
 * locale is a file the owner drops in rather than a release: Vite never sees
 * it, so nothing has to be rebuilt.
 */
class PanelController extends Controller
{
    public function __construct(private readonly InterfaceLocales $locales)
    {
    }

    public function show(Request $request): View
    {
        $panel = $this->locales->forPanel($request->user());

        // So anything the page itself renders agrees with what the shell will
        // render once it starts.
        App::setLocale($panel['locale']);

        return view('admin', ['panel' => $panel]);
    }
}
