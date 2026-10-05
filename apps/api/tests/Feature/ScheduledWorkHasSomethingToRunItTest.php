<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Console\Kernel;
use Tests\TestCase;

/**
 * The scheduled work, and the thing that runs it.
 *
 * `routes/console.php` schedules two commands and says the important part
 * itself: "It needs something to run it ... without one, nothing here
 * happens." That is a rule spread across two files — the schedule in
 * `routes/console.php` and the runner in `docker-compose.yml` — with nothing
 * tying them together, which is this repository's most repeated finding.
 *
 * Nothing tested any of it. `grep -rln 'clear-resets\|Schedule' tests`
 * returned nothing, so the schedule could be deleted, or a command renamed,
 * and the only symptom would be a table that quietly grows: expired personal
 * access tokens, and `password_reset_tokens` rows holding somebody's **email
 * address** after the token in them stopped working.
 *
 * Three cases, and the second is the one that catches a live defect rather
 * than a deletion.
 */
final class ScheduledWorkHasSomethingToRunItTest extends TestCase
{
    /**
     * What is scheduled, and why each one is here.
     *
     * Named rather than counted: a count stays green when one is swapped for
     * another, and the reason either exists is specific to it.
     *
     * @var array<string, string>
     */
    private const EXPECTED = [
        'sanctum:prune-expired' => 'personal access tokens expire after thirty days and the rows only accumulate',
        'auth:clear-resets' => 'a password reset row is keyed by the email address and nothing else clears it',
    ];

    public function test_both_commands_are_scheduled(): void
    {
        $scheduled = $this->scheduledCommands();

        foreach (self::EXPECTED as $command => $why) {
            $this->assertTrue(
                $this->isScheduled($scheduled, $command),
                "`{$command}` is not scheduled, and it is scheduled because {$why}.",
            );
        }
    }

    /**
     * Every scheduled command exists.
     *
     * This is the case worth having. An Artisan command named in the schedule
     * is resolved **when the scheduler fires**, not when the application
     * boots, so a renamed or removed command is a schedule that fails every
     * hour inside a container with no web server and no port — `LOG_CHANNEL`
     * is `stderr`, so it would be a line in a log nobody is reading, for as
     * long as it took somebody to wonder why a table was growing.
     */
    public function test_every_scheduled_command_exists(): void
    {
        $known = array_keys($this->app->make(Kernel::class)->all());
        $scheduled = $this->scheduledCommands();

        $this->assertNotSame([], $scheduled, 'nothing is scheduled at all, so this asserts nothing');

        foreach ($scheduled as $command) {
            $name = explode(' ', trim($command))[0];
            $this->assertContains(
                $name,
                $known,
                "The schedule names `{$name}`, which is not a command this application has. ".
                'A schedule resolves its command when it fires, so this is an hourly failure in a log nobody reads.',
            );
        }
    }

    /**
     * And something runs the schedule.
     *
     * The half `routes/console.php` cannot assert about itself. `php artisan
     * schedule:work` in the compose file is what turns those two declarations
     * into work that happens; without it they are documentation. Asserted on
     * the file rather than on a running container, which is what can be
     * asserted without a Docker daemon — the same reason
     * `PageSizesAreBoundedTest` reads the source.
     */
    public function test_the_deployment_runs_the_scheduler(): void
    {
        $compose = file_get_contents(dirname(__DIR__, 3).'/../docker-compose.yml');
        $this->assertNotFalse($compose, 'could not read docker-compose.yml');

        $this->assertStringContainsString(
            'schedule:work',
            $compose,
            'Nothing in the compose file runs the scheduler, so everything in routes/console.php is decoration.',
        );
    }

    /** @return list<string> */
    private function scheduledCommands(): array
    {
        $schedule = $this->app->make(Schedule::class);
        $out = [];

        foreach ($schedule->events() as $event) {
            // An `artisan` event's command is the PHP binary, the artisan
            // script and then the command, all shell-escaped. The command's
            // own name is what this is about.
            if (preg_match("/artisan'? (?:'([a-z0-9:_-]+)'|([a-z0-9:_-]+))(.*)$/i", $event->command ?? '', $m) === 1) {
                $out[] = trim(($m[1] !== '' ? $m[1] : $m[2]).' '.str_replace("'", '', $m[3]));
            }
        }

        return $out;
    }

    /** @param list<string> $scheduled */
    private function isScheduled(array $scheduled, string $command): bool
    {
        foreach ($scheduled as $entry) {
            if (str_starts_with($entry, $command)) {
                return true;
            }
        }

        return false;
    }
}
