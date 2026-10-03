<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\EndReason;
use App\Domain\SafetyLevel;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class SessionApiTest extends TestCase
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

    protected function newSession(): string
    {
        return $this->postJson('/api/sessions')->json('id');
    }

    public function test_a_session_cannot_be_started_without_authentication(): void
    {
        $this->postJson('/api/sessions')->assertUnauthorized();
    }

    public function test_a_session_cannot_be_started_without_consent(): void
    {
        Sanctum::actingAs(User::factory()->create(['accepted_consent' => []]));

        // Whatever the client did, the API will not start a session for someone
        // who has not been told this is not therapy.
        $this->postJson('/api/sessions')
            ->assertForbidden()
            ->assertJsonPath('missing', ['understands', 'adult']);
    }

    public function test_accepting_only_the_optional_item_is_not_consent(): void
    {
        Sanctum::actingAs(User::factory()->create(['accepted_consent' => ['improve']]));
        $this->postJson('/api/sessions')->assertForbidden();
    }

    public function test_starting_a_session_returns_the_guides_opening_question(): void
    {
        $this->consentedUser();

        $this->postJson('/api/sessions')
            ->assertCreated()
            ->assertJsonPath('step.ordinal', 1)
            ->assertJsonPath('step.name', 'Notice')
            ->assertJsonPath('stepCount', 6)
            ->assertJsonPath('ended', false)
            ->assertJsonPath('say', 'You’re upset, and that’s okay. What happened?');
    }

    public function test_a_substantial_answer_advances_the_step_and_is_recorded(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'My manager called me out in front of everyone'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 2)
            ->assertJsonPath('data.whatHappened', 'My manager called me out in front of everyone');
    }

    /**
     * Step 3's answer is a selection, not prose.
     *
     * The guide judged every answer by word count, so one feeling never counted
     * as an answer and the session stalled at step 3 unless the user happened
     * to pick exactly three.
     */
    public function test_one_named_feeling_advances_step_three(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'My manager called me out in front of everyone']);
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I can see how I took it that way']);

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'angry'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 4)
            ->assertJsonPath('data.feelings', ['angry']);
    }

    public function test_a_thin_answer_does_not_advance(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'no'])
            ->assertOk()
            ->assertJsonPath('step.ordinal', 1);
    }

    public function test_an_utterance_is_required(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", [])->assertJsonValidationErrors('utterance');
    }

    /**
     * The point of moving the backend to PHP: this runs on the server, so a
     * client cannot skip it. There is no other way to advance a session.
     */
    public function test_crisis_language_stops_the_session_server_side(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
        ]);

        $response->assertOk()
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'safety_stop')
            ->assertJsonPath('step', null)
            // The guide is never consulted, so it has nothing to say back.
            ->assertJsonPath('say', '')
            ->assertJsonPath('safety.title', 'Let’s pause here.');

        $numbers = array_column($response->json('safety.helplines'), 'number');
        $this->assertSame(['14416', '112'], $numbers);
    }

    public function test_a_stopped_session_never_leaks_why_it_stopped(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $json = $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to die'])->json();

        // A client that knows the rule can be built to dodge it, and a user
        // mid-crisis has no use for "you tripped the self-harm rule".
        $encoded = json_encode($json);
        $this->assertStringNotContainsString('self_harm', $encoded);
        $this->assertStringNotContainsString('want to die', $encoded);
    }

    public function test_a_crisis_turn_raises_a_flag_for_review(): void
    {
        $user = $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to die']);

        $flag = SafetyFlag::firstOrFail();
        $this->assertSame(SafetyLevel::High, $flag->level);
        $this->assertSame('I want to die', $flag->excerpt);
        $this->assertSame('Session stopped. Helplines shown.', $flag->outcome);
        $this->assertSame($user->id, $flag->user_id);
        $this->assertSame('open', $flag->status);
    }

    public function test_a_crisis_session_is_never_journalled(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to die']);

        $this->assertSame(0, JournalEntry::count());
    }

    public function test_a_stopped_session_cannot_be_continued(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to die']);

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'actually I am fine, carry on'])
            ->assertConflict();

        $this->assertSame(EndReason::SafetyStop, GuidedSession::find($id)->toDomain()->endReason);
    }

    public function test_a_medium_signal_flags_without_interrupting(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I stopped my meds last week honestly'])
            ->assertOk()
            ->assertJsonPath('ended', false);

        $this->assertSame(SafetyLevel::Medium, SafetyFlag::firstOrFail()->level);
        $this->assertSame('Flagged for review. Session continued.', SafetyFlag::firstOrFail()->outcome);
    }

    public function test_a_user_cannot_touch_someone_elses_session(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        Sanctum::actingAs(User::factory()->create(['accepted_consent' => ['understands', 'adult']]));

        $this->getJson("/api/sessions/{$id}")->assertNotFound();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'hello there friend'])->assertNotFound();
        $this->postJson("/api/sessions/{$id}/stop")->assertNotFound();
    }

    public function test_the_user_can_stop_at_any_time_and_it_is_journalled(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'My manager called me out at work today']);

        $this->postJson("/api/sessions/{$id}/stop")
            ->assertOk()
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'user_stopped');

        $this->assertSame(1, JournalEntry::count());
        $this->assertFalse(JournalEntry::first()->reached_final_step);
    }

    public function test_a_rating_lands_on_the_session_and_the_journal(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'Something happened at work today']);
        $this->postJson("/api/sessions/{$id}/stop");

        $this->postJson("/api/sessions/{$id}/rating", ['rating' => 'yes'])
            ->assertOk()
            ->assertJsonPath('data.calmerRating', 'yes');

        $this->assertSame('yes', JournalEntry::first()->calmer_rating->value);
    }

    public function test_an_unknown_rating_is_rejected(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/rating", ['rating' => 'amazing'])
            ->assertJsonValidationErrors('rating');
    }

    public function test_a_session_is_pinned_to_the_version_it_started_on(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->assertSame('1.0', GuidedSession::find($id)->protocol_version);
    }
}
