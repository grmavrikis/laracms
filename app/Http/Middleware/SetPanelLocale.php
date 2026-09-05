<?php

namespace App\Http\Middleware;

use App\Services\InterfaceLocales;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * The API answers in the language of whoever is asking (TASKS.md #96).
 *
 * The panel reads every one of its errors from the API, so without this the
 * screen is Greek until something goes wrong and English from then on - which
 * is worse than a panel that was never translated, because it looks broken
 * rather than unfinished.
 *
 * Applied to the whole API group and not only behind `auth:sanctum`: with no
 * user it resolves to the installation's locale, which is what the login
 * screen is rendered in, so a refused password is refused in the language the
 * form was written in.
 *
 * The public side has its own middleware - `SetLocale`, from the address.
 * These are different questions and neither may answer the other: a signed-in
 * Greek owner previewing the French page must read French.
 */
class SetPanelLocale
{
    public function __construct(private readonly InterfaceLocales $locales)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        App::setLocale($this->locales->resolve($request->user()));

        return $next($request);
    }
}
