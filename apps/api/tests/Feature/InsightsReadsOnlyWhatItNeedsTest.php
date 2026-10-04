<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\FeelingId;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\User;
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
 * **It is still not bounded**, and that is worth being plain about: naming the
 * columns moved the ceiling by roughly five times, it did not put one there.
 * A real bound is a decision — cap the rows and say on the screen that the
 * number is partial, or keep plaintext aggregate counters, which is the
 * encryption traded for a query. Neither is a refactor.
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
    }
}
