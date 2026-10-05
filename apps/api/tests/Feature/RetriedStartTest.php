<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

/**
 * Starting a session twice is one attempt, not two.
 *
 * `POST /sessions` ends whatever was open and starts another, and a free plan
 * gets three full sessions a week. So a reply dropped on the way back, or a
 * double tap, spent a second allowance on the same attempt: measured against
 * the running API, three identical requests took a free user from three left to
 * none, and the fourth told them they had used three sessions when they had had
 * none of them.
 *
 * When what is open is untouched there is nothing to carry on from, so handing
 * it back is indistinguishable from ending it and starting a new one — except
 * that it costs nothing. The moment anything is said into it, starting again
 * means what it always meant.
 */
final class RetriedStartTest extends TestCase
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

    private function left(): int
    {
        return (int) $this->getJson('/api/me')->json('fullSessionsLeft');
    }

    private function answer(string $id, string $said = 'My manager dismissed my work'): void
    {
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk();
    }

    /** The bug this closes, stated as a test. */
    public function test_three_identical_starts_do_not_spend_a_whole_week(): void
    {
        $this->consentedUser();
        $this->assertSame(3, $this->left());

        $first = $this->postJson('/api/sessions')->assertCreated()->json('id');
        $second = $this->postJson('/api/sessions')->assertCreated()->json('id');
        $third = $this->postJson('/api/sessions')->assertCreated()->json('id');

        $this->assertSame($first, $second);
        $this->assertSame($first, $third);
        $this->assertSame(2, $this->left(), 'one attempt should cost one session');
        $this->assertSame(1, GuidedSession::query()->count());
    }

    public function test_the_session_handed_back_is_the_one_that_was_open(): void
    {
        $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $again = $this->postJson('/api/sessions')->assertCreated()->json('id');

        $this->assertSame($first, $again);
        $this->getJson('/api/sessions/current')->assertJsonPath('id', $first);

        // Not ended on the way: handing it back is not stopping it.
        $this->getJson("/api/sessions/{$first}")
            ->assertOk()
            ->assertJsonPath('ended', false)
            ->assertJsonPath('endReason', null)
            ->assertJsonPath('step.ordinal', 1);
    }

    /**
     * The screens need the answer from the server, so it is in the resource.
     * They must not work it out from `data`: a thin answer leaves `data` empty
     * but has spent a guide turn, so a screen doing its own arithmetic would
     * call a used session empty and then charge the user for a session it had
     * told them was free.
     */
    public function test_the_resource_says_whether_anything_has_been_said_into_it(): void
    {
        $this->consentedUser();

        $id = $this->postJson('/api/sessions')->assertJsonPath('untouched', true)->json('id');

        // A thin answer: nothing lands in `data`, and the step does not move.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'dunno', 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 1)
            ->assertJsonPath('data.whatHappened', null)
            ->assertJsonPath('untouched', false);

        $this->getJson('/api/sessions/current')->assertJsonPath('untouched', false);
    }

    public function test_starting_again_after_saying_something_does_end_it(): void
    {
        $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $this->answer($first);

        $second = $this->postJson('/api/sessions')->json('id');

        $this->assertNotSame($first, $second);
        $this->assertSame(1, $this->left(), 'two sessions, two of the three');
        $this->getJson("/api/sessions/{$first}")
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'user_stopped');
    }

    /**
     * A thin answer leaves nothing in the session's data but does spend a
     * guide turn, and a person who said something is a person who used the
     * session.
     */
    public function test_an_answer_the_guide_did_not_accept_still_counts_as_touched(): void
    {
        $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $this->postJson("/api/sessions/{$first}/turns", ['utterance' => 'dunno', 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 1);

        $second = $this->postJson('/api/sessions')->json('id');
        $this->assertNotSame($first, $second);
    }

    /**
     * The one that matters most.
     *
     * A session that screened a signal has had something said into it that a
     * reviewer may be reading. Handing it back as empty would make a safety
     * flag look as though it belonged to a session nobody had used.
     */
    public function test_a_session_that_raised_a_safety_flag_is_never_handed_back(): void
    {
        $user = $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $this->answer($first, 'I stopped my meds last week honestly');
        $this->assertSame(1, SafetyFlag::query()->where('user_id', $user->id)->count());

        $second = $this->postJson('/api/sessions')->json('id');
        $this->assertNotSame($first, $second);
    }

    /** And a safety stop is never handed back, because it is ended. */
    public function test_a_safety_stopped_session_is_never_handed_back(): void
    {
        $this->consentedUser();

        $first = $this->postJson('/api/sessions')->json('id');
        $this->postJson("/api/sessions/{$first}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
            'step' => 'notice',
        ])->assertOk()->assertJsonPath('endReason', 'safety_stop');

        $second = $this->postJson('/api/sessions')->json('id');

        $this->assertNotSame($first, $second);
        $this->getJson("/api/sessions/{$first}")->assertJsonPath('endReason', 'safety_stop');
    }

    /**
     * A full session that was started has already been counted, so handing it
     * back in place of the quick one somebody asked for would give them
     * something they did not ask for and could not undo.
     */
    public function test_asking_for_a_different_kind_starts_a_different_session(): void
    {
        $this->consentedUser();

        $full = $this->postJson('/api/sessions', ['kind' => 'full'])->json('id');
        $quick = $this->postJson('/api/sessions', ['kind' => 'quick'])->assertCreated()->json('id');

        $this->assertNotSame($full, $quick);
        $this->getJson("/api/sessions/{$quick}")->assertJsonPath('kind', 'quick');
    }

    public function test_a_retried_quick_start_is_also_one_attempt(): void
    {
        $this->consentedUser();

        $first = $this->postJson('/api/sessions', ['kind' => 'quick'])->json('id');
        $again = $this->postJson('/api/sessions', ['kind' => 'quick'])->json('id');

        $this->assertSame($first, $again);
    }

    /**
     * The allowance promise still holds. Three sessions that were actually used
     * is three, and the fourth is refused — what changed is that an untouched
     * one is not one of them.
     */
    public function test_three_sessions_that_were_used_still_spend_the_allowance(): void
    {
        $this->consentedUser();

        for ($i = 0; $i < 3; $i++) {
            $this->answer($this->postJson('/api/sessions')->assertCreated()->json('id'));
        }

        $this->postJson('/api/sessions')
            ->assertStatus(Response::HTTP_PAYMENT_REQUIRED)
            ->assertJsonPath('usedThisWeek', 3);
        $this->assertSame(0, $this->left());
    }

    /**
     * The same retry, at the edge of the allowance, which is where it was
     * still broken. The allowance was checked before `start()` was asked, so
     * the third full session of the week answered 201 and a retry of that very
     * request answered 402 "you have used 3", while the session it had just
     * been charged for sat open and untouched. Both home screens show the
     * plain "Start talking" branch for an untouched session, so that button
     * led to the refusal and nothing led to the session.
     */
    public function test_a_retry_of_the_last_allowed_start_is_handed_the_same_session(): void
    {
        $this->consentedUser();

        foreach ([1, 2] as $_) {
            $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');
            $this->answer($id);
        }
        $this->assertSame(1, $this->left());

        $third = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');
        $this->assertSame(0, $this->left());

        // The reply was lost, or the tab reloaded, or the button was pressed
        // again from the home screen.
        $again = $this->postJson('/api/sessions')->assertCreated();
        $this->assertSame($third, $again->json('id'));
        $this->assertSame(0, $this->left());

        // And the promise still holds once something has been said into it.
        $this->answer($third);
        $this->postJson('/api/sessions')->assertStatus(402);
    }
}
