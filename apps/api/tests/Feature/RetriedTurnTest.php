<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * A lost response is not a lost turn.
 *
 * A client POSTs an answer, the reply is dropped on the way back, and the
 * client sends the same words again. Nothing in the request said which
 * question they were answering, so the second request was indistinguishable
 * from a new turn: the words were recorded against the *next* step, and the
 * question that step actually asks was never answered by anybody. On a phone
 * on mobile data that is not an edge case.
 *
 * The client now names the step it is answering. The server refuses one that
 * has moved on — **after** the screen, never before it, so nothing about which
 * step a client thinks it is on can refuse someone saying they are not safe.
 */
final class RetriedTurnTest extends TestCase
{
    use RefreshDatabase;

    private function consentedUser(): User
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function newSession(): string
    {
        return $this->postJson('/api/sessions')->json('id');
    }

    public function test_a_retried_turn_is_refused_rather_than_answering_the_next_step(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $said = 'My manager called me out in front of everyone';

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 2);

        // The retry, carrying the step the client still thinks it is on.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertStatus(Response::HTTP_CONFLICT)
            ->assertJsonPath('message', 'That answer was for an earlier step. The session has moved on.');

        // Still at step 2, with step 2's question still to be answered.
        $this->getJson("/api/sessions/{$id}")
            ->assertOk()
            ->assertJsonPath('step.ordinal', 2)
            ->assertJsonPath('data.whatHappened', $said);
    }

    /**
     * The ordering rule, over the wire. The screen runs before anything reads
     * the step, so a stale answer that says someone is not safe still stops
     * the session and still shows the helplines.
     */
    public function test_a_stale_answer_that_says_someone_is_not_safe_still_stops_the_session(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
            'step' => 'notice',
        ])->assertOk();

        // `notice` has moved on, so this answer is stale — and it is a
        // disclosure, which is the one thing that must never be refused.
        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
            'step' => 'notice',
        ]);

        $response->assertOk()
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'safety_stop');

        $numbers = array_column($response->json('safety.helplines'), 'number');
        $this->assertSame(['14416', '112'], $numbers);
    }

    public function test_a_stale_answer_still_raises_a_flag_for_review(): void
    {
        $user = $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
            'step' => 'notice',
        ])->assertOk();

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I stopped my meds last week honestly',
            'step' => 'notice',
        ])->assertStatus(Response::HTTP_CONFLICT);

        // The words were said. That they answered a question the session has
        // moved past does not make them less of a disclosure.
        $flag = SafetyFlag::query()->where('user_id', $user->id)->sole();
        $this->assertSame('medium', $flag->level->value);
        $this->assertSame('I stopped my meds last week honestly', $flag->excerpt);
    }

    /**
     * A step this server does not recognise is treated as the client not
     * having said, and the turn is screened as usual.
     *
     * Validating it would put a refusal in front of the screen — the same
     * objection as a rate limit on this route — and the thing that refusal
     * would catch is a client sending a typo, while the thing it would lose is
     * someone saying they are not safe.
     */
    public function test_an_unrecognised_step_is_screened_rather_than_refused(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
            'step' => 'notice-ish',
        ]);

        $response->assertOk()->assertJsonPath('endReason', 'safety_stop');
    }

    public function test_a_step_that_is_not_even_a_string_is_screened_rather_than_refused(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        // Whatever arrives in that field, the screen runs. There is no shape
        // of `step` that can turn this request into a 422.
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
            'step' => ['notice'],
        ])->assertOk()->assertJsonPath('endReason', 'safety_stop');
    }

    public function test_a_turn_with_no_step_at_all_still_advances(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        // The field is new, and a caller that does not send it is not refused:
        // it is treated as not having said which step it was on.
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
        ])->assertOk()->assertJsonPath('step.ordinal', 2);
    }

    public function test_a_stale_turn_does_not_spend_the_guide_budget(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
            'step' => 'notice',
        ])->assertOk();

        $before = app(RateLimiter::class);
        $key = 'guided-turns:'.(string) auth()->id();
        $spent = $before->attempts($key);

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
            'step' => 'notice',
        ])->assertStatus(Response::HTTP_CONFLICT);

        // A refusal is the caller being told to ask again, not work done for
        // them, so the guide has nothing to charge for.
        $this->assertSame($spent, $before->attempts($key));
    }

    public function test_a_stale_turn_writes_nothing_to_the_session_but_the_signal(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $said = 'My manager called me out in front of everyone';

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk();

        $before = GuidedSession::query()->findOrFail($id);

        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I snapped at him first, that is my part',
            'step' => 'notice',
        ])->assertStatus(Response::HTTP_CONFLICT);

        $after = GuidedSession::query()->findOrFail($id);

        // The step did not move and nothing was captured: the words answered a
        // question that is no longer on the screen.
        $this->assertSame($before->step_id, $after->step_id);
        $this->assertSame($before->data, $after->data);
    }
}
