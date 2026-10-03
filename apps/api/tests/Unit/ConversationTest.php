<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Conversation;
use App\Domain\EndReason;
use App\Domain\Guide;
use App\Domain\GuideReply;
use App\Domain\NoRiskScreen;
use App\Domain\PhraseRiskScreen;
use App\Domain\ProtocolVersion;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\ScriptedGuide;
use App\Domain\Session;
use App\Domain\StepId;
use PHPUnit\Framework\TestCase;

final class ConversationTest extends TestCase
{
    /** A version with every step runnable, so the loop is what is under test. */
    private function runnable(): ProtocolVersion
    {
        $v = ProtocolVersion::baseline();
        foreach (StepId::ordered() as $id) {
            $v = $v->withStepEdit($id, [
                'main' => "Main question for {$id->value}?",
                'backups' => ["Backup one for {$id->value}?", "Backup two for {$id->value}?"],
                'doneWhen' => 'The user answers.',
                'maxGuideTurns' => 3,
            ]);
        }

        return $v;
    }

    private function quiet(): Conversation
    {
        return new Conversation(new ScriptedGuide, new NoRiskScreen);
    }

    private function screened(): Conversation
    {
        return new Conversation(new ScriptedGuide, new PhraseRiskScreen);
    }

    public function test_opens_a_step_with_its_main_question(): void
    {
        $this->assertSame(
            'Main question for notice?',
            $this->quiet()->openingLine(Session::start(), $this->runnable()),
        );
    }

    public function test_advances_on_a_substantial_answer(): void
    {
        $r = $this->quiet()->takeTurn(Session::start(), $this->runnable(), 'My manager called me out in front of everyone');
        $this->assertTrue($r->advanced);
        $this->assertSame(StepId::Responsibility, $r->session->stepId);
        $this->assertFalse($r->stopped);
    }

    public function test_offers_a_backup_when_the_answer_is_too_thin(): void
    {
        $r = $this->quiet()->takeTurn(Session::start(), $this->runnable(), 'dunno');
        $this->assertFalse($r->advanced);
        $this->assertSame('Backup one for notice?', $r->say);
        $this->assertSame(StepId::Notice, $r->session->stepId);
        $this->assertSame(1, $r->session->guideTurnsUsed);
    }

    public function test_works_through_the_backups_in_order(): void
    {
        $v = $this->runnable();
        $c = $this->quiet();
        $first = $c->takeTurn(Session::start(), $v, 'no');
        $second = $c->takeTurn($first->session, $v, 'no');
        $this->assertSame('Backup one for notice?', $first->say);
        $this->assertSame('Backup two for notice?', $second->say);
    }

    public function test_moves_on_rather_than_pressing_someone_who_cannot_answer(): void
    {
        $v = $this->runnable();
        $c = $this->quiet();
        $s = Session::start();
        for ($i = 0; $i < 2; $i++) {
            $s = $c->takeTurn($s, $v, 'no')->session;
        }
        $last = $c->takeTurn($s, $v, 'no');
        $this->assertTrue($last->advanced);
        $this->assertSame(StepId::Responsibility, $last->session->stepId);
    }

    public function test_records_what_the_guide_captured(): void
    {
        $capturing = new class implements Guide
        {
            public function respond(Session $s, ProtocolVersion $v, string $u): GuideReply
            {
                return new GuideReply('', true, ['whatHappened' => 'Called out at work']);
            }
        };
        $c = new Conversation($capturing, new NoRiskScreen);
        $r = $c->takeTurn(Session::start(), $this->runnable(), 'anything');
        $this->assertSame('Called out at work', $r->session->data->whatHappened);
    }

    public function test_leaves_an_ended_session_untouched(): void
    {
        $ended = Session::start()->withUserStopped();
        $r = $this->quiet()->takeTurn($ended, $this->runnable(), 'something');
        $this->assertSame($ended, $r->session);
        $this->assertSame('', $r->say);
    }

    public function test_ends_the_session_on_a_high_risk_utterance(): void
    {
        $r = $this->screened()->takeTurn(
            Session::start(),
            $this->runnable(),
            'Sometimes I think everyone would be better off without me.',
        );
        $this->assertTrue($r->stopped);
        $this->assertTrue($r->session->hasEnded());
        $this->assertSame(EndReason::SafetyStop, $r->session->endReason);
    }

    public function test_never_consults_the_guide_on_a_high_risk_utterance(): void
    {
        $spy = new class implements Guide
        {
            public bool $called = false;

            public function respond(Session $s, ProtocolVersion $v, string $u): GuideReply
            {
                $this->called = true;

                return new GuideReply('', false);
            }
        };

        $c = new Conversation($spy, new PhraseRiskScreen);
        $c->takeTurn(Session::start(), $this->runnable(), 'I want to die');

        // A model answering someone who has just said they are not safe is
        // exactly what this ordering exists to prevent.
        $this->assertFalse($spy->called, 'the guide must never be consulted on a high-risk utterance');
    }

    public function test_says_nothing_back_when_it_stops(): void
    {
        $r = $this->screened()->takeTurn(Session::start(), $this->runnable(), 'I want to die');
        $this->assertSame('', $r->say);
        $this->assertFalse($r->advanced);
    }

    public function test_raises_a_flag_a_reviewer_can_read(): void
    {
        $r = $this->screened()->takeTurn(Session::start(), $this->runnable(), 'I want to die');
        $this->assertNotNull($r->flag);
        $this->assertSame(SafetyLevel::High, $r->flag->level);
        $this->assertSame(SafetyCategory::SelfHarm, $r->flag->category);
        $this->assertSame('I want to die', $r->flag->excerpt);
    }

