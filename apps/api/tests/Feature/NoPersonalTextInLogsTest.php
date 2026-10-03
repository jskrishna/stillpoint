<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Guide;
use App\Domain\GuideReply;
use App\Domain\ProtocolVersion;
use App\Domain\Session;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The journal is encrypted at rest, and the log must not undo that.
 *
 * `guided_sessions.data` is encrypted; the same words going to
 * `storage/logs/laravel.log` in plaintext is the same text in a second place
 * with none of the protection, and in the deployment `LOG_CHANNEL=stderr`
 * sends it wherever the container's output goes. Encrypting a column and then
 * logging its value is not encryption at rest.
 *
 * So this makes a turn throw and asserts the utterance is nowhere in what got
 * logged. What it is really guarding against is a debugging line — a
 * `Log::error('turn failed', ['utterance' => $utterance])` added while chasing
 * something and never taken out. That is a one-line change that would leak the
 * most personal text the product holds, and nothing else here would notice.
 *
 * It is **not** a check on stack traces, and it would be easy to think it was:
 * PHP renders a string argument as `'...'` in `getTraceAsString()` whatever
 * `zend.exception_ignore_args` says, and that is what Laravel's log formatter
 * uses. `deploy/php.ini` pins that setting anyway, for anything that reads the
 * structured trace instead — an error reporter, which is the realistic way
 * those values would start travelling.
 */
final class NoPersonalTextInLogsTest extends TestCase
{
    use RefreshDatabase;

    /** Distinctive enough that finding it anywhere is unambiguous. */
    private const SAID = 'zqx-the-words-nobody-else-would-write-zqx';

    public function test_an_exception_during_a_turn_does_not_log_what_was_said(): void
    {
        $this->app->bind(Guide::class, fn () => new class implements Guide
        {
            public function respond(Session $session, ProtocolVersion $version, string $utterance): GuideReply
            {
                // Only on the turn. The guide is consulted for the opening
                // line too, and failing there would stop the session being
                // created at all.
                if (str_contains($utterance, 'zqx-')) {
                    throw new \RuntimeException('the model fell over');
                }

                return new GuideReply(say: 'Go on.', advance: false);
            }
        });

        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        $log = storage_path('logs/laravel.log');
        $before = is_file($log) ? (int) filesize($log) : 0;

        // The request fails; that is the point. `withoutExceptionHandling()` is
        // deliberately not used, because the handler is what logs.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => self::SAID])
            ->assertStatus(500);

        $written = is_file($log) ? (string) file_get_contents($log, false, null, $before) : '';

        $this->assertNotSame('', $written, 'the exception should have been logged at all');
        $this->assertStringContainsString('the model fell over', $written);
        $this->assertStringNotContainsString(
            self::SAID,
            $written,
            "the user's own words were written to the log in plaintext",
        );
    }
}
