<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\FeelingId;
use App\Domain\SafetyLevel;
use App\Domain\Session as DomainSession;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class PersistenceTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create();
    }

    private function storedSession(User $user, DomainSession $session): GuidedSession
    {
        $row = new GuidedSession(['user_id' => $user->id, 'started_at' => now()]);
        $row->storeDomain($session)->save();

        return $row->fresh();
    }

    public function test_a_session_round_trips_through_the_database(): void
    {
        $user = $this->user();
        $session = DomainSession::start(SessionKind::Full, '1.0')
            ->withStepSatisfied(['whatHappened' => 'Called out at work', 'title' => 'Called out at work'])
            ->withStepSatisfied()
            ->withStepSatisfied(['feelings' => ['ashamed', 'rejected', 'unworthy']])
            ->withStepSatisfied(['memory' => ['description' => 'Teacher read my wrong answer out loud', 'age' => 8]])
            ->withStepSatisfied(['belief' => 'I’m not good enough.']);

        $restored = $this->storedSession($user, $session)->toDomain();

        $this->assertSame(StepId::Forgive, $restored->stepId);
        $this->assertSame('Called out at work', $restored->data->whatHappened);
        $this->assertSame('I’m not good enough.', $restored->data->belief);
        $this->assertSame(['description' => 'Teacher read my wrong answer out loud', 'age' => 8], $restored->data->memory);
        $this->assertSame(
            [FeelingId::Ashamed, FeelingId::Rejected, FeelingId::Unworthy],
            $restored->data->feelings,
        );
        $this->assertSame('1.0', $restored->protocolVersion);
        $this->assertSame(SessionKind::Full, $restored->kind);
    }

    public function test_session_content_is_encrypted_at_rest(): void
    {
        $user = $this->user();
        $this->storedSession($user, DomainSession::start()->withStepSatisfied([
            'whatHappened' => 'a very distinctive sentence about my manager',
        ]));

        $raw = (string) DB::table('guided_sessions')->value('data');

        // The column must not contain the user's words in the clear.
        $this->assertStringNotContainsString('distinctive sentence', $raw);
        $this->assertNotEmpty($raw);
    }

    public function test_a_safety_stopped_session_is_never_journalled(): void
    {
        $user = $this->user();
        $row = $this->storedSession($user, DomainSession::start()->withSafetySignal(SafetyLevel::High));

        $this->assertSame(EndReason::SafetyStop, $row->toDomain()->endReason);
        // The user was handed to a helpline. Turning that into a diary entry is
        // the wrong thing to put in front of them later.
        $this->assertNull(JournalEntry::fromSession($row, 9));
    }

    public function test_a_running_session_is_not_journalled(): void
    {
        $row = $this->storedSession($this->user(), DomainSession::start());
        $this->assertNull(JournalEntry::fromSession($row, 4));
    }

    public function test_a_completed_session_becomes_a_journal_entry(): void
    {
        $user = $this->user();
        // Capture during the steps, not after: an ended session ignores
        // further step_satisfied events, which is the point of it being
        // terminal.
        $session = DomainSession::start()
            ->withStepSatisfied(['title' => 'Called out at work'])
            ->withStepSatisfied()
            ->withStepSatisfied()
            ->withStepSatisfied()
            ->withStepSatisfied(['belief' => 'I’m not good enough.'])
            ->withStepSatisfied()
            ->withRating(CalmerRating::Yes);
        $this->assertSame(EndReason::Completed, $session->endReason);

        $row = $this->storedSession($user, $session);
        $entry = JournalEntry::fromSession($row, 14);

        $this->assertNotNull($entry);
        $entry->save();

        $stored = JournalEntry::first();
        $this->assertSame('Called out at work', $stored->title);
        $this->assertTrue($stored->reached_final_step);
        $this->assertSame(CalmerRating::Yes, $stored->calmer_rating);
        $this->assertSame(14, $stored->duration_minutes);
        // Private until the user chooses otherwise.
        $this->assertFalse($stored->shared_with_coach);
    }

    public function test_a_session_the_user_left_early_is_kept_but_not_as_completed(): void
    {
        $user = $this->user();
        $session = DomainSession::start()
            ->withStepSatisfied(['title' => 'Left early'])
            ->withUserStopped();

        $entry = JournalEntry::fromSession($this->storedSession($user, $session), 3);
        $this->assertNotNull($entry);
        $this->assertFalse($entry->reached_final_step);
    }

    public function test_journal_content_is_encrypted_at_rest(): void
    {
        $user = $this->user();
        JournalEntry::create([
            'user_id' => $user->id,
            'title' => 'an unmistakable title',
            'belief' => 'a belief nobody else should read',
            'feelings' => ['sad'],
            'kind' => SessionKind::Full,
            'duration_minutes' => 10,
            'occurred_at' => now(),
        ]);

        $raw = (array) DB::table('journal_entries')->first();
        $blob = implode('|', array_map(fn ($v) => is_scalar($v) ? (string) $v : '', $raw));

        $this->assertStringNotContainsString('unmistakable title', $blob);
        $this->assertStringNotContainsString('nobody else should read', $blob);
        $this->assertSame('an unmistakable title', JournalEntry::first()->title);
    }

    public function test_a_coach_sees_only_shared_entries(): void
    {
        $user = $this->user();
        $base = [
            'user_id' => $user->id, 'feelings' => [], 'kind' => SessionKind::Full,
            'duration_minutes' => 5, 'occurred_at' => now(),
        ];
        JournalEntry::create([...$base, 'title' => 'Shared one', 'shared_with_coach' => true]);
        JournalEntry::create([...$base, 'title' => 'Private one', 'shared_with_coach' => false]);

        $shared = JournalEntry::query()->sharedWithCoach()->get();

        $this->assertCount(1, $shared);
        $this->assertSame('Shared one', $shared->first()->title);
    }

    public function test_the_safety_queue_orders_most_severe_first(): void
    {
        $user = $this->user();
        foreach ([['low', 3], ['high', 1], ['medium', 2]] as [$level, $hoursAgo]) {
            SafetyFlag::create([
                'user_id' => $user->id,
                'level' => $level,
                'category' => 'self_harm',
                'excerpt' => 'something',
                'outcome' => 'Flagged for review.',
                'raised_at' => now()->subHours($hoursAgo),
            ]);
        }

        // Ordered by severity in SQL, not by the stored string — which would
        // sort alphabetically and put "high" below "low".
        $this->assertSame(
            ['high', 'medium', 'low'],
            SafetyFlag::query()->byUrgency()->get()->map(fn ($f) => $f->level->value)->all(),
        );
    }

    public function test_the_safety_queue_lists_only_open_flags(): void
    {
        $user = $this->user();
        $open = SafetyFlag::create([
            'user_id' => $user->id, 'level' => 'high', 'category' => 'self_harm',
            'excerpt' => 'x', 'outcome' => 'Session stopped.', 'raised_at' => now(),
        ]);
        $done = SafetyFlag::create([
            'user_id' => $user->id, 'level' => 'low', 'category' => 'medical',
            'excerpt' => 'y', 'outcome' => 'Reviewed.', 'raised_at' => now(), 'status' => 'reviewed',
        ]);

        $this->assertSame([$open->id], SafetyFlag::query()->open()->pluck('id')->all());
        $this->assertNotContains($done->id, SafetyFlag::query()->open()->pluck('id')->all());
    }

    public function test_a_flag_excerpt_is_encrypted_at_rest(): void
    {
        SafetyFlag::create([
            'user_id' => $this->user()->id, 'level' => 'high', 'category' => 'self_harm',
            'excerpt' => 'a phrase that must never sit in the clear', 'outcome' => 'Session stopped.',
            'raised_at' => now(),
        ]);

        $raw = (string) DB::table('safety_flags')->value('excerpt');
        $this->assertStringNotContainsString('must never sit in the clear', $raw);
        $this->assertSame('a phrase that must never sit in the clear', SafetyFlag::first()->excerpt);
    }

    public function test_consent_blocks_until_both_required_items_are_accepted(): void
    {
        $user = $this->user();

        $user->accepted_consent = [];
        $this->assertFalse($user->hasRequiredConsent());

        $user->accepted_consent = ['improve'];
        // A data choice that gates the product is not a choice.
        $this->assertFalse($user->hasRequiredConsent());

        $user->accepted_consent = ['understands'];
        $this->assertFalse($user->hasRequiredConsent());

        $user->accepted_consent = ['understands', 'adult'];
        $this->assertTrue($user->hasRequiredConsent());
    }
}
