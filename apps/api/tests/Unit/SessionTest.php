<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\FeelingId;
use App\Domain\ProtocolVersion;
use App\Domain\SafetyLevel;
use App\Domain\Session;
use App\Domain\SessionKind;
use App\Domain\StepId;
use PHPUnit\Framework\TestCase;

final class SessionTest extends TestCase
{
    public function test_opens_on_step_one_with_nothing_gathered(): void
    {
        $s = Session::start();
        $this->assertSame(StepId::Notice, $s->stepId);
        $this->assertSame(0, $s->guideTurnsUsed);
        $this->assertSame([], $s->data->feelings);
        $this->assertNull($s->endReason);
        $this->assertSame(SafetyLevel::None, $s->safetyLevel);
        $this->assertSame(1, $s->ordinal());
    }

    public function test_advances_one_step_at_a_time(): void
    {
        $s = Session::start();
        foreach (StepId::ordered() as $id) {
            $this->assertSame($id, $s->stepId);
            $s = $s->withStepSatisfied();
        }
        $this->assertTrue($s->hasEnded());
        $this->assertSame(EndReason::Completed, $s->endReason);
        $this->assertNull($s->stepId);
        $this->assertNull($s->ordinal());
    }

    public function test_resets_the_guide_turn_count_on_each_new_step(): void
    {
        $s = Session::start()->withGuideTurn()->withGuideTurn()->withStepSatisfied();
        $this->assertSame(StepId::Responsibility, $s->stepId);
        $this->assertSame(0, $s->guideTurnsUsed);
    }

    public function test_does_not_mutate_the_session_it_is_given(): void
    {
        $s = Session::start();
        $s->withStepSatisfied();
        $this->assertSame(StepId::Notice, $s->stepId);
        $this->assertFalse($s->hasEnded());
    }

    public function test_collects_the_fields_the_summary_screen_shows(): void
    {
        $s = Session::start()
            ->withStepSatisfied(['whatHappened' => 'Manager pointed out my mistake'])
            ->withStepSatisfied()
            ->withStepSatisfied(['feelings' => ['ashamed', 'hangry', 'rejected', 'unworthy']])
            ->withStepSatisfied(['memory' => ['description' => 'Class 3', 'age' => 8]])
            ->withStepSatisfied(['belief' => 'I’m not good enough.'])
            ->withStepSatisfied();

        $this->assertSame(EndReason::Completed, $s->endReason);
        $this->assertSame('Manager pointed out my mistake', $s->data->whatHappened);
        $this->assertSame(['description' => 'Class 3', 'age' => 8], $s->data->memory);
        $this->assertSame('I’m not good enough.', $s->data->belief);
        // "hangry" is not in the taxonomy, so it is dropped rather than stored.
        $this->assertSame(
            [FeelingId::Ashamed, FeelingId::Rejected, FeelingId::Unworthy],
            $s->data->feelings,
        );
    }

    public function test_stops_the_session_the_moment_a_high_signal_arrives(): void
    {
        $s = Session::start()->withSafetySignal(SafetyLevel::High);
        $this->assertTrue($s->hasEnded());
        $this->assertSame(EndReason::SafetyStop, $s->endReason);
        $this->assertNull($s->stepId);
        $this->assertSame(SafetyLevel::High, $s->safetyLevel);
    }

    public function test_records_a_medium_signal_without_stopping(): void
    {
        $s = Session::start()->withSafetySignal(SafetyLevel::Medium);
        $this->assertFalse($s->hasEnded());
        $this->assertSame(StepId::Notice, $s->stepId);
        $this->assertSame(SafetyLevel::Medium, $s->safetyLevel);
    }

    public function test_never_lowers_the_safety_level_once_raised(): void
    {
        $s = Session::start()
            ->withSafetySignal(SafetyLevel::Medium)
            ->withSafetySignal(SafetyLevel::None);
        $this->assertSame(SafetyLevel::Medium, $s->safetyLevel);
    }

    public function test_cannot_be_resumed_after_a_safety_stop(): void
    {
        $stopped = Session::start()->withSafetySignal(SafetyLevel::High);
        $after = $stopped->withStepSatisfied()->withGuideTurn()->withSafetySignal(SafetyLevel::None);
        $this->assertSame(EndReason::SafetyStop, $after->endReason);
        $this->assertNull($after->stepId);
        $this->assertTrue($after->hasEnded());
    }

    public function test_the_user_can_stop_at_any_time(): void
    {
        $s = Session::start()->withStepSatisfied()->withUserStopped();
        $this->assertSame(EndReason::UserStopped, $s->endReason);
    }

    public function test_keeps_what_was_gathered_before_the_user_stopped(): void
    {
        $s = Session::start()
            ->withStepSatisfied(['whatHappened' => 'A hard day'])
            ->withUserStopped();
        $this->assertSame('A hard day', $s->data->whatHappened);
    }

    public function test_accepts_the_rating_after_the_session_completes(): void
    {
        $s = Session::start();
        foreach (StepId::ordered() as $_) {
            $s = $s->withStepSatisfied();
        }
        $s = $s->withRating(CalmerRating::ALittle);
        $this->assertSame(CalmerRating::ALittle, $s->data->calmerRating);
        $this->assertSame(EndReason::Completed, $s->endReason);
    }

