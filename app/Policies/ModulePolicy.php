<?php

namespace App\Policies;

use App\Models\Module;
use App\Models\User;

/**
 * Who may reach a Module, and the Entries inside it.
 *
 * The answer used to be "whoever owns it". It is now "whoever is signed in",
 * and that is a decision rather than an omission: one installation serves one
 * site (docs/TASKS.md -> Decisions). Its users are the client's colleagues
 * sharing a single content space, not tenants who have to be kept apart, and
 * the Modules are created only by the master admin - so `Module.user_id`
 * records who wrote the row and can tell nobody apart. Using it to authorize
 * hid every Module from the client's own staff (#54).
 *
 * The methods are kept rather than the policy deleted, because this is the one
 * place every authorization question in the application passes through. Group
 * permissions - which group may work in which Module - land here and nowhere
 * else, which is what keeps that change small when it comes.
 *
 * Two boundaries still hold and neither is here: authentication, applied by
 * the route group, and the scoped route binding that stops an Entry being
 * addressed through the wrong Module.
 */
class ModulePolicy
{
    /**
     * The current answer to every question below.
     *
     * Named rather than written as a bare `true` in three method bodies, which
     * reads as a stub somebody forgot to finish. Reaching a policy method at
     * all means the route group already established that the request is
     * signed in, and that is the whole rule for now.
     *
     * When groups arrive this constant goes and each method asks the user's
     * group about `$module` instead - which is why both parameters stay,
     * unused, rather than being dropped from the signatures.
     */
    private const ANY_SIGNED_IN_USER = true;

    /**
     * Read the Module and list/read the Entries inside it.
     */
    public function view(User $user, Module $module): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }

    /**
     * Modify the Module or the Entries inside it (create/update/delete).
     */
    public function update(User $user, Module $module): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }

    public function delete(User $user, Module $module): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }
}
