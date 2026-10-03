<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\ProtocolVersion;
use App\Domain\StepId;
use PHPUnit\Framework\TestCase;

final class ProtocolVersionTest extends TestCase
{
    private function complete(): ProtocolVersion
    {
        $v = ProtocolVersion::baseline();
        foreach (StepId::ordered() as $id) {
            $v = $v->withStepEdit($id, [
                'main' => "Question for {$id->value}?",
                'backups' => ['Backup one?', 'Backup two?'],
                'doneWhen' => 'The user answers.',
                'maxGuideTurns' => 4,
            ]);
        }

        return $v;
    }

    public function test_the_baseline_is_a_draft_because_the_designs_leave_steps_unwritten(): void
    {
        $v = ProtocolVersion::baseline();
        $this->assertSame('draft', $v->status);
        $this->assertFalse($v->isRunnable());
        $this->assertFalse($v->isPublishable());
    }

    public function test_the_baseline_carries_only_the_copy_the_designs_specify(): void
    {
        $v = ProtocolVersion::baseline();
        // Step 4 is the only fully specified step anywhere in the designs.
        $this->assertTrue($v->step(StepId::Remember)->isComplete());
        $this->assertSame(4, $v->step(StepId::Remember)->maxGuideTurns);
        $this->assertCount(2, $v->step(StepId::Remember)->prompts->backups);
        $this->assertFalse($v->step(StepId::Responsibility)->isComplete());
        $this->assertNull($v->step(StepId::Responsibility)->prompts->main);
    }

    public function test_reports_every_problem_named_by_step(): void
    {
        $problems = ProtocolVersion::baseline()->publishProblems();
        $steps = array_filter(array_map(fn ($p) => $p['stepId'], $problems));
        $this->assertContains(StepId::Responsibility, $steps);
        $this->assertContains(StepId::Forgive, $steps);
        $this->assertGreaterThan(5, count($problems));
    }

    public function test_publishes_a_complete_draft(): void
    {
        $live = $this->complete()->publish(new \DateTimeImmutable('2026-10-03T12:00:00Z'));
        $this->assertNotNull($live);
        $this->assertSame('live', $live->status);
        $this->assertNotNull($live->publishedAt);
    }

    public function test_refuses_a_draft_with_a_step_missing_its_question(): void
    {
        $v = $this->complete()->withStepEdit(StepId::Feel, ['main' => null]);
        $this->assertNull($v->publish(new \DateTimeImmutable));
    }

    public function test_treats_blank_copy_as_missing(): void
    {
        $v = $this->complete()->withStepEdit(StepId::Feel, ['main' => '   ']);
        $this->assertNull($v->publish(new \DateTimeImmutable));
    }

    public function test_refuses_a_step_that_allows_no_guide_turns(): void
    {
        $v = $this->complete()->withStepEdit(StepId::Notice, ['maxGuideTurns' => 0]);
        $problems = array_map(fn ($p) => $p['reason'], $v->publishProblems());
        $this->assertNotEmpty(array_filter($problems, fn ($r) => str_contains($r, 'no guide turns')));
    }

    public function test_refuses_a_draft_whose_safety_message_is_blank(): void
    {
        $v = $this->complete()->withSafetyWording(body: '   ');
        $this->assertNull($v->publish(new \DateTimeImmutable));
    }

    public function test_a_live_version_can_no_longer_be_edited(): void
    {
        $live = $this->complete()->publish(new \DateTimeImmutable);
        $this->assertFalse($live->isEditable());
        $this->assertSame($live, $live->withStepEdit(StepId::Feel, ['main' => 'changed']));
        $this->assertSame($live, $live->withSafetyWording(title: 'changed'));
    }

    public function test_refuses_to_publish_something_already_live(): void
    {
        $live = $this->complete()->publish(new \DateTimeImmutable);
        $this->assertNull($live->publish(new \DateTimeImmutable));
    }

    public function test_opens_the_next_draft_at_the_next_minor(): void
    {
        $live = $this->complete()->publish(new \DateTimeImmutable);
        $next = $live->nextDraft();
        $this->assertSame('1.1', $next->label());
        $this->assertSame('draft', $next->status);
        $this->assertNull($next->publishedAt);
    }

    public function test_does_not_mutate_the_draft_it_publishes(): void
    {
        $draft = $this->complete();
        $draft->publish(new \DateTimeImmutable);
        $this->assertSame('draft', $draft->status);
    }

    public function test_carries_the_safety_wording_the_designs_specify(): void
    {
        $this->assertSame('Let’s pause here.', ProtocolVersion::baseline()->pauseTitle);
    }
}
