<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\ProtocolVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Copy nobody published is not asked of anybody.
 *
 * `stillpoint:draft-step-copy` ends by saying "Nothing above reaches anybody
 * until an admin presses Publish", and publishing is meant to be a deliberate
 * act by a person. Neither held on a fresh deployment. A session started
 * before the first publish is pinned to the baseline, whose label is "1.0";
 * the first draft is stored as the row (1, 0, draft); and `forSession()`
 * looked a version up by its number alone. So the unpublished draft *was*
 * that session's version. Measured: with a draft written and nothing live, a
 * session's step 2 question was the draft's, and an admin editing step 3 in
 * the editor changed the question a running session was then asked.
 *
 * Every other test that takes a turn publishes first, and so does the demo
 * seeder, which is why nothing saw the one state every real deployment starts
 * in.
 *
 * The second half is the same rule from the other side. The opening line for
 * a resumed session, and for the read after a 409, was built from the *live*
 * version rather than the one the session is pinned to, so a publish did
 * change the question under somebody part-way through, on the two reads that
 * are not a turn.
 */
final class AnUnpublishedDraftReachesNobodyTest extends TestCase
{
    use RefreshDatabase;

    private const ANSWER = 'My manager said my work was careless in front of the whole team and I felt small.';

    private const EDITED = 'A DRAFT EDIT NOBODY PUBLISHED?';

    private function consented(): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
    }

    private function draftsStepTwoQuestion(): string
    {
        $draft = ProtocolVersion::query()->where('status', 'draft')->firstOrFail();

        return (string) $draft->steps['responsibility']['main'];
    }

    public function test_a_session_is_not_asked_a_draft_that_was_never_published(): void
    {
        $this->artisan('stillpoint:draft-step-copy');
        $this->assertSame(0, ProtocolVersion::query()->where('status', 'live')->count());
        // Not vacuous: the draft does have a question for step 2.
        $this->assertNotSame('', $this->draftsStepTwoQuestion());

        Sanctum::actingAs($this->consented());
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        $turn = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => self::ANSWER,
            'step' => 'notice',
        ])->assertOk()->assertJsonPath('step.id', 'responsibility');

        // The baseline has no question for step 2, and saying nothing is the
        // honest answer while nobody has published one.
        $this->assertNotSame($this->draftsStepTwoQuestion(), (string) $turn->json('say'));
        $this->assertSame('', (string) $turn->json('say'));
    }

    public function test_an_edit_to_the_draft_does_not_change_a_running_session(): void
    {
        $this->artisan('stillpoint:draft-step-copy');
        $user = $this->consented();
        Sanctum::actingAs($user);
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->patchJson('/api/admin/protocol-versions/draft/steps/responsibility', [
            'main' => self::EDITED,
        ])->assertSuccessful();

        Sanctum::actingAs($user);
        $turn = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => self::ANSWER,
            'step' => 'notice',
        ])->assertOk();

        $this->assertStringNotContainsString('NOBODY PUBLISHED', (string) $turn->json('say'));
        $this->assertStringNotContainsString(
            'NOBODY PUBLISHED',
            (string) $this->getJson("/api/sessions/{$id}")->assertOk()->json('say'),
        );
    }

    public function test_the_pause_wording_is_not_a_drafts_either(): void
    {
        $this->artisan('stillpoint:draft-step-copy');
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->patchJson('/api/admin/protocol-versions/draft/safety', [
            'pauseTitle' => 'AN UNPUBLISHED PAUSE TITLE',
        ])->assertSuccessful();

        Sanctum::actingAs($this->consented());
        $id = (string) $this->postJson('/api/sessions')->assertCreated()->json('id');
        $stopped = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I want to kill myself',
            'step' => 'notice',
        ])->assertOk();

        // The one piece of copy on the crisis screen, on the one screen where
        // an unreviewed sentence matters most.
        $this->assertNotSame('AN UNPUBLISHED PAUSE TITLE', $stopped->json('safety.title'));
        $this->assertNotSame('', (string) $stopped->json('safety.title'));
    }

    public function test_reading_a_session_back_asks_the_pinned_versions_question(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->artisan('stillpoint:draft-step-copy');
        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/protocol-versions/draft/publish')->assertSuccessful();

        $user = $this->consented();
        Sanctum::actingAs($user);
        $started = $this->postJson('/api/sessions')->assertCreated();
        $id = (string) $started->json('id');
        $asked = (string) $started->json('say');
        $this->assertNotSame('', $asked);

        // A new version goes live with a different first question.
        Sanctum::actingAs($admin);
        $this->postJson('/api/admin/protocol-versions/draft')->assertSuccessful();
        $this->patchJson('/api/admin/protocol-versions/draft/steps/notice', [
            'main' => self::EDITED,
        ])->assertSuccessful();
        $this->postJson('/api/admin/protocol-versions/draft/publish')->assertSuccessful();

        Sanctum::actingAs($user);
        // Resuming, and the read a client makes after a 409. Neither is a
        // turn, and both used to ask the live version's question.
        $this->assertSame($asked, $this->getJson('/api/sessions/current')->assertOk()->json('say'));
        $this->assertSame($asked, $this->getJson("/api/sessions/{$id}")->assertOk()->json('say'));

        // The control: a session started now does get the new one.
        $this->postJson("/api/sessions/{$id}/stop")->assertOk();
        $this->assertSame(self::EDITED, $this->postJson('/api/sessions')->assertCreated()->json('say'));
    }
}
