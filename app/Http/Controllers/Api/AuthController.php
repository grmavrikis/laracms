<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
            // Regenerating the id is what defeats session fixation, so it stays
            // - but it is guarded, because a request that is not stateful has
            // no session to regenerate and session() threw on it.
            //
            // Sanctum only starts a session for an origin listed in
            // SANCTUM_STATEFUL_DOMAINS. Anything else - curl, another site,
            // the test suite - got a 500 for the *correct* password and a 401
            // for a wrong one, which is a difference an attacker can read
            // straight off the status code without ever holding a session.
            if ($request->hasSession())
            {
                $request->session()->regenerate();
            }

            return response()->json(['user' => Auth::user()]);
        }

        return response()->json(['message' => 'Invalid credentials'], 401);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out']);
    }

    public function user(Request $request)
    {
        return response()->json($request->user());
    }
}
