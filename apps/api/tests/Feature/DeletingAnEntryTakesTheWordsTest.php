<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\EndReason;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Deleting a journal entry has to actually delete the words.
 *
 * The entry is a copy. `guided_sessions.data` holds the same answers, and
 * `GET /sessions/{id}` serves that row to the owner's token — so deleting an
 * entry used to leave every word of it readable through the API. The product
 * says "It is removed for good … This cannot be undone" and "we cannot get it
 * back for you", and a promise the server does not keep is the same problem
 * whichever way it points.
 *
 * The row stays, and that is the other half of this: the weekly allowance is
 * counted from `started_at`, so deleting the row would refund a full session.
 */
final class DeletingAnEntryTakesTheWordsTest extends TestCase
{
    private const SAID = 'the words I will delete, about my manager';

    use RefreshDatabase;

    private function sessionWithEntry(User $user): GuidedSession
    {
        $session = GuidedSession::create([
            'user_id' => $user->id,
            'kind' => SessionKind::Full,
            'step_id' => StepId::Forgive,
            'end_reason' => EndReason::Completed,
            'safety_level' => SafetyLevel::None,
            'protocol_version' => '1.0',
            'data' => [
                'whatHappened' => self::SAID,
                'belief' => 'I am not good enough',
                'forgiveness' => 'Forgive me for believing that.',
                'memory' => ['description' => 'Being talked over at school'],
                'title' => self::SAID,
            ],
            'started_at' => now()->subHour(),
            'ended_at' => now(),
        ]);

        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'title' => self::SAID,
            'what_happened' => self::SAID,
            'belief' => 'I am not good enough',
            'feelings' => ['ashamed'],
            'kind' => SessionKind::Full,
            'duration_minutes' => 14,
            'occurred_at' => now(),
            'reached_final_step' => true,
        ]);

        return $session;
    }

    public function test_the_session_no_longer_holds_what_was_said(): void
    {
        $user = User::factory()->create();
        $session = $this->sessionWithEntry($user);
        $entry = JournalEntry::query()->where('user_id', $user->id)->firstOrFail();

        Sanctum::actingAs($user);
        $this->deleteJson("/api/journal/{$entry->id}")->assertNoContent();

        $this->assertSame([], $session->refresh()->data);
    }

    public function test_the_words_cannot_be_read_back_through_the_api(): void
    {
        // The assertion that matters. A cleared column is the mechanism; this
        // is the promise — the owner's own token, the route that serves the
        // session, and nothing of what they deleted.
        $user = User::factory()->create();
        $session = $this->sessionWithEntry($user);
        $entry = JournalEntry::query()->where('user_id', $user->id)->firstOrFail();

        Sanctum::actingAs($user);
        $this->deleteJson("/api/journal/{$entry->id}")->assertNoContent();

        $response = $this->getJson("/api/sessions/{$session->id}")->assertOk();
        $this->assertStringNotContainsString(self::SAID, $response->content());
        $this->assertStringNotContainsString('I am not good enough', $response->content());
        $this->assertStringNotContainsString('talked over at school', $response->content());
        $this->assertNull($response->json('data.whatHappened'));
    }

    public function test_it_does_not_refund_the_weekly_allowance(): void
    {
        // The session row survives on purpose. The allowance counts
        // `started_at`, so deleting the row would make "3 full sessions a week"
        // mean "3 you have not deleted".
        $user = User::factory()->create([
            'plan' => 'free',
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        for ($i = 0; $i < 3; $i++) {
            $this->sessionWithEntry($user);
        }

        Sanctum::actingAs($user);
        foreach (JournalEntry::query()->where('user_id', $user->id)->get() as $entry) {
            $this->deleteJson("/api/journal/{$entry->id}")->assertNoContent();
        }

        $this->assertSame(3, GuidedSession::query()->where('user_id', $user->id)->count());
        $this->postJson('/api/sessions')
            ->assertStatus(402)
            ->assertJsonPath('usedThisWeek', 3);
    }

    public function test_it_leaves_a_safety_flag_alone(): void
    {
        // A flag's excerpt is the queue's, not the journal's. A
        // safety-stopped session never has an entry to delete, so this is
        // about a medium flag raised on a session that then finished.
        $user = User::factory()->create();
        $session = $this->sessionWithEntry($user);
        SafetyFlag::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'what a reviewer needs to read',
            'outcome' => 'Flagged for review. Session continued.',
            'status' => 'open',
            'raised_at' => now(),
        ]);
        $entry = JournalEntry::query()->where('user_id', $user->id)->firstOrFail();

        Sanctum::actingAs($user);
        $this->deleteJson("/api/journal/{$entry->id}")->assertNoContent();

        $this->assertSame(
            'what a reviewer needs to read',
            SafetyFlag::query()->where('user_id', $user->id)->firstOrFail()->excerpt,
        );
    }
}
