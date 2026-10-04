<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\ClientStatus;
use App\Domain\CoachSharing;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The setting that decides whether a coach sees a session.
 *
 * Both settings screens have offered three choices since the beginning and
 * they were decoration: `users.coach_sharing` was stored, validated and
 * printed back in the profile, and nothing in either language read it. "Share
 * every session" shared nothing, because `JournalEntry::fromSession()` wrote
 * `shared_with_coach => false` for everybody; "Never share" blocked nothing,
 * because the per-entry toggle took whatever the owner sent.
 *
 * A promise the server does not keep is the same problem whichever way it
 * points, and this one pointed both ways at once.
 */
final class CoachSharingSettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_share_every_session_shares_the_session(): void
    {
        $client = $this->consented(['coach_sharing' => CoachSharing::Always->value]);
        $this->pair(User::factory()->coach()->create(), $client);

        $this->finishASession($client);

        $this->assertTrue((bool) JournalEntry::query()->sole()->shared_with_coach);
    }

    public function test_sharing_every_session_shares_nothing_when_nobody_is_paired(): void
    {
        // "Share every session" is sharing it *with somebody*. Flagging
        // entries while nobody is paired would mean that accepting a coach
        // later hands them a backlog the user chose this setting before ever
        // seeing one.
        $client = $this->consented(['coach_sharing' => CoachSharing::Always->value]);

        $this->finishASession($client);

        $this->assertFalse((bool) JournalEntry::query()->sole()->shared_with_coach);
    }

    public function test_asking_each_time_shares_nothing_by_itself(): void
    {
        $client = $this->consented(['coach_sharing' => CoachSharing::AskEachTime->value]);
        $this->pair(User::factory()->coach()->create(), $client);

        $this->finishASession($client);

        $this->assertFalse((bool) JournalEntry::query()->sole()->shared_with_coach);
    }

    public function test_never_share_shares_nothing(): void
    {
        $client = $this->consented(['coach_sharing' => CoachSharing::Never->value]);
        $this->pair(User::factory()->coach()->create(), $client);

        $this->finishASession($client);

        $this->assertFalse((bool) JournalEntry::query()->sole()->shared_with_coach);
    }

    public function test_never_share_refuses_a_request_to_share_one_entry(): void
    {
        // Refused by the server, not hidden on a screen: a sharing rule a
        // client can skip is not a rule. Without this, `never` and
        // `ask_each_time` were one behaviour under two labels.
        $client = $this->consented(['coach_sharing' => CoachSharing::Never->value]);
        $entry = $this->entry($client);
        Sanctum::actingAs($client);

        $this->patchJson("/api/journal/{$entry->id}", ['sharedWithCoach' => true])
            ->assertStatus(409)
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'Never share'));

        $this->assertFalse((bool) $entry->refresh()->shared_with_coach);
    }

    public function test_never_share_still_lets_them_unshare_something(): void
    {
        // Somebody who has just chosen "Never share" is the last person to be
        // told they cannot unshare something.
        $client = $this->consented(['coach_sharing' => CoachSharing::Never->value]);
        $entry = $this->entry($client, ['shared_with_coach' => true]);
        Sanctum::actingAs($client);

        $this->patchJson("/api/journal/{$entry->id}", ['sharedWithCoach' => false])
            ->assertSuccessful();

        $this->assertFalse((bool) $entry->refresh()->shared_with_coach);
    }

    public function test_asking_each_time_allows_sharing_one_entry(): void
    {
        $client = $this->consented(['coach_sharing' => CoachSharing::AskEachTime->value]);
        $entry = $this->entry($client);
        Sanctum::actingAs($client);

        $this->patchJson("/api/journal/{$entry->id}", ['sharedWithCoach' => true])
            ->assertSuccessful()
            ->assertJsonPath('sharedWithCoach', true);
    }

    public function test_an_unknown_stored_value_asks_rather_than_shares(): void
    {
        // If the choice cannot be determined, the answer to "share this with
        // somebody else" is no.
        $this->assertSame(CoachSharing::AskEachTime, CoachSharing::fromStored(null));
        $this->assertSame(CoachSharing::AskEachTime, CoachSharing::fromStored('everything'));
        $this->assertFalse(CoachSharing::fromStored(null)->sharesNewEntry(true));
    }

    public function test_the_coach_actually_reads_a_session_shared_by_the_setting(): void
    {
        // The whole point, end to end: the setting is kept by the server and
        // the coach's own read honours it.
        $coach = User::factory()->coach()->create();
        $client = $this->consented(['coach_sharing' => CoachSharing::Always->value]);
        $this->pair($coach, $client);

        $this->finishASession($client);

        Sanctum::actingAs($coach);
        $sessions = $this->getJson("/api/coach/clients/{$client->id}")
            ->assertSuccessful()
            ->json('sharedSessions');

        $this->assertCount(1, $sessions);
    }

    /** @param array<string, mixed> $attributes */
    private function consented(array $attributes): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
            ...$attributes,
        ]);
    }

    private function pair(User $coach, User $client): void
    {
        $coach->clients()->attach($client->id, [
            'status' => ClientStatus::Active->value,
            'since' => now()->subMonths(3),
        ]);
    }

    /**
     * A session answered and stopped, which is what writes a journal entry.
     *
     * Stopped rather than carried to the end, because what is being checked is
     * the entry's sharing flag and not the six steps.
     */
    private function finishASession(User $client): void
    {
        Sanctum::actingAs($client);
        $id = $this->postJson('/api/sessions', ['kind' => SessionKind::Full->value])
            ->assertCreated()
            ->json('id');
        $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager called me out in front of everyone',
        ])->assertSuccessful();
        $this->postJson("/api/sessions/{$id}/stop")->assertSuccessful();
        $this->app['auth']->forgetGuards();
    }

    /** @param array<string, mixed> $attributes */
    private function entry(User $user, array $attributes = []): JournalEntry
    {
        return JournalEntry::create([
            'user_id' => $user->id,
            'title' => 'Called out at work',
            'feelings' => ['ashamed'],
            'kind' => SessionKind::Full,
            'duration_minutes' => 12,
            'occurred_at' => now(),
            'reached_final_step' => true,
            ...$attributes,
        ]);
    }
}
