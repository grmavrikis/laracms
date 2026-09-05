<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * The retention period the enquiry form promises every visitor who ticks the
 * consent box (TASKS.md #66). A stated period that nothing enforces is worse
 * than no promise, so it runs daily rather than waiting to be remembered.
 *
 * Needs `php artisan schedule:work` (or a cron entry calling
 * `schedule:run` each minute) on the server. Nothing schedules itself.
 *
 * `withoutOverlapping` because this is a delete over a table that only grows:
 * a run slow enough to still be going tomorrow would otherwise be started
 * again on top of itself. The time is read in the application's timezone,
 * which is the one `Enquiry::scopeExpired` measures the period in.
 */
Schedule::command('enquiries:prune')->dailyAt('03:30')->withoutOverlapping();