    public function test_flags_a_medium_signal_without_interrupting(): void
    {
        $r = $this->screened()->takeTurn(Session::start(), $this->runnable(), 'I stopped my meds last week honestly');
        $this->assertFalse($r->stopped);
        $this->assertFalse($r->session->hasEnded());
        $this->assertSame(SafetyLevel::Medium, $r->flag->level);
        $this->assertSame(SafetyLevel::Medium, $r->session->safetyLevel);
    }

    public function test_keeps_a_medium_signal_recorded_after_the_turn_proceeds(): void
    {
        $v = $this->runnable();
        $c = $this->screened();
        $s = $c->takeTurn(Session::start(), $v, 'I stopped my meds last week honestly')->session;
        $s = $c->takeTurn($s, $v, 'anyway this is what happened at work')->session;
        $this->assertSame(SafetyLevel::Medium, $s->safetyLevel);
    }

    public function test_raises_no_flag_for_ordinary_upset(): void
    {
        $r = $this->screened()->takeTurn(Session::start(), $this->runnable(), 'My manager called me out at work');
        $this->assertNull($r->flag);
        $this->assertSame(SafetyLevel::None, $r->risk->level);
    }

    /**
     * The bug this closes, stated as a test.
     *
     * A client sends an answer, the response is dropped on the way back, and
     * the client sends the same words again. Without `$answering`, the second
     * request is indistinguishable from a new turn: the words are recorded
     * against the *next* step, and the question that step actually asks is
     * never answered by anybody. On a phone on mobile data that is not an edge
     * case.
     */
    public function test_refuses_an_answer_to_a_step_that_has_moved_on(): void
    {
        $v = $this->runnable();
        $c = $this->quiet();
        $said = 'My manager called me out in front of everyone';

        $first = $c->takeTurn(Session::start(), $v, $said, answering: StepId::Notice);
        $this->assertSame(StepId::Responsibility, $first->session->stepId);

        // The retry, carrying the step the client still thinks it is on.
        $retry = $c->takeTurn($first->session, $v, $said, answering: StepId::Notice);

        $this->assertTrue($retry->stale);
        $this->assertFalse($retry->advanced);
        $this->assertSame('', $retry->say);
        $this->assertSame(StepId::Responsibility, $retry->session->stepId);
        $this->assertFalse($retry->guideConsulted());
    }

    public function test_does_not_consult_the_guide_on_a_stale_answer(): void
    {
        $spy = new class implements Guide
        {
            public bool $called = false;

            public function respond(Session $s, ProtocolVersion $v, string $u): GuideReply
            {
                $this->called = true;

                return new GuideReply('', false);
            }
        };

        $v = $this->runnable();
        $moved = Session::start()->withStepSatisfied();
        (new Conversation($spy, new PhraseRiskScreen))
            ->takeTurn($moved, $v, 'My manager called me out', answering: StepId::Notice);

        $this->assertFalse($spy->called);
    }

    /**
     * The ordering rule, again. Nothing about which step a client thinks it is
     * on may refuse a turn before anything has looked at what was said — the
     * request it would refuse is someone saying they are not safe.
     */
    public function test_still_stops_the_session_when_a_stale_answer_says_someone_is_not_safe(): void
    {
        $moved = Session::start()->withStepSatisfied();
        $r = $this->screened()->takeTurn(
            $moved,
            $this->runnable(),
            'I want to die',
            answering: StepId::Notice,
        );

        $this->assertTrue($r->stopped);
        $this->assertFalse($r->stale);
        $this->assertSame(EndReason::SafetyStop, $r->session->endReason);
        $this->assertSame(SafetyCategory::SelfHarm, $r->flag->category);
    }

    public function test_still_raises_a_flag_on_a_stale_answer(): void
    {
        $moved = Session::start()->withStepSatisfied();
        $r = $this->screened()->takeTurn(
            $moved,
            $this->runnable(),
            'I stopped my meds last week honestly',
            answering: StepId::Notice,
        );

        // The words were said. That they answered a question the session has
        // moved past does not make them less of a disclosure.
        $this->assertTrue($r->stale);
        $this->assertSame(SafetyLevel::Medium, $r->flag->level);
        $this->assertSame(SafetyLevel::Medium, $r->session->safetyLevel);
    }

    public function test_applies_the_answer_when_the_caller_names_the_step_in_progress(): void
    {
        $r = $this->quiet()->takeTurn(
            Session::start(),
            $this->runnable(),
            'My manager called me out in front of everyone',
            answering: StepId::Notice,
        );

        $this->assertFalse($r->stale);
        $this->assertTrue($r->advanced);
    }

    /**
     * A caller that cannot say is treated as not having said, rather than as a
     * mismatch. A check that refuses what it cannot understand would refuse a
     * crisis, and the step arrives in a request body where anything may
     * arrive.
     */
    public function test_applies_the_answer_when_the_caller_does_not_say_which_step(): void
    {
        $moved = Session::start()->withStepSatisfied();
        $r = $this->quiet()->takeTurn($moved, $this->runnable(), 'I snapped at him first');

        $this->assertFalse($r->stale);
        $this->assertTrue($r->advanced);
    }

    public function test_cannot_be_resumed_after_a_safety_stop(): void
    {
        $v = $this->runnable();
        $c = $this->screened();
        $stopped = $c->takeTurn(Session::start(), $v, 'I want to die')->session;
        $after = $c->takeTurn($stopped, $v, 'actually I am fine, lets carry on');
        $this->assertTrue($after->session->hasEnded());
        $this->assertSame(EndReason::SafetyStop, $after->session->endReason);
        $this->assertFalse($after->advanced);
    }
}
