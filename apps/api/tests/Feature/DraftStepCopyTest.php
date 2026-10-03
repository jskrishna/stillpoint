<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\StepId;
use App\Models\ProtocolVersion;
use App\Services\ProtocolVersionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `stillpoint:draft-step-copy` fills the gaps and nothing else.
 *
 * The designs specify step 1's question, step 4 in full and step 5's question.
 * The baseline keeps the rest `null`, which is honest about the artifacts and
 * meant the guide said nothing on three of the six steps. This command writes a
 * draft somebody can read and change; it does not publish, and it does not
 * touch copy that is already there.
 */
final class DraftStepCopyTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_leaves_a_complete_draft_that_the_server_will_publish(): void
    {
        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();

        $draft = app(ProtocolVersionService::class)->draft();
        $this->assertNotNull($draft);

        foreach (StepId::ordered() as $id) {
            $step = $draft->step($id);
            $this->assertNotNull($step->prompts->main, "step {$id->value} has no question");
            $this->assertNotSame('', trim((string) $step->prompts->main));
            $this->assertNotNull($step->doneWhen, "step {$id->value} does not say when it is done");
            $this->assertNotNull($step->maxGuideTurns, "step {$id->value} has no turn limit");
            $this->assertGreaterThan(0, $step->maxGuideTurns);
        }

        $this->assertSame([], $draft->publishProblems());
    }

    public function test_it_does_not_publish(): void
    {
        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();

        // Nothing reaches a user until an admin presses the button. A session
        // started now is still pinned to the baseline.
        $this->assertSame('draft', app(ProtocolVersionService::class)->draft()?->status);
        $this->assertNull(
            ProtocolVersion::query()->where('status', 'live')->first(),
            'the command must not publish',
        );
    }

    public function test_it_keeps_the_designs_own_copy_for_step_four(): void
    {
        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();

        $step = app(ProtocolVersionService::class)->draft()?->step(StepId::Remember);
        $this->assertSame('When did you first feel this way as a child? Take your time.', $step?->prompts->main);
        $this->assertSame('A specific memory, age under 12', $step?->doneWhen);
        $this->assertSame(4, $step?->maxGuideTurns);
    }

    /** Copy somebody wrote is theirs, so running this again does not take it. */
    public function test_it_never_overwrites_copy_that_is_already_there(): void
    {
        $versions = app(ProtocolVersionService::class);
        $mine = 'What is your part in this, as you see it?';

        $draft = $versions->openDraft()->withStepEdit(StepId::Responsibility, [
            'main' => $mine,
            'doneWhen' => 'They say something about themselves.',
            'maxGuideTurns' => 9,
        ]);
        $versions->store($draft);

        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();

        $step = $versions->draft()?->step(StepId::Responsibility);
        $this->assertSame($mine, $step?->prompts->main);
        $this->assertSame('They say something about themselves.', $step?->doneWhen);
        $this->assertSame(9, $step?->maxGuideTurns);
    }

    public function test_running_it_twice_changes_nothing_the_second_time(): void
    {
        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();
        $first = app(ProtocolVersionService::class)->draft();

        $this->artisan('stillpoint:draft-step-copy')
            ->expectsOutputToContain('Nothing was empty')
            ->assertSuccessful();

        $second = app(ProtocolVersionService::class)->draft();
        foreach (StepId::ordered() as $id) {
            $this->assertSame($first?->step($id)->prompts->main, $second?->step($id)->prompts->main);
        }
    }

    /** The baseline keeps saying nothing, because the designs still say nothing. */
    public function test_it_does_not_change_the_baseline_in_code(): void
    {
        $this->artisan('stillpoint:draft-step-copy')->assertSuccessful();

        $baseline = \App\Domain\ProtocolVersion::baseline();
        $this->assertNull($baseline->step(StepId::Responsibility)->prompts->main);
        $this->assertNull($baseline->step(StepId::Feel)->prompts->main);
        $this->assertNull($baseline->step(StepId::Forgive)->prompts->main);
    }
}
