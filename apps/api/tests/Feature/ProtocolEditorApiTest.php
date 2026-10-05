<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\StepId;
use App\Models\ProtocolVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The step-prompt editor.
 *
 * The rule worth testing is the refusal: a draft missing a step's copy cannot
 * be published, and the check is on the server where a screen cannot skip it. A
 * half-written protocol reaching a session is the failure the version model
 * exists to prevent.
 */
final class ProtocolEditorApiTest extends TestCase
{
    use RefreshDatabase;

    /** Everything the baseline leaves null, which is most of it. */
    private const MISSING_STEPS = ['responsibility', 'feel', 'forgive'];

    public function test_the_editor_requires_an_admin(): void
    {
        $this->getJson('/api/admin/protocol-versions')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/admin/protocol-versions')->assertNotFound();
        $this->postJson('/api/admin/protocol-versions/draft/publish')->assertNotFound();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs(User::factory()->coach()->create());
        $this->getJson('/api/admin/protocol-versions')->assertNotFound();
    }

    public function test_with_nothing_published_the_live_version_is_the_baseline(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/admin/protocol-versions')
            ->assertOk()
            ->assertJsonPath('live.label', '1.0')
            ->assertJsonPath('draft', null)
            // The designs specify step 1's question and step 4 in full.
            ->assertJsonPath('live.steps.0.main', 'You’re upset, and that’s okay. What happened?')
            ->assertJsonPath('live.steps.3.doneWhen', 'A specific memory, age under 12');
    }

    public function test_the_baseline_reports_the_steps_the_designs_never_specified(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $live = $this->getJson('/api/admin/protocol-versions')->json('live');

        $this->assertFalse($live['publishable']);
        $this->assertFalse($live['runnable']);

        // Null, not invented. The copy lives in the PRD.
        foreach ($live['steps'] as $step) {
            if (in_array($step['id'], self::MISSING_STEPS, true)) {
                $this->assertNull($step['main'], "{$step['id']} should have no main question");
                $this->assertFalse($step['complete']);
            }
        }

        $named = array_unique(array_filter(array_column($live['problems'], 'stepId')));
        foreach (self::MISSING_STEPS as $id) {
            $this->assertContains($id, $named);
        }
    }

    public function test_opening_a_draft_twice_opens_one_draft(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $first = $this->postJson('/api/admin/protocol-versions/draft')->assertOk()->json('label');
        $second = $this->postJson('/api/admin/protocol-versions/draft')->assertOk()->json('label');

        $this->assertSame($first, $second);
        $this->assertSame(1, ProtocolVersion::query()->where('status', 'draft')->count());
    }

    public function test_a_step_edit_is_saved(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->patchJson('/api/admin/protocol-versions/draft/steps/feel', [
            'main' => 'Which of these are you feeling?',
            'doneWhen' => 'At least one feeling chosen',
            'maxGuideTurns' => 3,
        ])->assertOk()->assertJsonPath('steps.2.main', 'Which of these are you feeling?');

        // Still there on a fresh read, so it is in the row and not in a reply.
        $this->getJson('/api/admin/protocol-versions')
            ->assertJsonPath('draft.steps.2.main', 'Which of these are you feeling?')
            ->assertJsonPath('draft.steps.2.maxGuideTurns', 3)
            ->assertJsonPath('draft.steps.2.complete', true);
    }

    public function test_a_step_can_be_cleared_back_to_null(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->patchJson('/api/admin/protocol-versions/draft/steps/feel', ['main' => 'Placeholder']);
        $this->patchJson('/api/admin/protocol-versions/draft/steps/feel', ['main' => null])
            ->assertOk()
            ->assertJsonPath('steps.2.main', null);
    }

    public function test_an_unknown_step_is_not_found(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->patchJson('/api/admin/protocol-versions/draft/steps/pondering', ['main' => 'x'])
            ->assertNotFound();
    }

