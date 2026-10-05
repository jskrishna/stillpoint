<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\FeelingId;
use App\Domain\Insights;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\User;
use App\Services\InsightsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Insights counts feelings, and must not fetch the words.
 *
 * `CoachAttention` already has this rule — it selects two timestamp columns
 * rather than the row, "the difference between a rule and a habit". This read
 * was the habit: six encrypted columns pulled and two of them read, over every
 * journal row in the window.
 *
 * The comment on the service said "the window keeps the set small enough for
 * that to be fine", and the window bounds days rather than sessions. A quick
 * session is always allowed, deliberately, so the number of journal rows
 * inside 30 days has no ceiling.
 *
 * Measured, with a full session's text in each row:
 *
 *   2,000 entries   55.5 MB of ciphertext fetched, 494 KB of it read
 *                   199 ms and 76 MB of process memory, against
 *                   128 ms and 12 MB once the columns are named
 *   4,000 entries   exhausted `deploy/php.ini`'s own memory_limit=256M and
 *                   died inside Laravel's Connection, fetching — a 500 for
 *                   whoever used the product most
 *  20,000 entries   1.15 s and 104 MB with the columns named
 *
 * **It is bounded now**, which that list used to end by saying it was not.
 * Measured all the way to the failure rather than extrapolated, peak process
 * memory with the columns named against `deploy/php.ini`'s own
 * `memory_limit=256M` (about 24 MB of that is bootstrap):
 *
 *   2,000 → 34 MB    5,000 → 50 MB    10,000 → 76 MB    20,000 → 130 MB
 *  45,000 → 262 MB, which does not fit: the request dies inside
 *          `Illuminate\Collections\Collection`, fetching. About 5.3 MB a
 *          thousand entries, so the limit is reached at roughly **44,000
 *          entries inside the window**.
 *
 * Which says the failure was never going to reach a person: 44,000 entries in
 * thirty days is about 1,450 sessions a day, and the read is per-user so the
 * cost falls on that one account's own screen. `InsightsService::MAX_ROWS` is
 * 5,000 — sixteen times a heavy user's thirty days at ten sessions a day — so
 * the ceiling is real and no account anybody is using meets it. The other way
 * of bounding it, plaintext aggregate counters, is the encryption traded for a
 * query, which this repository refuses elsewhere.
 *
 * This asserts on the SQL because there is nothing in the response to see it
 * by: the version that fetched every column printed identical numbers.
 */
final class InsightsReadsOnlyWhatItNeedsTest extends TestCase
{
    use RefreshDatabase;

    /** The columns holding the user's own words about what hurt them. */
    private const WORDS = ['what_happened', 'forgiveness', 'memory', 'note', 'title'];

    private function entry(User $user, array $attributes = []): JournalEntry
    {
        return JournalEntry::create(array_merge([
            'user_id' => $user->id,
            'occurred_at' => now()->subDays(2),
            'kind' => SessionKind::Quick,
            'duration_minutes' => 11,
            'title' => 'A hard afternoon',
            'what_happened' => 'They said something and I could not let it go.',
            'belief' => 'I am not enough.',
            'forgiveness' => 'I am willing to see this differently.',
            'note' => 'Worth coming back to.',
            'feelings' => [FeelingId::Angry->value, FeelingId::Sad->value],
            'calmer_rating' => CalmerRating::Yes,
            'reached_final_step' => true,
            'shared_with_coach' => false,
        ], $attributes));
    }

    public function test_it_does_not_fetch_the_columns_holding_the_users_words(): void
    {
        $user = User::factory()->create();
        $this->entry($user);
        $this->entry($user, ['belief' => 'I am not enough.', 'occurred_at' => now()->subDay()]);

        Sanctum::actingAs($user);

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $this->getJson('/api/insights')->assertOk();

        $reads = array_values(array_filter(
            $queries,
            static fn (string $sql) => str_contains($sql, 'journal_entries')
                && str_starts_with(strtolower($sql), 'select'),
        ));

        $this->assertNotSame([], $reads, 'nothing read the journal, so this asserts nothing');

        foreach ($reads as $sql) {
            $this->assertStringNotContainsString('select *', $sql, "selected everything: {$sql}");

            foreach (self::WORDS as $column) {
                $this->assertStringNotContainsString("\"{$column}\"", $sql, "fetched {$column}: {$sql}");
                $this->assertStringNotContainsString("`{$column}`", $sql, "fetched {$column}: {$sql}");
            }
        }
    }

