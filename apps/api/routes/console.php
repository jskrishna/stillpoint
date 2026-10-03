<?php

declare(strict_types=1);

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Expired personal access tokens.
 *
 * `SANCTUM_TOKEN_MINUTES` expires a token after thirty days and the guard
 * refuses an expired one whether or not its row is still there, so this is
 * tidying rather than a security control. It is still worth doing: the table
 * otherwise only grows, and a table nobody tends is one nobody notices
 * anything about.
 *
 * `--hours=24` keeps a day's grace after expiry, so a row is still there to
 * look at while somebody is working out why a client was signed out.
 *
 * It needs something to run it. `docker compose` has a `scheduler` service for
 * exactly this; without one, nothing here happens, which is why
 * `deploy/README.md` used to list "no scheduler" as a thing to fix.
 */
Schedule::command('sanctum:prune-expired --hours=24')
    ->daily()
    ->onOneServer()
    ->description('Remove personal access tokens that expired over a day ago');
