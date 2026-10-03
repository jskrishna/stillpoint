<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\StepId;
use App\Models\User;
use App\Services\ProtocolVersionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The guide asks a question at every step, over the wire.
 *
 * It did not. `ScriptedGuide` answers an advancing turn with nothing —
 * acknowledgement copy is not in the designs and inventing it would be
 * inventing the guide's voice — so `say` came back empty on every turn that
 * moved the step on. The client renders `say` and says "this step has no
 * question yet" when it is empty, so after the first answer the guide went
 * silent for the rest of the session, on every surface.
 *
 * It read as the known missing-copy gap rather than as a bug, which is why
 * nothing caught it: the end-to-end check walked all six steps and only ever
 * asserted the step counter.
 */
final class TheGuideKeepsTalkingTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A live version with copy on every step, which is what `stillpoint:draft-step-copy`
     * writes and an admin publishes. Without one, the baseline's nulls are the
     * right answer and silence is honest.
     */
    private function publishedProtocol(): void
    {
        $versions = app(ProtocolVersionService::class);
        $draft = $versions->openDraft();
        foreach (StepId::ordered() as $id) {
            $draft = $draft->withStepEdit($id, [
                'main' => "Question for {$id->value}?",
                'backups' => ["Backup for {$id->value}?"],
                'doneWhen' => 'The user answers.',
                'maxGuideTurns' => 3,
            ]);
        }
        $versions->store($draft);
        $versions->publishDraft();
    }

    private function consentedUser(): User
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    /** The bug this closes, stated as a test. */
    public function test_every_step_of_a_session_comes_back_with_a_question(): void
    {
        $this->publishedProtocol();
        $this->consentedUser();

        $start = $this->postJson('/api/sessions')->assertCreated();
        $id = $start->json('id');
        $this->assertSame('Question for notice?', $start->json('say'));

        $answers = [
            'My manager dismissed my work in front of the team',
            'I told myself I was not good enough',
            // Step 3 is answered by naming a feeling, not in prose.
            'angry',
            'Being talked over at school when I was nine',
            'I am not good enough',
            'I forgive myself for believing that',
        ];

        $asked = ['Question for notice?'];
        foreach ($answers as $i => $answer) {
            $step = $this->getJson("/api/sessions/{$id}")->json('step.id');
            $response = $this->postJson("/api/sessions/{$id}/turns", [
                'utterance' => $answer,
                'step' => $step,
            ])->assertOk();

            if ($response->json('ended') === true) {
                // The last turn finishes the session; the summary screen takes
                // over, so there is nothing left to ask.
                $this->assertSame('', $response->json('say'));
                $this->assertSame(5, $i, 'the session should end on the sixth answer');

                break;
            }

            $say = $response->json('say');
            $this->assertNotSame('', $say, "step {$response->json('step.ordinal')} said nothing");
            $asked[] = $say;
        }

        // One question per step, each one different, none of them empty.
        $this->assertCount(StepId::count(), $asked);
        $this->assertCount(StepId::count(), array_unique($asked));
    }

    /**
     * And the question survives a conflict. `GET /sessions/{id}` is what a
     * client asks after a 409, and it came back with no question at all — so
     * recovering from a dropped reply left the screen blank.
     */
    public function test_reading_one_session_back_carries_its_question(): void
    {
        $this->publishedProtocol();
        $this->consentedUser();

        $id = $this->postJson('/api/sessions')->json('id');
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();

        $this->getJson("/api/sessions/{$id}")
            ->assertOk()
            ->assertJsonPath('step.ordinal', 2)
            ->assertJsonPath('say', 'Question for responsibility?');
    }

    /** Resuming already did this, and must keep doing it. */
    public function test_resuming_carries_the_question_too(): void
    {
        $this->publishedProtocol();
        $this->consentedUser();

        $id = $this->postJson('/api/sessions')->json('id');
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();

        $this->getJson('/api/sessions/current')
            ->assertOk()
            ->assertJsonPath('id', $id)
            ->assertJsonPath('say', 'Question for responsibility?');
    }

    /**
     * With no published version the baseline applies, where three steps have
     * no copy. Silence is then the honest answer rather than a bug, and the
     * client says so in as many words.
     */
    public function test_a_step_with_no_copy_still_says_nothing(): void
    {
        $this->consentedUser();

        $id = $this->postJson('/api/sessions')->json('id');
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk()
            ->assertJsonPath('step.ordinal', 2)
            ->assertJsonPath('say', '');
    }
}
