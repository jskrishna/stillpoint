<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Console\Commands\Preflight;
use App\Domain\Role;
use App\Models\ProtocolVersion;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

/**
 * Every check in `stillpoint:preflight` can fire, and none of them fires at
 * rest.
 *
 * Both halves are the point, and the second is the one that makes the first
 * worth anything. A command that reported everything would pass this test
 * with one case per check and be useless the moment somebody read it; a
 * command whose checks silently stopped matching would pass a green run and
 * report a deployment ready that is not. This repository has had both — an
 * audit that printed FAIL lines and exited 0, and a source-reading test whose
 * pattern stopped matching — so each check is driven in both directions.
 *
 * The exit code carries the distinction the command makes: 1 when somebody
 * using the product would hit a wall, 0 when the only findings are the
 * operator's to weigh.
 */
final class PreflightSaysWhatIsUnfinishedTest extends TestCase
{
    use RefreshDatabase;

    /** A deployment with nothing wrong that this command can see. */
    private function healthy(): void
    {
        Config::set('mail.default', 'smtp');
        Config::set('mail.from.address', 'hello@stillpoint.app');
        Config::set('app.frontend_url', 'https://app.stillpoint.test');
        Config::set('cors.allowed_origins', ['https://app.stillpoint.test']);
        Config::set('app.debug', false);
        Config::set('database.default', 'sqlite');
        Config::set('cache.default', 'file');
        Config::set('trustedproxy.proxies', ['10.0.0.1']);

        // Written directly rather than through a factory: there is no
        // `ProtocolVersionFactory`, and what the check reads is one column.
        ProtocolVersion::query()->create([
            'major' => 1,
            'minor' => 0,
            'status' => 'live',
            'steps' => [],
            'pause_title' => 'Let us pause here',
            'pause_body' => 'You said something that matters more than this exercise.',
            'published_at' => now(),
        ]);
        User::factory()->create(['role' => Role::Admin->value]);
    }

    public function test_it_says_nothing_when_there_is_nothing_to_say(): void
    {
        $this->healthy();

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('Nothing this command can see is unfinished.')
            ->assertExitCode(0);
    }

    public function test_it_says_nobody_can_reset_a_password(): void
    {
        $this->healthy();
        Config::set('mail.default', 'log');

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('Nobody can reset a password')
            ->assertExitCode(1);
    }

    public function test_it_says_mail_would_come_from_an_address_nobody_owns(): void
    {
        $this->healthy();
        Config::set('mail.from.address', 'hello@example.com');

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('an address nobody owns')
            ->assertExitCode(1);
    }

    public function test_it_says_the_guide_has_nothing_to_say(): void
    {
        $this->healthy();
        ProtocolVersion::query()->update(['status' => 'draft']);

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('nothing to say at three of the six steps')
            ->assertExitCode(1);
    }

    public function test_it_says_nobody_can_read_the_safety_queue(): void
    {
        $this->healthy();
        User::query()->update(['role' => Role::User->value]);

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('Nobody can read the safety queue')
            ->assertExitCode(1);
    }

    /**
     * The one measured on the desktop shell, where the missing line made the
     * token come back null and the screen blame the connection.
     */
    public function test_it_says_a_demo_account_is_on_a_real_deployment(): void
    {
        $this->healthy();
        User::factory()->create(['email' => 'admin@stillpoint.test', 'role' => Role::Admin->value]);

        // Only where it matters. In development these accounts are the point.
        $this->artisan('stillpoint:preflight')->assertExitCode(0);

        $this->app->detectEnvironment(fn () => 'production');

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('A demo account exists on this deployment')
            ->assertExitCode(1);
    }

    public function test_it_says_the_risk_screen_has_no_intl(): void
    {
        $this->healthy();
        Preflight::$intlIsLoaded = fn (): bool => false;

        try {
            $this->artisan('stillpoint:preflight')
                ->expectsOutputToContain('The risk screen is running on a stand-in')
                ->assertExitCode(1);
        } finally {
            Preflight::$intlIsLoaded = null;
        }
    }

    public function test_the_demo_seeder_refuses_a_real_deployment(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('does not run in production');

        // Called directly: `db:seed` asks "are you sure" in production, and
        // `--force` is exactly how the deployment guide answered it.
        $this->app->make(DemoSeeder::class)->run();
    }

    public function test_it_says_the_web_app_cannot_call_the_api(): void
    {
        $this->healthy();
        Config::set('cors.allowed_origins', ['https://somewhere.else']);

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('cannot call this API')
            ->assertExitCode(1);
    }

    /** A wildcard is a different decision, and it is not this failure. */
    public function test_a_wildcard_origin_is_not_reported_as_unreachable(): void
    {
        $this->healthy();
        Config::set('cors.allowed_origins', ['*']);

        $this->artisan('stillpoint:preflight')
            ->doesntExpectOutputToContain('cannot call this API')
            ->assertExitCode(0);
    }

    public function test_it_says_the_console_will_answer_500(): void
    {
        $this->healthy();
        Config::set('cache.default', 'database');

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('answer 500 under any concurrency')
            ->assertExitCode(1);
    }

    /**
     * The other half of that condition, which is the half this suite can
     * reach: on sqlite with a file cache there is no finding.
     *
     * The check fires on sqlite **and** a database cache, and only the cache
     * side is drivable here. Pointing `database.default` at another
     * connection sends the command's own queries — the live version and the
     * admin count — somewhere else, and both attempts at it failed on the
     * fixture rather than on the assertion: first `[2002] Connection
     * refused` against a MySQL that is not running, then `no such table`
     * once it was aliased to sqlite, because `:memory:` is a fresh database
     * per connection. The second attempt also left `RefreshDatabase` unable
     * to roll back, so it took two other tests with it.
     *
     * So the off-sqlite direction is named rather than asserted, which is
     * what `pnpm run check:mysql` is for and the same limit
     * `ConcurrentTurnTest` states about `lockForUpdate()`. Faking it with an
     * aliased connection would have been a fixture that passes while
     * measuring a database the command never queried.
     */
    public function test_a_file_cache_on_sqlite_is_not_reported(): void
    {
        $this->healthy();
        Config::set('cache.default', 'file');

        $this->artisan('stillpoint:preflight')
            ->doesntExpectOutputToContain('answer 500 under any concurrency')
            ->assertExitCode(0);
    }

    /**
     * A note rather than a wall: this cannot see the topology, so it says
     * what it costs and leaves the exit code alone.
     */
    public function test_an_untrusted_proxy_is_a_note_and_not_a_wall(): void
    {
        $this->healthy();
        Config::set('trustedproxy.proxies', []);

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('No proxy is trusted')
            ->assertExitCode(0);
    }

    /**
     * The scope disclaimer is printed on every run, including a clean one.
     *
     * A green check silent about what it did not look at reads as "ready",
     * which is how this repository's own claims went stale.
     */
    public function test_it_always_says_what_it_did_not_look_at(): void
    {
        $this->healthy();

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('LAUNCH.md is the list that does')
            ->assertExitCode(0);

        Config::set('mail.default', 'log');

        $this->artisan('stillpoint:preflight')
            ->expectsOutputToContain('LAUNCH.md is the list that does')
            ->assertExitCode(1);
    }
}
