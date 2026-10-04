<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\ClientStatus;
use App\Domain\FeelingId;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A coach's request does not read a private entry's words.
 *
 * `CoachAttention` states the standard: a coach's request "does not read it
 * into memory at all, rather than reading it and not using it". The client
 * view fell short of it. `journalOf()` built the rendered `presented` block
 * for every entry before `CoachView` filtered, so a coach opening a client
 * decrypted the **title** and **note** of entries that client had kept
 * private — and fetched `forgiveness` and `memory` without reading either.
 *
 * Nothing leaked: `CoachView::sharedWith()` filters before the response is
 * built, and the response was correct throughout. What was wrong is that the
 * plaintext existed in the process at all.
 *
 * Measured at 2,000 entries with 200 of them shared: 470 ms and 84 MB of
 * process memory before, 158 ms and 28 MB after.
 *
 * The first test proves it by **ciphertext**, not by SQL, because that is the
 * property: a payload no key can read makes the decryption throw, so the
 * assertion is about whether the bytes were ever unwrapped. The third case is
 * the positive control, and without it the first two would pass just as well
 * against a method that read nothing at all.
 *
 * `belief` is deliberately still read for every entry — see `journalOf()` for
 * why, and the second test pins that it is, so the next person does not
 * "finish the job" and quietly make `CoachView::summarise()`'s own filter
 * unnecessary.
 */
final class CoachReadsOnlyWhatItNeedsTest extends TestCase
{
    use RefreshDatabase;

    private User $coach;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();

        $this->coach = User::factory()->create(['role' => 'coach']);
        $this->client = User::factory()->create();
        $this->coach->clients()->attach($this->client->id, [
            'status' => ClientStatus::Active->value,
            'since' => now()->subMonth(),
        ]);
    }

    private function entry(bool $shared): JournalEntry
    {
        return JournalEntry::create([
            'user_id' => $this->client->id,
            'occurred_at' => now()->subDays($shared ? 1 : 2),
            'kind' => SessionKind::Quick,
            'duration_minutes' => 11,
            'title' => $shared ? 'A shared afternoon' : 'One I kept to myself',
            'what_happened' => 'They said something and I could not let it go.',
            'belief' => 'I am not enough.',
            'forgiveness' => 'I am willing to see this differently.',
            'note' => 'Worth coming back to.',
            'feelings' => [FeelingId::Angry->value, FeelingId::Sad->value],
            'calmer_rating' => CalmerRating::Yes,
            'reached_final_step' => true,
            'shared_with_coach' => $shared,
        ]);
    }

    /** A payload no configured key can read. */
    private function corrupt(JournalEntry $entry, string $column): void
    {
        DB::table('journal_entries')->where('id', $entry->id)->update([$column => 'not-a-ciphertext']);
    }

    private function readAsCoach(): void
    {
        $this->actingAs($this->coach)
            ->getJson("/api/coach/clients/{$this->client->id}")
            ->assertOk();
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function privateColumns(): iterable
    {
        yield 'title' => ['title'];
        yield 'note' => ['note'];
    }

    #[DataProvider('privateColumns')]
    public function test_a_private_entrys_text_is_never_decrypted(string $column): void
    {
        $this->entry(shared: true);
        $this->corrupt($this->entry(shared: false), $column);

        // Unreadable, and the request does not care, because it never unwraps
        // it. Before `presented` became a closure this threw DecryptException.
        $this->readAsCoach();
    }

    /**
     * The positive control, without which the two above prove nothing.
     *
     * A shared entry's title is on the coach's screen, so it has to be read —
     * and a method that read no titles at all would pass the cases above.
     */
    public function test_but_a_shared_entrys_title_is_read(): void
    {
        $this->corrupt($this->entry(shared: true), 'title');

        $this->expectException(DecryptException::class);
        $this->withoutExceptionHandling()
            ->actingAs($this->coach)
            ->getJson("/api/coach/clients/{$this->client->id}");
    }

    /**
     * And `belief` is read for every entry, which is the one trade.
     *
     * `CoachView::summarise()` filters to the shared set itself and computes
     * the recurring belief from it, and the property worth keeping is that it
     * stays correct even when handed everything. Nulling a private belief in
     * the caller would make that filter unnecessary — the "forgotten `where`
     * is silent" failure `CoachView` exists to prevent. So this asserts the
     * cost rather than hiding it.
     */
    public function test_a_private_beliefs_is_read_deliberately(): void
    {
        $this->entry(shared: true);
        $this->corrupt($this->entry(shared: false), 'belief');

        $this->expectException(DecryptException::class);
        $this->withoutExceptionHandling()
            ->actingAs($this->coach)
            ->getJson("/api/coach/clients/{$this->client->id}");
    }

    /** And the two columns nothing in this path reads are not even fetched. */
    public function test_it_does_not_fetch_the_columns_it_never_reads(): void
    {
        $this->entry(shared: true);
        $this->entry(shared: false);

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $this->readAsCoach();

        $reads = array_values(array_filter(
            $queries,
            static fn (string $sql) => str_contains($sql, 'journal_entries')
                && str_starts_with(strtolower($sql), 'select'),
        ));

        $this->assertNotSame([], $reads, 'nothing read the journal, so this asserts nothing');

        foreach ($reads as $sql) {
            $this->assertStringNotContainsString('select *', $sql, "selected everything: {$sql}");

            foreach (['forgiveness', 'memory', 'what_happened'] as $column) {
                $this->assertStringNotContainsString("\"{$column}\"", $sql, "fetched {$column}: {$sql}");
                $this->assertStringNotContainsString("`{$column}`", $sql, "fetched {$column}: {$sql}");
            }
        }
    }

    /** The response is unchanged, which is the half none of the above shows. */
    public function test_the_coach_still_sees_the_shared_session(): void
    {
        $this->entry(shared: true);
        $this->entry(shared: false);

        $view = $this->actingAs($this->coach)
            ->getJson("/api/coach/clients/{$this->client->id}")
            ->assertOk();

        $view->assertJsonPath('sharedCount', 1);
        $view->assertJsonCount(1, 'sharedSessions');
        $view->assertJsonPath('sharedSessions.0.title', 'A shared afternoon');
        $view->assertJsonPath('sharedSessions.0.note', 'Worth coming back to.');
        $this->assertStringNotContainsString(
            'One I kept to myself',
            $view->getContent() ?: '',
        );
    }
}
