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
 */
Schedule::command('enquiries:prune')->dailyAt('03:30');
