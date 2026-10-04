<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\EndReason;
use App\Domain\SafetyLevel;
use App\Http\Controllers\Api\SessionController;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class SessionApiTest extends TestCase
{
    use RefreshDatabase;

    /** The user `consentedUser()` made, for the tests that need its id. */
    private User $user;

    private function consentedUser(): User
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);
        $this->user = $user;

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

    /**
     * A spent budget must never silence the safety screen.
     *
     * This route used to carry a `throttle` middleware, which refused the
     * request before anything had looked at what it said. The request it can
     * refuse is someone saying they are not safe, and then the helplines never
     * appear. The budget now applies after the screen, and these are that
     * ordering stated as tests.
     */
    public function test_a_spent_budget_still_stops_a_session_for_safety(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->spendTheBudget();

        $response = $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to kill myself'])
            ->assertOk()
            ->assertJsonPath('ended', true)
            ->assertJsonPath('endReason', 'safety_stop');

        // And the helplines are there, which is the whole point. The default
        // country's, because a factory-made account is in Canada.
        $numbers = array_column($response->json('safety.helplines'), 'number');
        $this->assertContains('988', $numbers);
        $this->assertContains('911', $numbers);
    }

    public function test_a_spent_budget_still_raises_a_flag_for_a_medium_signal(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->spendTheBudget();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'he hit me again last night'])
            ->assertStatus(Response::HTTP_TOO_MANY_REQUESTS);

        // The turn was refused; the signal a reviewer needs was not.
        $flag = SafetyFlag::query()->sole();
        $this->assertSame(SafetyLevel::Medium, $flag->level);
        $this->assertStringContainsString('rate-limited', $flag->outcome);
    }

    public function test_an_ordinary_answer_is_refused_once_the_budget_is_spent(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->spendTheBudget();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'My manager called me out again'])
            ->assertStatus(Response::HTTP_TOO_MANY_REQUESTS)
            ->assertJsonStructure(['message', 'retryAfter']);

        // Refused, not advanced.
        $this->getJson("/api/sessions/{$id}")->assertJsonPath('step.ordinal', 1);
    }

    public function test_a_safety_stop_does_not_spend_the_budget(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to kill myself'])->assertOk();

        // The guide was never consulted, so there is nothing to charge for.
        $this->assertSame(
            SessionController::GUIDED_TURNS_PER_MINUTE,
            app(RateLimiter::class)->remaining('guided-turns:'.$this->user->id, SessionController::GUIDED_TURNS_PER_MINUTE),
        );
    }

    /**
     * The pricing page promises "3 full sessions a week" on Free.
     *
     * A promise the server does not keep is the same problem in either
     * direction. And the quick session staying available is not an exception to
     * the limit — it is the point of it: someone who is upset should never be
     * told to come back next week.
     */
    public function test_a_free_user_gets_three_full_sessions_a_week(): void
    {
        $this->consentedUser();

        for ($i = 0; $i < 3; $i++) {
            $id = $this->postJson('/api/sessions')->assertCreated()->json('id');

            // Answered, because an untouched session is handed back rather
            // than replaced: three identical starts are one attempt, not three
            // sessions. Using an allowance means having used a session.
            $this->postJson("/api/sessions/{$id}/turns", [
                'utterance' => 'My manager dismissed my work in front of the team',
                'step' => 'notice',
            ])->assertOk();
        }

        $refused = $this->postJson('/api/sessions')->assertStatus(Response::HTTP_PAYMENT_REQUIRED);
        $refused->assertJsonPath('limit', 3)
            ->assertJsonPath('usedThisWeek', 3)
            ->assertJsonPath('quickStillAllowed', true);
        $this->assertStringContainsString('quick session is always available', $refused->json('message'));
    }

    public function test_a_quick_session_is_always_allowed(): void
    {
        $this->consentedUser();

        for ($i = 0; $i < 3; $i++) {
            $id = $this->postJson('/api/sessions')->assertCreated()->json('id');

            // Answered, because an untouched session is handed back rather
            // than replaced: three identical starts are one attempt, not three
            // sessions. Using an allowance means having used a session.
            $this->postJson("/api/sessions/{$id}/turns", [
                'utterance' => 'My manager dismissed my work in front of the team',
                'step' => 'notice',
            ])->assertOk();
        }

        // However many full ones have been used.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/sessions', ['kind' => 'quick'])
                ->assertCreated()
                ->assertJsonPath('kind', 'quick');
        }
    }

    public function test_a_quick_session_does_not_spend_the_full_allowance(): void
    {
        $this->consentedUser();

        $this->postJson('/api/sessions', ['kind' => 'quick'])->assertCreated();
        $this->postJson('/api/sessions', ['kind' => 'quick'])->assertCreated();

        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 3);
        $this->postJson('/api/sessions')->assertCreated();
        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 2);
    }

    public function test_a_session_outside_the_window_no_longer_counts(): void
    {
        $user = $this->consentedUser();

        for ($i = 0; $i < 3; $i++) {
            GuidedSession::create([
                'user_id' => $user->id,
                'kind' => 'full',
                'step_id' => 'notice',
                'started_at' => now()->subDays(8),
            ]);
        }

        // Eight days ago is outside the seven-day window.
        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 3);
        $this->postJson('/api/sessions')->assertCreated();
    }

    public function test_a_safety_stopped_session_still_counts_against_the_allowance(): void
    {
        $this->consentedUser();

        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to kill myself'])->assertOk();

        // It was a full session. The allowance is about starting one, not
        // finishing it — and such a session has no journal row to count from,
        // which is why the count comes from `started_at`.
        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 2);
    }

    public function test_a_paid_plan_is_not_limited(): void
    {
        $user = $this->consentedUser();
        $user->plan = 'plus';
        $user->save();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/sessions')->assertCreated();
        }

        $this->getJson('/api/me')
            ->assertJsonPath('fullSessionsPerWeek', null)
            ->assertJsonPath('fullSessionsLeft', null);
    }

    public function test_the_profile_says_how_many_full_sessions_are_left(): void
    {
        $this->consentedUser();

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('fullSessionsPerWeek', 3)
            ->assertJsonPath('fullSessionsLeft', 3);

        $this->postJson('/api/sessions')->assertCreated();

        // Said before anyone is refused, not only after.
        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 2);
    }

    /**
     * Closing a tab used to lose a session for good.
     *
     * It stayed open on the server, nothing could reach it again, and on a free
     * plan it had already spent one of three full sessions for the week.
     */
    public function test_an_open_session_can_be_found_again(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'My manager dismissed my work'])
            ->assertOk();

        // As if the tab had been closed and reopened.
        $current = $this->getJson('/api/sessions/current')->assertOk();

        $current->assertJsonPath('id', $id)
            ->assertJsonPath('ended', false)
            // It carries on from where it got to, not from the start.
            ->assertJsonPath('step.ordinal', 2)
            ->assertJsonPath('data.whatHappened', 'My manager dismissed my work');
    }

    public function test_there_is_no_current_session_when_none_is_open(): void
    {
        $this->consentedUser();

        $this->getJson('/api/sessions/current')->assertOk()->assertExactJson([]);
    }

    public function test_a_finished_session_is_not_offered_to_be_resumed(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/stop")->assertOk();

        $this->getJson('/api/sessions/current')->assertOk()->assertExactJson([]);
    }

    public function test_a_safety_stopped_session_is_not_offered_to_be_resumed(): void
    {
        $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to kill myself'])->assertOk();

        // Never a resume path around a safety stop.
        $this->getJson('/api/sessions/current')->assertOk()->assertExactJson([]);
    }

    public function test_resuming_is_the_same_session_and_costs_no_second_allowance(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 2);

        // Found again and carried on. Nothing new was started.
        $this->getJson('/api/sessions/current')->assertJsonPath('id', $id);
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'Something that happened today'])
            ->assertOk();

        $this->getJson('/api/me')->assertJsonPath('fullSessionsLeft', 2);
    }

    public function test_starting_a_session_ends_whatever_was_open(): void
    {
        $this->consentedUser();
        $first = $this->newSession();

        // There has to be something to end. An untouched session is handed
        // back instead, because there is nothing to carry on from and no
        // reason to charge for a second one.
        $this->postJson("/api/sessions/{$first}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();

        $second = $this->newSession();

        $this->assertNotSame($first, $second);

        // One at a time, because a person is in one at a time. Two open
        // sessions would both offer to be resumed, and a user could not tell
        // which one their answers were going into.
        $this->getJson('/api/sessions/current')->assertJsonPath('id', $second);
        $this->getJson("/api/sessions/{$first}")
            ->assertOk()
            ->assertJsonPath('ended', true)
            // What happened is that they chose to start again.
            ->assertJsonPath('endReason', 'user_stopped');
    }

    public function test_current_is_this_users_own_session_only(): void
    {
        $theirs = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($theirs);
        $this->postJson('/api/sessions')->assertCreated();

        $this->app['auth']->forgetGuards();
        $this->consentedUser();
        $this->getJson('/api/sessions/current')->assertOk()->assertExactJson([]);
    }

    public function test_current_requires_a_token(): void
    {
        $this->getJson('/api/sessions/current')->assertUnauthorized();
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
        $this->assertSame(['988', '1-866-277-3553', '911'], $numbers);
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

    /** Uses up this token's guided-turn budget for the minute. */
    private function spendTheBudget(): void
    {
        $limiter = app(RateLimiter::class);
        for ($i = 0; $i < SessionController::GUIDED_TURNS_PER_MINUTE; $i++) {
            $limiter->hit('guided-turns:'.$this->user->id);
        }
    }
}
