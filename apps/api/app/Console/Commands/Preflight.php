<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Role;
use App\Models\ProtocolVersion as ProtocolVersionModel;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;

/**
 * What this deployment cannot do, said out loud.
 *
 * Every check here is something that leaves the stack **looking healthy**.
 * `deploy/smoke.mjs` ends with "This deployment serves a session, and stops
 * one", and it is right: it registers, consents, takes two turns, trips the
 * safety stop and erases the account. None of that touches mail, or asks
 * whether the guide has words at step 3, or whether anybody can read the
 * safety queue. So a deployment can pass every check this repository has and
 * still be unable to reset a password.
 *
 * That is the class this repository keeps naming — a promise the server does
 * not keep — with the promise in the deployment rather than in the code. The
 * answer is not to refuse to boot: `MAIL_MAILER=log` is *deliberately*
 * unfinished and `LAUNCH.md` item 2 is where that decision lives. The answer
 * is that somebody is told, by a command they can run against the thing they
 * just deployed.
 *
 * Two statuses, and the difference is whether a person is harmed by it:
 *
 *   - **blocked** — somebody using the product hits a wall. A locked-out
 *     account with no way back, a guide with nothing to say, a crisis
 *     disclosure nobody can read.
 *   - **note** — a real cost that falls on the operator rather than on a
 *     user, or a thing that is only wrong in a topology this cannot see.
 *
 * The exit code is 1 when anything is blocked, so a deploy script can gate on
 * it, and 0 for notes alone.
 */
final class Preflight extends Command
{
    protected $signature = 'stillpoint:preflight';

    protected $description = 'Report what this deployment cannot do yet';

    /** @var list<array{level: string, what: string, why: string, fix: string}> */
    private array $found = [];

    public function handle(): int
    {
        $this->mailCanSend();
        $this->theGuideHasWords();
        $this->somebodyCanReadTheQueue();
        $this->theWebAppMayCallTheApi();
        $this->debugIsOff();
        $this->theCacheIsNotTheDatabaseOnSqlite();
        $this->proxiesAreDecided();

        return $this->report();
    }

    /**
     * `MAIL_MAILER=log` means nobody can reset a password.
     *
     * The route answers 200 either way — deliberately, so an unauthenticated
     * caller cannot learn who has an account — so the person is told a link is
     * on its way and no link is ever sent. Nothing on any screen can know
     * that, and nothing in `smoke.mjs` can see it over HTTP, which is why it
     * is here.
     */
    private function mailCanSend(): void
    {
        $mailer = Config::string('mail.default');

        if ($mailer === 'log' || $mailer === 'array') {
            $this->blocked(
                'Nobody can reset a password',
                "mail.default is '{$mailer}', so a reset link is written to the log instead of sent. ".
                'The route answers 200 either way, so the person is told a link is on its way and none arrives.',
                'Set MAIL_MAILER to smtp, resend, postmark or ses with that provider’s credentials. '.
                'Laravel ships all four transports — no code here changes. LAUNCH.md item 2.',
            );

            return;
        }

        $from = Config::get('mail.from.address');

        if (! is_string($from) || $from === '' || str_ends_with($from, '@example.com')) {
            $this->blocked(
                'Reset mail would be sent from an address nobody owns',
                'mail.from.address is '.(is_string($from) && $from !== '' ? $from : 'unset').
                ', which a provider will refuse or a spam filter will drop.',
                'Set MAIL_FROM_ADDRESS to an address on a domain this deployment is allowed to send for.',
            );
        }
    }

    /**
     * Production publishes no protocol version by itself.
     *
     * `BASELINE` leaves steps 2, 3 and 6 `null` on purpose — the designs do
     * not specify them and inventing copy in `steps.ts` would make it the
     * product's voice with nobody able to tell afterwards. So a fresh
     * deployment has a guide that says nothing at three of the six steps, to
     * somebody who is upset.
     */
    private function theGuideHasWords(): void
    {
        $live = ProtocolVersionModel::query()->where('status', 'live')->exists();

        if (! $live) {
            $this->blocked(
                'The guide has nothing to say at three of the six steps',
                'No protocol version is live. The baseline leaves steps 2, 3 and 6 without a question, '.
                'because the designs do not give them and this repository will not invent them in code.',
                'php artisan stillpoint:draft-step-copy, then read and publish it at /admin/protocol. '.
                'Publishing is a person’s decision on purpose. LAUNCH.md item 4.',
            );
        }
    }

    /** A safety flag nobody can read is a disclosure nobody follows up. */
    private function somebodyCanReadTheQueue(): void
    {
        $admins = User::query()->where('role', Role::Admin->value)->count();

        if ($admins === 0) {
            $this->blocked(
                'Nobody can read the safety queue',
                'There is no account with the admin role, and the console is the only way to read a '.
                'safety flag. A crisis disclosure would be recorded and seen by nobody.',
                'Grant the first admin directly in the database — the console cannot, because reaching '.
                'it needs the role it grants. Afterwards /admin/users is the only way, with a trail.',
            );
        }
    }

    /**
     * The web app's own origin has to be on the API's list.
     *
     * Measured on the desktop shell, where this exact line was missing: the
     * token comes back **null**, nobody can sign in at all, and the screen
     * reads "Could not reach Stillpoint. Check your connection and try
     * again." — the connection sentence, about a configuration line.
     */
    private function theWebAppMayCallTheApi(): void
    {
        $frontend = Config::get('app.frontend_url');

        if (! is_string($frontend) || $frontend === '') {
            $this->note(
                'APP_FRONTEND_URL is not set',
                'Reset and invitation links are built from it, so they would point nowhere.',
                'Set APP_FRONTEND_URL to the origin a browser loads the web app from.',
            );

            return;
        }

        $parts = parse_url($frontend);
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            $this->note(
                'APP_FRONTEND_URL is not a URL',
                "It reads '{$frontend}', so a reset link built from it is not followable.",
                'Set it to a scheme and host, e.g. https://app.example.com',
            );

            return;
        }

