<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\ProtocolVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Publishing must not change the questions under somebody part-way through.
 *
 * `CLAUDE.md` gives this as the reason a session is pinned to the version it
 * started on, and nothing asserted it: no test in the suite published a
 * version and then took a turn, so the two halves of the rule were only ever
 * exercised apart. The behaviour was right — measured before this was written,
 * a session at step 1 advanced to a step 2 question from its own version while
 * a different one was live — and what was missing was the thing that keeps it
 * right.
 *
 * It matters for the obvious reason and one less obvious. Somebody upset,
 * answering six questions, must not have the questions move; and a session's
 * recorded answers are only interpretable against the version that asked
 * them, so a session whose version changed half way through has a journal
 * entry that no version explains.
 *
 * The third test is the control and the test is worth little without it: a
 * product that ignored published versions altogether — always falling back to
 * the baseline — would pass the first two and be badly broken.
 */
final class PublishingDoesNotChangeALiveSessionTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_QUESTION = 'A QUESTION PUBLISHED MID-SESSION?';

    private const ANSWER = 'My manager said my work was careless in front of the whole team and I felt small.';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);

        // A live version to pin to. `stillpoint:draft-step-copy` writes the
        // draft and publishing is a deliberate act by a person, so a fresh
        // database has no live version at all — which is why this says so
        // rather than assuming one.
        $this->artisan('stillpoint:draft-step-copy');
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/admin/protocol-versions/draft/publish')->assertSuccessful();
    }

    private function consented(): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
    }

    /** Opens a draft, rewrites step 2's question, and publishes it. */
    private function publishANewStepTwoQuestion(): void
    {
        Sanctum::actingAs($this->admin);
        $this->postJson('/api/admin/protocol-versions/draft')->assertSuccessful();
        $this->patchJson('/api/admin/protocol-versions/draft/steps/responsibility', [
            'main' => self::NEW_QUESTION,
        ])->assertSuccessful();
        $this->postJson('/api/admin/protocol-versions/draft/publish')->assertSuccessful();
    }

    private function liveLabel(): string
    {
        $live = ProtocolVersion::query()->where('status', 'live')->latest('published_at')->firstOrFail();

        return "{$live->major}.{$live->minor}";
    }

    public function test_a_session_keeps_the_version_it_started_on(): void
    {
        $user = $this->consented();
        Sanctum::actingAs($user);
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        $pinned = GuidedSession::query()->findOrFail($id)->protocol_version;
        $this->assertSame($this->liveLabel(), $pinned, 'the session did not start on the live version');

        $before = $this->liveLabel();
        $this->publishANewStepTwoQuestion();

        // Not vacuous: publishing really did move the live version.
        $this->assertNotSame($before, $this->liveLabel());

        $this->assertSame(
            $pinned,
            GuidedSession::query()->findOrFail($id)->protocol_version,
            'publishing moved a running session onto another version',
        );
    }

    public function test_the_question_it_asks_next_is_its_own_versions(): void
    {
        $user = $this->consented();
        Sanctum::actingAs($user);
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        $this->publishANewStepTwoQuestion();

        Sanctum::actingAs($user);
        $turn = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => self::ANSWER,
            'step' => 'notice',
        ])->assertOk();

        // It advanced, so there really was a question to get wrong.
        $turn->assertJsonPath('step.id', 'responsibility');

        $asked = (string) $turn->json('say');
        $this->assertNotSame('', $asked, 'the guide said nothing, so this asserts nothing');
        $this->assertNotSame(self::NEW_QUESTION, $asked);
        $this->assertStringNotContainsString('MID-SESSION', $asked);
    }

    /**
     * The control, without which the two above prove nothing.
     *
     * A product that ignored published versions and always fell back to the
     * baseline would pass both of them. A session started *after* the publish
     * has to get the new question.
     */
    public function test_but_a_session_started_afterwards_gets_the_new_question(): void
    {
        $this->publishANewStepTwoQuestion();

        $user = $this->consented();
        Sanctum::actingAs($user);
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        $turn = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => self::ANSWER,
            'step' => 'notice',
        ])->assertOk();

        $turn->assertJsonPath('step.id', 'responsibility');
        $turn->assertJsonPath('say', self::NEW_QUESTION);
    }
}
