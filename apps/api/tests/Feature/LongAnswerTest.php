<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Utterance;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A long answer is not refused, because the screen comes first.
 *
 * The turns route used to validate `max:5000`, which made length a refusal in
 * front of the safety screen — the same objection as a rate limit there, and
 * not a theoretical one: a 5,222-character outpouring ending in "I want to kill
 * myself" answered 422 and was never screened at all. Five thousand characters
 * is about 800 words, which somebody typing at 2am reaches.
 *
 * Nothing refuses a turn for its length now. What is kept is bounded instead,
 * by `App\Domain\Utterance`, after the screen has read all of it.
 */
final class LongAnswerTest extends TestCase
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

    /** The bug this closes, stated as a test. */
    public function test_a_long_answer_ending_in_a_disclosure_still_stops_the_session(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $said = str_repeat('I have been trying to explain this for weeks and nobody listens. ', 80)
            .'I want to kill myself.';
        $this->assertGreaterThan(5000, strlen($said), 'the old ceiling has to be exceeded');

        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => $said,
            'step' => 'notice',
        ]);

        $response->assertOk()
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'safety_stop');

        $numbers = array_column($response->json('safety.helplines'), 'number');
        // The default country's numbers: a factory-made account is in
        // Canada now. What this test is about is that the helplines appear at
        // all for an answer longer than the old ceiling.
        $this->assertSame(['988', '1-866-277-3553', '911'], $numbers);
    }

    /**
     * The screen reads past the recorded bound, which is the difference between
     * a storage limit and a limit on what somebody may say.
     */
    public function test_the_screen_reads_past_the_point_where_recording_stops(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        // The disclosure sits beyond the recorded limit, so a bound applied
        // before the screen — or instead of it — would miss it entirely.
        $said = str_repeat('a', Utterance::RECORDED_LIMIT + 500).' I want to kill myself.';

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('endReason', 'safety_stop');
    }

    public function test_a_long_answer_is_recorded_up_to_the_bound_and_no_further(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $said = str_repeat('मुझे यह सब बहुत भारी लग रहा है। ', 2000);
        $this->assertGreaterThan(Utterance::RECORDED_LIMIT, mb_strlen($said));

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 2);

        $kept = $this->getJson("/api/sessions/{$id}")->json('data.whatHappened');

        // Characters, not bytes: the same sentence must not cost three times
        // as much in Devanagari as in Latin. The capture is trimmed at the
        // ends, so this is the bounded text rather than exactly the bound —
        // here the 20,000th character happens to be a space.
        $this->assertSame(trim(mb_substr($said, 0, Utterance::RECORDED_LIMIT)), $kept);
        $this->assertGreaterThan(Utterance::RECORDED_LIMIT - 10, mb_strlen((string) $kept));
        $this->assertLessThanOrEqual(Utterance::RECORDED_LIMIT, mb_strlen((string) $kept));
    }

    public function test_a_flags_excerpt_is_bounded_too(): void
    {
        $user = $this->consentedUser();
        $id = $this->newSession();

        $said = str_repeat('he hit me again last night. ', 2000);
        $this->assertGreaterThan(Utterance::RECORDED_LIMIT, mb_strlen($said));

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk();

        // The most sensitive column in the schema, and the one a reviewer
        // reads. It is bounded for the same reason as the rest.
        $flag = SafetyFlag::query()->where('user_id', $user->id)->sole();
        $this->assertSame(trim(mb_substr($said, 0, Utterance::RECORDED_LIMIT)), $flag->excerpt);
        $this->assertLessThanOrEqual(Utterance::RECORDED_LIMIT, mb_strlen((string) $flag->excerpt));
    }

    /**
     * An answer within the bound is untouched — no normalising, no trimming of
     * anything but the ends, which is what `trim()` on the excerpt already did.
     */
    public function test_an_ordinary_answer_is_recorded_exactly(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $said = 'My manager called me out in front of everyone, and I went quiet.';

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => 'notice'])
            ->assertOk()
            ->assertJsonPath('data.whatHappened', $said);
    }

    /** Still required, because there is no text to screen otherwise. */
    public function test_an_utterance_is_still_required(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", [])
            ->assertJsonValidationErrors('utterance');
    }
}
