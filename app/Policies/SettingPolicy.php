<?php

namespace App\Policies;

use App\Models\Setting;
use App\Models\User;

/**
 * Who may read and change what the site says about itself (TASKS.md #67).
 *
 * The same answer as everywhere else for now - see `ModulePolicy` - and here
 * for the same reason `EnquiryPolicy` is: this is the screen that carries the
 * notification address and the panel's language, so when group permissions
 * arrive it is one of the first places they have to reach.
 */
class SettingPolicy
{
    /** @see \App\Policies\ModulePolicy for why this is the whole rule today. */
    private const ANY_SIGNED_IN_USER = true;

    public function viewAny(User $user): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }

    public function update(User $user, ?Setting $setting = null): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }
}
