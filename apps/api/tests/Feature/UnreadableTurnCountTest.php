<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Turns the safety screen could not read.
 *
 * The screen has phrases in Latin and Devanagari and in nothing else, so an
 * utterance in Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia,
 * Gurmukhi or Urdu is not screened at all. It used to come back `none`, which
 * is the same answer an ordinary bad day gets.
 *
 * Counting it is the whole intervention — not flagging, not stopping. These
 * assert both halves: the count moves, and nothing else does.
 */
final class UnreadableTurnCountTest extends TestCase
{
    use RefreshDatabase;

    private function consentedUser(): User
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function newSession(): string
    {
        return (string) $this->postJson('/api/sessions')->assertCreated()->json('id');
    }

    public function test_a_turn_in_a_script_the_screen_cannot_read_is_counted(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'আমার খুব মন খারাপ'])
            ->assertOk();

        $this->assertSame(1, GuidedSession::query()->findOrFail($id)->unreadable_turns);
    }

    public function test_counting_it_is_all_that_happens(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        // Not flagged, not stopped, and the session carries on. A Tamil
        // speaker whose every turn stopped the session would have no product.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'நான் மிகவும் வருத்தமாக இருக்கிறேன்'])
            ->assertOk()
            ->assertJsonPath('endReason', null);

        $this->assertSame(0, SafetyFlag::query()->count());
        $this->assertNull(GuidedSession::query()->findOrFail($id)->ended_at);
    }

    public function test_a_readable_turn_does_not_move_the_count(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        foreach ([
            'My manager dismissed my work in front of the team',
            'aaj mera manager bahut bura bola',
        ] as $utterance) {
            $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $utterance])->assertOk();
        }

        $this->assertSame(0, GuidedSession::query()->findOrFail($id)->unreadable_turns);
    }

    public function test_an_unreadable_word_does_not_hold_back_a_safety_stop(): void
    {
        $this->consentedUser();
        $id = $this->newSession();

        // The dangerous reading of this feature is "could not read it all, so
        // stand down". The readable part says enough.
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'I want to die, মা'])
            ->assertOk()
            ->assertJsonPath('endReason', 'safety_stop');

        $session = GuidedSession::query()->findOrFail($id);
        $this->assertSame(1, $session->unreadable_turns);
        $this->assertSame(1, SafetyFlag::query()->count());
    }

    public function test_the_overview_reports_it(): void
    {
        $user = $this->consentedUser();
        $id = $this->newSession();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'আমার খুব মন খারাপ'])->assertOk();
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => 'ನನಗೆ ಬೇಸರವಾಗಿದೆ'])->assertOk();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('unreadableSessions', 1)
            ->assertJsonPath('unreadableTurns', 2);

        // And it is a figure about the screen, not about the user: no handle,
        // no address, nothing of what was said.
        $body = $this->getJson('/api/admin/overview')->content();
        $this->assertStringNotContainsString($user->email, $body);
        $this->assertStringNotContainsString('মন খারাপ', $body);
    }

    public function test_an_install_where_it_never_happens_reports_zero(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('unreadableSessions', 0)
            ->assertJsonPath('unreadableTurns', 0);
    }
}
