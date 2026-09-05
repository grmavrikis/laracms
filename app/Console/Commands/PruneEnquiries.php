<?php

namespace App\Console\Commands;

use App\Models\Enquiry;
use Illuminate\Console\Command;

/**
 * Enforces the retention period the form promises (TASKS.md #66).
 *
 * A stated retention period that nothing keeps is worse than no promise: it
 * is a claim made to every visitor who ticked the consent box. Scheduled
 * daily in `routes/console.php`.
 */
class PruneEnquiries extends Command
{
    protected $signature = 'enquiries:prune';

    protected $description = 'Delete enquiries past the retention period stated on the form';

    public function handle(): int
    {
        $deleted = Enquiry::query()->expired()->delete();

        $this->line($deleted === 0
            ? 'Nothing past ' . Enquiry::RETENTION_MONTHS . ' months.'
            : "Deleted {$deleted} enquiries past " . Enquiry::RETENTION_MONTHS . ' months.');

        return self::SUCCESS;
    }
}
