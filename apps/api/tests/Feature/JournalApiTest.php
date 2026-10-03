<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class JournalApiTest extends TestCase
{
    use RefreshDatabase;

    private function entry(User $user, array $overrides = []): JournalEntry
    {
        return JournalEntry::create([
            'user_id' => $user->id,
            'title' => 'Called out at work',
            'feelings' => ['ashamed'],
            'kind' => SessionKind::Full,
            'duration_minutes' => 14,
            'occurred_at' => now(),
            'reached_final_step' => true,
            ...$overrides,
        ]);
    }

    public function test_the_journal_requires_authentication(): void
    {
        $this->getJson('/api/journal')->assertUnauthorized();
        $this->getJson('/api/insights')->assertUnauthorized();
    }

    public function test_lists_only_the_users_own_entries(): void
    {
        $mine = User::factory()->create();
        $theirs = User::factory()->create();
        $this->entry($mine, ['title' => 'Mine']);
        $this->entry($theirs, ['title' => 'Theirs']);

        Sanctum::actingAs($mine);
        $response = $this->getJson('/api/journal')->assertOk();

        $titles = array_column($response->json(), 'title');
        $this->assertSame(['Mine'], $titles);
    }

    public function test_lists_newest_first(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['title' => 'Older', 'occurred_at' => now()->subDays(3)]);
        $this->entry($user, ['title' => 'Newer', 'occurred_at' => now()->subDay()]);

        Sanctum::actingAs($user);
        $titles = array_column($this->getJson('/api/journal')->json(), 'title');

        $this->assertSame(['Newer', 'Older'], $titles);
    }

    public function test_quotes_the_belief_as_the_list_summary(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['belief' => 'I’m not good enough.']);

        Sanctum::actingAs($user);
        $this->getJson('/api/journal')->assertJsonPath('0.summary', '“I’m not good enough.”');
    }

    public function test_labels_a_quick_session_with_no_belief(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['kind' => SessionKind::Quick]);

        Sanctum::actingAs($user);
        $this->getJson('/api/journal')->assertJsonPath('0.summary', 'Quick session');
    }

    public function test_cannot_read_someone_elses_entry(): void
    {
        $theirs = $this->entry(User::factory()->create());

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/journal/{$theirs->id}")->assertNotFound();
        $this->patchJson("/api/journal/{$theirs->id}", ['note' => 'mine now'])->assertNotFound();
        $this->deleteJson("/api/journal/{$theirs->id}")->assertNotFound();
    }

    public function test_a_note_is_saved_and_trimmed(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user);
        Sanctum::actingAs($user);

        $this->patchJson("/api/journal/{$entry->id}", ['note' => '  Felt lighter after this one.  '])
            ->assertOk()
            ->assertJsonPath('note', 'Felt lighter after this one.');
    }

    public function test_an_empty_note_is_removed_rather_than_stored(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user, ['note' => 'something']);
        Sanctum::actingAs($user);

        $this->patchJson("/api/journal/{$entry->id}", ['note' => '   '])
            ->assertOk()
            ->assertJsonPath('note', null);
    }

    public function test_sharing_can_be_turned_on_and_off_without_losing_the_note(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user);
        Sanctum::actingAs($user);

        $this->patchJson("/api/journal/{$entry->id}", ['note' => 'Felt lighter.']);
        $this->patchJson("/api/journal/{$entry->id}", ['sharedWithCoach' => true])
            ->assertJsonPath('sharedWithCoach', true)
            // Each field is applied on its own, so one cannot clobber the other.
            ->assertJsonPath('note', 'Felt lighter.');

        $this->patchJson("/api/journal/{$entry->id}", ['sharedWithCoach' => false])
            ->assertJsonPath('sharedWithCoach', false)
            ->assertJsonPath('note', 'Felt lighter.');
    }

    public function test_an_entry_is_private_until_shared(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user);
        Sanctum::actingAs($user);

        $this->getJson("/api/journal/{$entry->id}")->assertJsonPath('sharedWithCoach', false);
    }

    public function test_an_entry_can_be_deleted(): void
    {
        $user = User::factory()->create();
        $entry = $this->entry($user);
        Sanctum::actingAs($user);

        $this->deleteJson("/api/journal/{$entry->id}")->assertNoContent();
        $this->assertSame(0, JournalEntry::count());
    }

    public function test_insights_count_what_the_screen_shows(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['calmer_rating' => CalmerRating::Yes, 'reached_final_step' => true]);
        $this->entry($user, ['calmer_rating' => CalmerRating::Yes, 'reached_final_step' => false]);
        $this->entry($user, ['calmer_rating' => CalmerRating::ALittle, 'reached_final_step' => true]);
        $this->entry($user, ['calmer_rating' => CalmerRating::No, 'reached_final_step' => false]);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')
            ->assertOk()
            ->assertJsonPath('sessions', 4)
            ->assertJsonPath('reachedFinalStep', 2)
            // "A little" is not rounded up into "felt calmer".
            ->assertJsonPath('feltCalmer', 2)
            ->assertJsonPath('windowDays', 30);
    }

    public function test_insights_exclude_entries_outside_the_window(): void
    {
        $user = User::factory()->create();
        $this->entry($user);
        $this->entry($user, ['occurred_at' => now()->subDays(40)]);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')->assertJsonPath('sessions', 1);
    }

    public function test_insights_rank_the_feelings_chosen_most(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['feelings' => ['unworthy', 'rejected', 'anxious']]);
        $this->entry($user, ['feelings' => ['unworthy', 'rejected']]);
        $this->entry($user, ['feelings' => ['unworthy']]);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')
            ->assertJsonPath('feelings.0', ['id' => 'unworthy', 'label' => 'Unworthy', 'count' => 3])
            ->assertJsonPath('feelings.1', ['id' => 'rejected', 'label' => 'Rejected', 'count' => 2])
            ->assertJsonPath('feelings.2', ['id' => 'anxious', 'label' => 'Anxious', 'count' => 1]);
    }

    public function test_a_feeling_counts_once_per_session(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['feelings' => ['angry', 'angry', 'angry']]);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')->assertJsonPath('feelings.0.count', 1);
    }

    public function test_insights_find_the_belief_that_comes_back(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['belief' => 'I’m not good enough.', 'occurred_at' => now()->subDay()]);
        $this->entry($user, ['belief' => 'I’m not good enough', 'occurred_at' => now()->subDays(5)]);
        $this->entry($user, ['belief' => 'I don’t matter.', 'occurred_at' => now()->subDays(3)]);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')
            // Grouped ignoring punctuation; the most recent wording is kept.
            ->assertJsonPath('recurringBelief.belief', 'I’m not good enough.')
            ->assertJsonPath('recurringBelief.sessions', 2);
    }

    public function test_a_belief_said_once_is_not_a_pattern(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['belief' => 'I am alone']);

        Sanctum::actingAs($user);
        $this->getJson('/api/insights')->assertJsonPath('recurringBelief', null);
    }

    public function test_insights_are_empty_for_a_new_user(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/insights')
            ->assertJsonPath('sessions', 0)
            ->assertJsonPath('feelings', [])
            ->assertJsonPath('recurringBelief', null);
    }

    public function test_insights_never_include_another_users_entries(): void
    {
        $mine = User::factory()->create();
        $theirs = User::factory()->create();
        $this->entry($theirs, ['belief' => 'Not mine']);
        $this->entry($theirs, ['belief' => 'Not mine']);

        Sanctum::actingAs($mine);
        $this->getJson('/api/insights')
            ->assertJsonPath('sessions', 0)
            ->assertJsonPath('recurringBelief', null);
    }

    public function test_an_absurd_window_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/insights?windowDays=0')->assertJsonValidationErrors('windowDays');
        $this->getJson('/api/insights?windowDays=5000')->assertJsonValidationErrors('windowDays');
    }
}