    public function test_a_turn_limit_of_zero_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->patchJson('/api/admin/protocol-versions/draft/steps/feel', ['maxGuideTurns' => 0])
            ->assertUnprocessable();
    }

    public function test_an_incomplete_draft_cannot_be_published(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->postJson('/api/admin/protocol-versions/draft')->assertOk();

        $response = $this->postJson('/api/admin/protocol-versions/draft/publish')
            ->assertUnprocessable();

        $this->assertNotEmpty($response->json('problems'));
        // Nothing went live.
        $this->assertSame(0, ProtocolVersion::query()->where('status', 'live')->count());
    }

    public function test_a_complete_draft_publishes_and_becomes_live(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->fillEveryStep();

        $this->postJson('/api/admin/protocol-versions/draft/publish')
            ->assertOk()
            ->assertJsonPath('status', 'live')
            ->assertJsonPath('publishable', false)
            ->assertJsonPath('runnable', true);

        $this->getJson('/api/admin/protocol-versions')
            ->assertJsonPath('live.status', 'live')
            ->assertJsonPath('draft', null);
    }

    public function test_publishing_again_archives_the_previous_live_version(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->fillEveryStep();
        $firstLabel = $this->postJson('/api/admin/protocol-versions/draft/publish')->json('label');

        // The next draft carries the published copy forward, so it is already
        // complete and can go live after one edit.
        $this->patchJson('/api/admin/protocol-versions/draft/steps/notice', [
            'main' => 'What has happened?',
        ])->assertOk();
        $secondLabel = $this->postJson('/api/admin/protocol-versions/draft/publish')
            ->assertOk()
            ->json('label');

        $this->assertNotSame($firstLabel, $secondLabel);
        // Exactly one live version at a time: two would mean two sets of
        // questions in flight.
        $this->assertSame(1, ProtocolVersion::query()->where('status', 'live')->count());
        $this->assertSame(1, ProtocolVersion::query()->where('status', 'archived')->count());
    }

    public function test_a_published_version_is_not_edited_in_place(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->fillEveryStep();
        $live = $this->postJson('/api/admin/protocol-versions/draft/publish')->json();

        $this->patchJson('/api/admin/protocol-versions/draft/steps/notice', [
            'main' => 'Changed after publishing',
        ])->assertOk();

        // The edit went to a new draft; what is live still says what it said.
        $this->getJson('/api/admin/protocol-versions')
            ->assertJsonPath('live.label', $live['label'])
            ->assertJsonPath('live.steps.0.main', $live['steps'][0]['main'])
            ->assertJsonPath('draft.steps.0.main', 'Changed after publishing');
    }

    public function test_the_safety_pause_wording_can_be_edited_but_not_emptied(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->patchJson('/api/admin/protocol-versions/draft/safety', [
            'pauseTitle' => 'Let’s pause here',
        ])->assertOk()->assertJsonPath('pauseTitle', 'Let’s pause here');

        // Emptying it would publish a safety screen with no words on it.
        $this->patchJson('/api/admin/protocol-versions/draft/safety', ['pauseTitle' => ''])
            ->assertUnprocessable();
        $this->patchJson('/api/admin/protocol-versions/draft/safety', ['pauseBody' => '   '])
            ->assertUnprocessable();

        // And the earlier edit survived both refusals.
        $this->getJson('/api/admin/protocol-versions')
            ->assertJsonPath('draft.pauseTitle', 'Let’s pause here');
    }

    /** Fills every step so the draft is publishable. */
    public function test_a_turn_limit_sent_as_a_string_is_saved_as_a_number(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        // What a form post sends. The rule accepted it and the save threw.
        $this->patchJson('/api/admin/protocol-versions/draft/steps/notice', ['maxGuideTurns' => '3'])
            ->assertSuccessful()
            ->assertJsonPath('steps.0.maxGuideTurns', 3);
    }

    private function fillEveryStep(): void
    {
        $this->postJson('/api/admin/protocol-versions/draft')->assertOk();

        foreach (StepId::ordered() as $step) {
            $this->patchJson("/api/admin/protocol-versions/draft/steps/{$step->value}", [
                'main' => "Question for {$step->name()}?",
                'doneWhen' => 'The user answered.',
                'maxGuideTurns' => 3,
            ])->assertOk();
        }
    }

    /**
     * An edit reads the draft and writes it under one lock.
     *
     * The race this closes needs two connections, which sqlite does not have,
     * so what is asserted is the structure, with comments stripped so prose
     * about the mechanism cannot stand in for it: neither edit route writes a
     * version it read in a separate step, and the method they call instead
     * does both inside a transaction.
     */
    public function test_an_edit_does_not_write_a_draft_it_read_before_a_publish_could_land(): void
    {
        $strip = fn (string $php): string => (string) preg_replace('#/\*.*?\*/|//[^\n]*#s', '', $php);

        $controller = $strip((string) file_get_contents(
            app_path('Http/Controllers/Api/ProtocolVersionController.php'),
        ));
        $this->assertSame(2, substr_count($controller, '->editDraft('));
        $this->assertStringNotContainsString('->store(', $controller);
        $this->assertStringNotContainsString('->openDraft();'."\n".'        $saved', $controller);

        $service = $strip((string) file_get_contents(app_path('Services/ProtocolVersionService.php')));
        $this->assertMatchesRegularExpression(
            '/function editDraft\(.*?\{\s*return DB::transaction\(.*?openDraft\(\)/s',
            $service,
        );
    }
}
