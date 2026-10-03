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

/*
 * Spent password resets.
 *
 * `password_reset_tokens` is keyed by the **email address**, has no foreign key
 * to anything, and nothing was clearing it — so a row sat there holding
 * somebody's address long after the token in it had stopped working. A reset
 * expires after sixty minutes (`config/auth.php`), which makes this the one
 * cleanup here that needs no retention decision: `auth:clear-resets` deletes
 * only rows that are already past that, and a dead token is not a record of
 * anything.
 *
 * Erasing an account removes its row directly, through the broker — see
 * `AccountDeletionService`. This is for the addresses nobody erased: a reset
 * asked for and never used, by someone who then thought better of it.
 */
Schedule::command('auth:clear-resets')
    ->hourly()
    ->onOneServer()
    ->description('Remove password reset tokens that have already expired');
