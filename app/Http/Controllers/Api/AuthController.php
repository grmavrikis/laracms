<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InterfaceLocales;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (Auth::attempt($credentials))
        {
            // Regenerating the id is what defeats session fixation, so it
            // stays - but it is guarded, because a request that is not
            // stateful has no session to regenerate and session() threw on it.
            //
            // Sanctum starts a session only for an origin listed in
            // SANCTUM_STATEFUL_DOMAINS, so from anywhere else - curl, another
            // site, the test suite - this endpoint answered 500 to a correct
            // password and 401 to a wrong one. What the guard fixes is that:
            // the endpoint stops erroring on a request it should simply serve.
            //
            // It does *not* close the difference itself. A correct password
            // now answers 200 and a wrong one 401, which is just as readable -
            // as it is for every login endpoint ever written. Brute force is
            // held off by the rate limit on this route, not by this guard.
            if ($request->hasSession())
            {
                $request->session()->regenerate();
            }

            return response()->json(['user' => Auth::user()]);
        }

        return response()->json(['message' => __('Invalid credentials.')], 401);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => __('Logged out.')]);
    }

    public function user(Request $request)
    {
        return response()->json($request->user());
    }

    /**
     * The reader picks the language they read the panel in (TASKS.md #96).
     *
     * Validated against the files on disk rather than a list in code, so the
     * rule and the picker cannot disagree: whatever `lang/` holds is what may
     * be chosen. Null is allowed and means "follow the installation".
     */
    public function setLocale(Request $request, InterfaceLocales $locales)
    {
        $validated = $request->validate([
            'locale' => ['nullable', 'string', Rule::in($locales->available())],
        ]);

        $request->user()->update(['locale' => $validated['locale'] ?? null]);

        return response()->json(['locale' => $request->user()->locale]);
    }
}