    /**
     * And the numbers are unchanged, which is the half the SQL cannot show.
     *
     * A `select` that dropped a column the reduction reads would make this
     * screen quietly wrong rather than fail — `feelings` missing reads as a
     * session with no feelings, `calmer_rating` missing as a session that did
     * not say. So the counts are asserted beside the columns.
     */
    public function test_the_numbers_are_the_same_as_before(): void
    {
        $user = User::factory()->create();
        $this->entry($user);
        $this->entry($user, ['occurred_at' => now()->subDay()]);

        Sanctum::actingAs($user);
        $insights = $this->getJson('/api/insights')->assertOk();

        $insights->assertJsonPath('sessions', 2);
        // Both entries name angry and sad, once each per session.
        $this->assertSame(
            [
                ['id' => 'angry', 'label' => 'Angry', 'count' => 2],
                ['id' => 'sad', 'label' => 'Sad', 'count' => 2],
            ],
            $insights->json('feelings'),
        );
        // Both said yes and both reached step 6, and the belief was said twice,
        // which is the recurring threshold.
        $insights->assertJsonPath('feltCalmer', 2);
        $insights->assertJsonPath('reachedFinalStep', 2);
        $insights->assertJsonPath('recurringBelief.belief', 'I am not enough.');
        $insights->assertJsonPath('recurringBelief.sessions', 2);
        // And it read everything in the window, which is what every real
        // account's answer is.
        $insights->assertJsonPath('partial', false);
    }

    /**
     * The ceiling is on the query, not applied after everything arrives.
     *
     * Asserted on the SQL for the same reason as the columns: a version that
     * fetched every row and then sliced in PHP would print identical numbers
     * and have exactly the memory profile this exists to prevent. One row more
     * than the ceiling, so truncation is visible without a second count.
     */
    public function test_the_read_asks_for_no_more_rows_than_it_will_use(): void
    {
        $user = User::factory()->create();
        $this->entry($user);

        Sanctum::actingAs($user);

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $this->getJson('/api/insights')->assertOk();

        $reads = array_values(array_filter(
            $queries,
            static fn (string $sql) => str_contains($sql, 'journal_entries')
                && str_starts_with(strtolower($sql), 'select'),
        ));

        $this->assertNotSame([], $reads, 'nothing read the journal, so this asserts nothing');

        $limit = InsightsService::MAX_ROWS + 1;
        foreach ($reads as $sql) {
            $this->assertStringContainsString("limit {$limit}", strtolower($sql), "unbounded: {$sql}");
            // Newest first, and `id` after `occurred_at`: that column is not
            // unique, and a tie with no tiebreaker makes which rows survive
            // the cut a property of the storage engine.
            $this->assertStringContainsString('order by "occurred_at" desc, "id" desc', $sql, $sql);
        }
    }

    /**
     * And a window with more entries than the ceiling says so, and keeps the
     * recent ones.
     *
     * Through the service with its `$maxRows` seam rather than through the
     * API, because reaching this branch for real takes five thousand and one
     * journal rows and a test that seeds those is a test nobody runs. What the
     * seam cannot prove is the number itself; the measurement above is what
     * that rests on.
     */
    public function test_a_window_larger_than_the_ceiling_is_reported_as_partial(): void
    {
        $user = User::factory()->create();
        $this->entry($user, ['occurred_at' => now()->subDays(3), 'feelings' => [FeelingId::Ashamed->value]]);
        $this->entry($user, ['occurred_at' => now()->subDays(2), 'feelings' => [FeelingId::Angry->value]]);
        $this->entry($user, ['occurred_at' => now()->subDay(), 'feelings' => [FeelingId::Angry->value]]);

        $read = app(InsightsService::class)->forUser($user, Insights::DEFAULT_WINDOW_DAYS, null, 2);

        $this->assertTrue($read->partial, 'three entries under a ceiling of two is partial');
        $this->assertSame(2, $read->insights->sessions);
        // The two most recent, so the feeling named only by the oldest is
        // absent and the one named by both newer entries counts twice.
        $this->assertSame(
            [['id' => 'angry', 'label' => 'Angry', 'count' => 2]],
            array_map(
                fn (array $f) => ['id' => $f['id']->value, 'label' => $f['label'], 'count' => $f['count']],
                $read->insights->feelings,
            ),
        );
    }

    /** And it is not partial when the window fits, which is the control. */
    public function test_a_window_inside_the_ceiling_is_not_partial(): void
    {
        $user = User::factory()->create();
        $this->entry($user);
        $this->entry($user, ['occurred_at' => now()->subDay()]);

        $read = app(InsightsService::class)->forUser($user, Insights::DEFAULT_WINDOW_DAYS, null, 2);

        $this->assertFalse($read->partial, 'two entries under a ceiling of two is everything');
        $this->assertSame(2, $read->insights->sessions);
    }
}
