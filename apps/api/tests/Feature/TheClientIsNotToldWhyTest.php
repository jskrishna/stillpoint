<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;

/**
 * A session response never says why the screen did what it did.
 *
 * `CLAUDE.md` states this twice and says "there is a test asserting the
 * response contains neither". There was not. The behaviour was right —
 * measured, the response carries no level, no category and no matched phrase —
 * so what was missing was the thing that keeps it right: adding
 * `'level' => $this->safetyLevel` to `SessionResource` would have been silent.
 *
 * Two reasons it matters, and they point different ways. A user mid-crisis has
 * no use for "you tripped the self-harm rule". And a client that knows the rule
 * can be built to dodge it, which is the reason the screen is the server's.
 *
 * The keys are checked **recursively** rather than by name at the top level,
 * because the field that leaks is the one nobody thought of — a nested
 * `safety.level` would pass a check on `array_keys()`.
 */
final class TheClientIsNotToldWhyTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Names that would say why, in any spelling a resource might reach for.
     */
    private const FORBIDDEN = [
        'level',
        'safetylevel',
        'risklevel',
        'category',
        'matched',
        'phrase',
        'severity',
        'excerpt',
        'flag',
        'flagged',
        'flags',
    ];

    /** @return list<string> every key in the body, at every depth */
    private function keysOf(mixed $value, string $path = ''): array
    {
        if (! is_array($value)) {
            return [];
        }

        $keys = [];
        foreach ($value as $key => $nested) {
            $here = is_string($key) ? ($path === '' ? $key : "{$path}.{$key}") : $path;
            if (is_string($key)) {
                $keys[] = $here;
            }
            $keys = [...$keys, ...$this->keysOf($nested, $here)];
        }

        return $keys;
    }

    /** @param array<string, mixed> $body */
    private function assertSaysNothingAboutWhy(array $body, string $which): void
    {
        foreach ($this->keysOf($body) as $path) {
            $leaf = strtolower((string) (strrchr($path, '.') ?: $path));
            $leaf = ltrim($leaf, '.');

            $this->assertNotContains(
                $leaf,
                self::FORBIDDEN,
                "{$which} told the client why, at {$path}",
            );
        }
    }

    private function sessionFor(User $user): string
    {
        Sanctum::actingAs($user);

        return (string) $this->postJson('/api/sessions')->assertCreated()->json('id');
    }

    private function consented(): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
    }

    public function test_a_stopped_session_does_not_say_what_stopped_it(): void
    {
        $user = $this->consented();
        $id = $this->sessionFor($user);

        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I want to kill myself',
            'step' => 'notice',
        ])->assertOk();

        // Not vacuous: this really was a stop, with a flag behind it.
        $response->assertJsonPath('endReason', 'safety_stop');
        $this->assertSame(1, SafetyFlag::query()->where('user_id', $user->id)->count());

        $body = $response->json();
        $this->assertSaysNothingAboutWhy($body, 'the stop');

        // And it does not read the words back. On an ordinary turn `data`
        // legitimately holds what was said; a stopped session's does not, and
        // that is also what keeps the matched phrase out of the response.
        $this->assertStringNotContainsString(
            'kill myself',
            (string) $response->getContent(),
        );

        // What it does carry is the pause and the numbers, which is the whole
        // point of answering at all.
        $this->assertNotSame([], $response->json('safety.helplines'));
    }

    /**
     * The subtler one: a flag raised with the session carrying on.
     *
     * A `medium` disclosure flags for a reviewer and does not stop. If the
     * response hinted at that, a client could be built to find the line and
     * stay under it — and the person would never know a flag had been raised
     * about them either, which is its own argument and points the other way.
     */
    public function test_a_flagged_turn_that_continues_does_not_say_so(): void
    {
        $user = $this->consented();
        $id = $this->sessionFor($user);

        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I feel like a burden to everyone and I cannot go on',
            'step' => 'notice',
        ])->assertOk();

        // Not vacuous: a flag really was raised.
        $this->assertSame(1, SafetyFlag::query()->where('user_id', $user->id)->count());

        $response->assertJsonPath('ended', false);
        $response->assertJsonPath('endReason', null);
        // No pause block at all: that is the only field that would hint.
        $response->assertJsonPath('safety', null);

        $this->assertSaysNothingAboutWhy($response->json(), 'the flag');
    }

    /** And the control: the key check can actually fail. */
    public function test_the_key_check_would_catch_a_leak(): void
    {
        $caught = false;
        try {
            $this->assertSaysNothingAboutWhy(
                ['id' => 'x', 'safety' => ['title' => 'y', 'level' => 'high']],
                'a made-up response',
            );
        } catch (AssertionFailedError $e) {
            $caught = true;
            $this->assertStringContainsString('safety.level', $e->getMessage());
        }

        $this->assertTrue($caught, 'the key check passed a response that names the level');
    }
}
