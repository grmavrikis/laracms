<?php

namespace App\Policies;

use App\Models\Module;
use App\Models\User;

/**
 * A Module is owned by exactly one User, and Entries are owned only
 * indirectly, through their Module. So every authorization question in the
 * CMS reduces to this one check: does this User own this Module?
 */
class ModulePolicy
{
    /**
     * Read the Module and list/read the Entries inside it.
     */
    public function view(User $user, Module $module): bool
    {
        return $module->user_id === $user->id;
    }

    /**
     * Modify the Module or the Entries inside it (create/update/delete).
     */
    public function update(User $user, Module $module): bool
    {
        return $module->user_id === $user->id;
    }

    public function delete(User $user, Module $module): bool
    {
        return $module->user_id === $user->id;
    }
}
