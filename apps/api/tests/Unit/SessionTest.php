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
}
