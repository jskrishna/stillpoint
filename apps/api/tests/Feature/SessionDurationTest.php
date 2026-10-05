<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * How long a session lasted is start to the last thing said into it.
 *
 * It used to be start to the moment it ended, and ending is not something the
 * person is necessarily present for: `POST /sessions` ends whatever was open,
 * so somebody who answered two questions on Monday and came back on Friday had
 * Monday's session journalled on Friday. Measured before the fix: 5,760
 * minutes, shown to them in their own journal as "5760 min", in a product whose
 * home screen says a session takes about 10 to 15 minutes.
 */
final class SessionDurationTest extends TestCase
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

    private function answer(string $id, string $step, string $said): void
    {
        $this->postJson("/api/sessions/{$id}/turns", ['utterance' => $said, 'step' => $step])
            ->assertOk();
    }

    /** The bug this closes, stated as a test. */
    public function test_a_session_abandoned_on_monday_is_not_four_days_long(): void
    {
        $this->consentedUser();

        $monday = $this->postJson('/api/sessions')->json('id');
        $this->answer($monday, 'notice', 'My manager dismissed my work in front of the team');
        $this->answer($monday, 'responsibility', 'I went quiet instead of saying anything');

        // Everything about it happened on Monday. Only the ending is on Friday.
        $row = GuidedSession::query()->findOrFail($monday);
        $row->started_at = now()->subDays(4);
        $row->last_turn_at = now()->subDays(4)->addMinutes(11);
        $row->saveQuietly();

        // Friday: starting something new ends what was open, and journals it.
        $this->postJson('/api/sessions')->assertCreated();

        $entry = JournalEntry::query()->where('guided_session_id', $monday)->sole();
        $this->assertSame(11, $entry->duration_minutes);
        $this->assertTrue($entry->occurred_at->isSameDay(now()->subDays(4)));
    }

    public function test_a_session_finished_in_one_sitting_is_unchanged(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        $row = GuidedSession::query()->findOrFail($id);
        $row->started_at = now()->subMinutes(13);
        $row->saveQuietly();

        $this->answer($id, 'notice', 'My manager dismissed my work in front of the team');
        $this->postJson("/api/sessions/{$id}/stop")->assertOk();

        // The last answer and the end are moments apart, which is the whole
        // point: the common path reads the same as it always did.
        $entry = JournalEntry::query()->where('guided_session_id', $id)->sole();
        $this->assertSame(13, $entry->duration_minutes);
    }

    public function test_a_session_nothing_was_said_into_lasts_a_minute_not_a_week(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        $row = GuidedSession::query()->findOrFail($id);
        $row->started_at = now()->subDays(7);
        $row->saveQuietly();

        $this->postJson("/api/sessions/{$id}/stop")->assertOk();

        // There is no last turn, so there is no stretch of time to report. The
        // floor of one minute is the journal's: "0 min" reads like a bug.
        $entry = JournalEntry::query()->where('guided_session_id', $id)->sole();
        $this->assertSame(1, $entry->duration_minutes);
    }

    /**
     * A turn the guide refused still counts: the person was there and typing.
     * What it must not do is leave the duration measured from the end instead.
     */
    public function test_a_thin_answer_counts_as_having_been_there(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        $row = GuidedSession::query()->findOrFail($id);
        $row->started_at = now()->subMinutes(6);
        $row->saveQuietly();

        $this->answer($id, 'notice', 'dunno');
        $this->postJson("/api/sessions/{$id}/stop")->assertOk();

        $entry = JournalEntry::query()->where('guided_session_id', $id)->sole();
        $this->assertSame(6, $entry->duration_minutes);
    }

    /**
     * The console and the journal must not disagree about one session. They
     * read the same method, and this is what says so.
     */
    public function test_the_console_reports_the_same_minutes_as_the_journal(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');
        $this->answer($id, 'notice', 'My manager dismissed my work in front of the team');

        $row = GuidedSession::query()->findOrFail($id);
        $row->started_at = now()->subMinutes(9);
        $row->last_turn_at = now()->subMinutes(2);
        $row->saveQuietly();

        $this->postJson("/api/sessions/{$id}/stop")->assertOk();
        $entry = JournalEntry::query()->where('guided_session_id', $id)->sole();

        Sanctum::actingAs(User::factory()->admin()->create());
        $minutes = $this->getJson('/api/admin/overview')->json('recentSessions.0.minutes');

        $this->assertSame(7, $entry->duration_minutes);
        $this->assertSame($entry->duration_minutes, $minutes);
    }

    public function test_a_clock_that_went_backwards_does_not_make_a_negative_session(): void
    {
        $this->consentedUser();
        $id = $this->postJson('/api/sessions')->json('id');

        // Not a realistic session, but `last_turn_at` is written by whatever
        // server handled the turn, and two servers do not agree to the second.
        $row = GuidedSession::query()->findOrFail($id);
        $row->last_turn_at = $row->started_at->copy()->subMinutes(5);
        $row->saveQuietly();

        $this->assertSame(1, $row->activeMinutes());
    }

    /**
     * A session carried on weeks later does not lock its owner out.
     *
     * `journal_entries.duration_minutes` is an unsigned small integer, which
     * holds 65,535: forty-five and a half days. `activeMinutes()` is start to
     * last turn with no ceiling, and the home screen's primary button is
     * "Carry on where you left off" with no age limit on what it carries on.
     * So one answer, a gap of seven weeks and one more answer made a number
     * the column cannot hold. sqlite stores it without complaint, which is
     * why nothing here saw it. MySQL in strict mode refuses the row, and the
     * refusal is inside the transaction that ends the session: finishing it,
     * stopping it and starting any other session, quick ones included, all
     * journal that session first, so all three answered 500 from then on.
     *
     * The stored value is capped at what the column holds. That is the fix
     * for the lock-out and nothing more: what a session carried on after
     * seven weeks should be said to have lasted is the threshold question
     * `activeMinutes()` already says is a product decision.
     */
    public function test_a_session_resumed_weeks_later_still_fits_its_column(): void
    {
        $this->consentedUser();

        $id = $this->postJson('/api/sessions')->json('id');
        $this->answer($id, 'notice', 'My manager dismissed my work in front of the team');

        $row = GuidedSession::query()->findOrFail($id);
        $row->started_at = now()->subDays(50);
        $row->last_turn_at = now();
        $row->saveQuietly();

        // Not vacuous: this session really is longer than the column.
        $this->assertGreaterThan(65535, $row->activeMinutes());

        // Starting another one ends this one and journals it, which is the
        // request that answered 500.
        $this->postJson('/api/sessions', ['kind' => 'quick'])->assertCreated();

        $entry = JournalEntry::query()->where('guided_session_id', $id)->sole();
        $this->assertSame(JournalEntry::MAX_DURATION_MINUTES, $entry->duration_minutes);
    }

    public function test_the_cap_is_the_columns_own_ceiling(): void
    {
        // The other half: a cap that drifted from the column would either
        // overflow again or truncate for no reason. Read from the migration,
        // because sqlite will not say what a column can hold.
        $migration = (string) file_get_contents(
            database_path('migrations/2026_10_03_000003_create_journal_entries_table.php'),
        );

        $this->assertStringContainsString("unsignedSmallInteger('duration_minutes')", $migration);
        $this->assertSame(65535, JournalEntry::MAX_DURATION_MINUTES);
    }
}