    public function test_accepts_the_rating_after_a_safety_stop_without_reopening(): void
    {
        $stopped = Session::start()->withSafetySignal(SafetyLevel::High);
        $rated = $stopped->withRating(CalmerRating::No);
        $this->assertTrue($rated->hasEnded());
        $this->assertSame(EndReason::SafetyStop, $rated->endReason);
        $this->assertSame(CalmerRating::No, $rated->data->calmerRating);
    }

    public function test_runs_out_of_guide_turns_at_the_step_limit(): void
    {
        $v = ProtocolVersion::baseline(); // step 4 allows 4 guide turns
        $s = Session::start();
        foreach ([StepId::Notice, StepId::Responsibility, StepId::Feel] as $_) {
            $s = $s->withStepSatisfied();
        }
        $this->assertSame(StepId::Remember, $s->stepId);
        $this->assertFalse($s->isOutOfGuideTurns($v));

        for ($i = 0; $i < 4; $i++) {
            $s = $s->withGuideTurn();
        }
        $this->assertTrue($s->isOutOfGuideTurns($v));
    }

    public function test_treats_an_unstated_limit_as_unlimited_not_zero(): void
    {
        $v = ProtocolVersion::baseline();
        $s = Session::start()->withGuideTurn()->withGuideTurn();
        $this->assertSame(StepId::Notice, $s->stepId);
        $this->assertFalse($s->isOutOfGuideTurns($v));
    }

    public function test_records_the_protocol_version_it_started_on(): void
    {
        $this->assertNull(Session::start()->protocolVersion);
        $this->assertSame('1.4', Session::start(SessionKind::Full, '1.4')->protocolVersion);
    }

    public function test_keeps_the_kind_and_pinned_version_across_the_session(): void
    {
        $s = Session::start(SessionKind::Quick, '2.3')->withStepSatisfied()->withUserStopped();
        $this->assertSame(SessionKind::Quick, $s->kind);
        $this->assertSame('2.3', $s->protocolVersion);
    }

    /**
     * The bug this closes, stated as a test.
     *
     * `$stepId` is cleared when a session ends, so after the fact a session
     * stopped at step 1 and one that ran all six look the same. The console's
     * reach chart read `stepId ?? the last step` and counted every ended
     * session — a safety stop at step 1 included — as having reached step 6,
     * while the number beside it said none had.
     */
    public function test_the_furthest_step_survives_a_safety_stop(): void
    {
        $stopped = Session::start()->withSafetySignal(SafetyLevel::High);

        $this->assertTrue($stopped->hasEnded());
        $this->assertNull($stopped->stepId);
        $this->assertSame(StepId::Notice, $stopped->furthestStepId);
    }

    public function test_the_furthest_step_survives_the_user_stopping(): void
    {
        $s = Session::start()->withStepSatisfied()->withStepSatisfied();
        $this->assertSame(StepId::Feel, $s->stepId);

        $s = $s->withUserStopped();
        $this->assertNull($s->stepId);
        $this->assertSame(StepId::Feel, $s->furthestStepId);
    }

    public function test_the_furthest_step_starts_on_the_first_one(): void
    {
        // Being on a step counts as having reached it, which is what the
        // chart this feeds means by "reach".
        $this->assertSame(StepId::Notice, Session::start()->furthestStepId);
    }

    public function test_the_furthest_step_moves_with_the_step(): void
    {
        $s = Session::start()->withStepSatisfied()->withStepSatisfied()->withStepSatisfied();
        $this->assertSame(StepId::Remember, $s->stepId);
        $this->assertSame(StepId::Remember, $s->furthestStepId);
    }

    public function test_the_furthest_step_is_the_last_one_once_every_step_is_satisfied(): void
    {
        $s = Session::start();
        foreach (StepId::ordered() as $ignored) {
            $s = $s->withStepSatisfied();
        }

        $this->assertSame(EndReason::Completed, $s->endReason);
        $this->assertNull($s->stepId);
        $this->assertSame(StepId::Forgive, $s->furthestStepId);
    }

    public function test_a_guide_turn_does_not_move_the_furthest_step(): void
    {
        // The same step asked again is not a step reached.
        $this->assertSame(StepId::Notice, Session::start()->withGuideTurn()->furthestStepId);
    }

    public function test_the_rating_that_lands_afterwards_does_not_move_it(): void
    {
        $s = Session::start()->withStepSatisfied()->withUserStopped()->withRating(CalmerRating::Yes);
        $this->assertSame(StepId::Responsibility, $s->furthestStepId);
    }

    /** It only rises, like the safety level, and nothing walks it back. */
    public function test_the_furthest_step_only_ever_rises(): void
    {
        $s = Session::start();
        $seen = $s->furthestStepId->ordinal();

        $steps = [
            fn (Session $x) => $x->withGuideTurn(),
            fn (Session $x) => $x->withStepSatisfied(),
            fn (Session $x) => $x->withSafetySignal(SafetyLevel::Low),
            fn (Session $x) => $x->withStepSatisfied(),
            fn (Session $x) => $x->withGuideTurn(),
            fn (Session $x) => $x->withSafetySignal(SafetyLevel::Medium),
            fn (Session $x) => $x->withStepSatisfied(),
            fn (Session $x) => $x->withUserStopped(),
            fn (Session $x) => $x->withRating(CalmerRating::No),
        ];

        foreach ($steps as $i => $step) {
            $s = $step($s);
            $now = $s->furthestStepId->ordinal();
            $this->assertGreaterThanOrEqual($seen, $now, "step {$i} lowered it");
            $seen = $now;
        }

        $this->assertSame(StepId::Remember, $s->furthestStepId);
    }
}
