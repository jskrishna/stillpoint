<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A turn into a session that has ended is refused, and read first.
 *
 * "Nothing may come before the screen" had one refusal still in front of it.
 * The turns route answered 409 for an ended session before anything looked at
 * what was said, in three places: the controller, the service under its lock,
 * and the domain. Measured: with a session ended as `user_stopped`, a
 * statement of intent answered `{"message": "This session has ended."}` with
 * no flag raised and no helplines.
 *
 * That is not an exotic state. `POST /sessions` ends whatever was open, so a
 * session left on a laptop is ended by starting one on a phone, and the laptop
 * still shows a question with a box under it. The web screen made it worse: it
 * runs its own copy of the screen only when a request *fails to arrive*, and a
 * 409 arrived, so neither side read the words.
 *
 * The session cannot be stopped, because it has already ended and an ended
 * session is terminal. What can still be done is everything else a stop does:
 * the screen runs, a flag reaches the queue, and a `high` answer comes back
 * with the helplines beside the refusal.
 */
final class WordsSaidAfterTheEndAreStillReadTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{string, string, User} */
    private function endedSession(): array
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');
        $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();
        // Ended the ordinary way, which is what starting another session on
        // another device does to this one.
        $this->withToken($token)->postJson("/api/sessions/{$id}/stop")->assertOk();

        return [$token, $id, $user];
    }

    public function test_a_statement_of_intent_is_flagged_and_given_the_helplines(): void
    {
        [$token, $id, $user] = $this->endedSession();

        $turn = $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I want to kill myself',
            'step' => 'responsibility',
        ]);

        // Still refused: the session ended and that is not undone.
        $turn->assertStatus(409);
        $this->assertSame('user_stopped', GuidedSession::query()->findOrFail($id)->end_reason?->value);

        // And read. The account's own country, as on a stop.
        $this->assertSame(
            ['988', '1-866-277-3553', '911'],
            array_column($turn->json('helplines') ?? [], 'number'),
        );

        $flag = SafetyFlag::query()->where('user_id', $user->id)->sole();
        $this->assertSame('high', $flag->level->value);
        $this->assertSame('I want to kill myself', $flag->excerpt);
        $this->assertSame($id, $flag->guided_session_id);
        // A reviewer is not told the session was stopped by this, because it
        // was not.
        $this->assertStringContainsString('already ended', $flag->outcome);
    }

    public function test_a_lesser_disclosure_is_flagged_and_the_answer_does_not_say_so(): void
    {
        [$token, $id, $user] = $this->endedSession();

        $turn = $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I feel like a burden to everyone',
            'step' => 'responsibility',
        ])->assertStatus(409);

        $this->assertSame(1, SafetyFlag::query()->where('user_id', $user->id)->count());
        // The client is told as little as possible, here as on a turn that
        // carried on: nothing in the answer says a line was crossed.
        $this->assertSame(['message'], array_keys($turn->json()));
    }

    public function test_an_ordinary_answer_is_only_refused(): void
    {
        [$token, $id, $user] = $this->endedSession();

        $turn = $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I can see how I took it that way',
            'step' => 'responsibility',
        ])->assertStatus(409);

        $this->assertSame(['message'], array_keys($turn->json()));
        $this->assertSame(0, SafetyFlag::query()->where('user_id', $user->id)->count());
    }

    public function test_the_answer_never_names_the_rule(): void
    {
        [$token, $id] = $this->endedSession();

        $body = $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I want to kill myself',
        ])->assertStatus(409)->json();

        $this->assertSame(['message', 'helplines'], array_keys($body));
        $this->assertStringNotContainsString('kill', json_encode($body, JSON_THROW_ON_ERROR));
    }
}
