<?php

namespace App\Policies;

use App\Models\Enquiry;
use App\Models\User;

/**
 * Who may read and delete the enquiries a site has received (TASKS.md #66).
 *
 * The same answer as ModulePolicy and for the same reason: one installation
 * serves one site, and its users are the client's colleagues rather than
 * tenants who have to be kept apart (docs/TASKS.md -> Decisions).
 *
 * It exists, rather than the controller simply trusting `auth:sanctum`,
 * because a policy is the one place every authorization question in this
 * application passes through. Group permissions - the change that will make an
 * inbox of visitors' names, addresses and phone numbers something not every
 * account should open - land here and nowhere else.
 *
 * There is no `update`: an enquiry is a record of what somebody sent, and no
 * route can rewrite one.
 */
class EnquiryPolicy
{
    /** @see \App\Policies\ModulePolicy for why this is the whole rule today. */
    private const ANY_SIGNED_IN_USER = true;

    public function viewAny(User $user): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }

    public function delete(User $user, Enquiry $enquiry): bool
    {
        return self::ANY_SIGNED_IN_USER;
    }
}