        $origin = $parts['scheme'].'://'.$parts['host'].
            (isset($parts['port']) ? ':'.(string) $parts['port'] : '');

        /** @var list<string> $allowed */
        $allowed = Config::array('cors.allowed_origins');

        if (! in_array($origin, $allowed, true) && ! in_array('*', $allowed, true)) {
            $this->blocked(
                'The web app’s origin cannot call this API',
                "APP_FRONTEND_URL is {$origin} and CORS_ALLOWED_ORIGINS does not name it, so every ".
                'request a browser makes is refused. Measured on the desktop shell with this exact '.
                'line missing: the token comes back null, nobody can sign in, and the screen blames '.
                'the connection.',
                "Add {$origin} to CORS_ALLOWED_ORIGINS.",
            );
        }
    }

    /** `APP_DEBUG` on means a stack trace to whoever asks for one. */
    private function debugIsOff(): void
    {
        if (Config::boolean('app.debug') && app()->environment('production')) {
            $this->blocked(
                'APP_DEBUG is on in production',
                'A failure answers with the exception, the file and the stack, to anybody. '.
                'This product holds the most personal text somebody has written.',
                'APP_DEBUG=false.',
            );
        }
    }

    /**
     * On sqlite, a rate limiter's write is a 500.
     *
     * Measured at 8 server workers: 33 of 60 concurrent reads of
     * `/admin/role-changes` answered 500 `database is locked`, from the
     * limiter rather than from anything the request asked for. It reads as a
     * flaky console and it is configuration.
     */
    private function theCacheIsNotTheDatabaseOnSqlite(): void
    {
        if (Config::string('database.default') === 'sqlite' && Config::string('cache.default') === 'database') {
            $this->blocked(
                'The console will answer 500 under any concurrency',
                'CACHE_STORE=database puts the rate limiter’s write in the same sqlite file as the data '.
                'the request is about. Measured at 8 workers: 33 of 60 concurrent reads answered 500 '.
                '"database is locked", from the limiter rather than from the request.',
                'CACHE_STORE=file whenever DB_CONNECTION=sqlite.',
            );
        }
    }

    /**
     * Trusting no proxy is right at the edge and wrong behind one.
     *
     * This cannot see the topology, so it is a note either way — but the cost
     * is specific enough to be worth naming: behind a terminator every request
     * carries the terminator's address, so the per-IP ceiling stops being a
     * ceiling on one machine and becomes one for the whole product, and the
     * tight bucket collapses to six a minute per account from anywhere.
     */
    private function proxiesAreDecided(): void
    {
        /** @var list<string>|string|null $proxies */
        $proxies = Config::get('trustedproxy.proxies');
        $set = is_string($proxies) ? $proxies !== '' : is_array($proxies) && $proxies !== [];

        if (! $set) {
            $this->note(
                'No proxy is trusted',
                'Correct if nothing sits in front of nginx. Behind a terminator, $request->ip() is the '.
                'terminator’s, so the per-IP limit becomes 60 a minute for the whole product and the '.
                'tight bucket collapses to six a minute per account from anywhere.',
                'TRUSTED_PROXIES with the terminator’s address, or * when only it can reach this app.',
            );
        }
    }

    private function blocked(string $what, string $why, string $fix): void
    {
        $this->found[] = ['level' => 'blocked', 'what' => $what, 'why' => $why, 'fix' => $fix];
    }

    private function note(string $what, string $why, string $fix): void
    {
        $this->found[] = ['level' => 'note', 'what' => $what, 'why' => $why, 'fix' => $fix];
    }

    private function report(): int
    {
        $blocked = array_values(array_filter($this->found, fn ($f) => $f['level'] === 'blocked'));
        $notes = array_values(array_filter($this->found, fn ($f) => $f['level'] === 'note'));

        $this->newLine();

        if ($blocked === [] && $notes === []) {
            $this->info('Nothing this command can see is unfinished.');
            $this->line('  It does not check TLS, backups, billing, a clinician’s sign-off or');
            $this->line('  anything on a phone. LAUNCH.md is the list that does.');
            $this->newLine();

            return self::SUCCESS;
        }

        foreach ([['blocked', $blocked], ['note', $notes]] as [$level, $items]) {
            if ($items === []) {
                continue;
            }

            $this->line($level === 'blocked'
                ? '<fg=red;options=bold>Somebody using this would hit a wall:</>'
                : '<fg=yellow;options=bold>Worth knowing:</>');
            $this->newLine();

            foreach ($items as $f) {
                $this->line("  <options=bold>{$f['what']}</>");
                $this->line("    {$f['why']}");
                $this->line("    <fg=gray>→ {$f['fix']}</>");
                $this->newLine();
            }
        }

        // Said even when everything passes, because a green check that is
        // silent about its own scope is how this repository's claims went
        // stale: it reads as "ready" rather than "nothing I looked at".
        $this->line('<fg=gray>  This looks at configuration and rows. It does not check TLS,</>');
        $this->line('<fg=gray>  backups, billing, a clinician’s sign-off or anything on a phone.</>');
        $this->line('<fg=gray>  LAUNCH.md is the list that does.</>');
        $this->newLine();

        return $blocked === [] ? self::SUCCESS : self::FAILURE;
    }
}
