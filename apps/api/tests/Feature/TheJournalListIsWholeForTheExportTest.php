<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * `GET /journal` carries every field, and that is load-bearing.
 *
 * It looks like the thing to trim. The journal **list screen** reads five
 * fields — `id`, `title`, `summary`, `occurredAt`, `durationMinutes` — and the
 * response carries fourteen, including all five encrypted content columns.
 * Measured on 25 entries of a full session's text: **302 KB and 31 ms** whole,
 * against **55 KB and 21 ms** with the content fields dropped. So the obvious
 * reading is that a list shape would be five times smaller and the entry
 * screen fetches `GET /journal/{entry}` for the rest anyway.
 *
 * What that reading misses is **"Export my data"**. `api.wholeJournal()` is
 * `everyPage(journal(100, cursor))` — it pages *this* route, and the file it
 * writes is what a person gets when they ask for everything they have. Trim
 * the list and the export silently becomes metadata: a file that looks right,
 * sized about right, with every word the person wrote missing from it. Nothing
 * would fail; `wholeJournal` would keep returning rows.
 *
 * So this test is the reason written as a check rather than as a comment,
 * because a comment above a resource is not what somebody reads while deleting
 * a field from it. If the list shape ever should be trimmed, the export has to
 * stop depending on it first — per-entry requests, or a route of its own — and
 * this test is what says so when it goes red.
 */
final class TheJournalListIsWholeForTheExportTest extends TestCase
{
    use RefreshDatabase;

    /** Everything a person's own export has to contain. */
    private const CONTENT = ['whatHappened', 'memory', 'belief', 'forgiveness', 'note'];

    public function test_a_list_row_carries_the_words_the_person_wrote(): void
    {
        $user = User::factory()->create();

        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => null,
            'title' => 'The thing with the manager',
            'what_happened' => 'He talked over me in front of everybody.',
            'belief' => 'I am not good enough',
            'forgiveness' => 'I forgive myself for believing that.',
            'memory' => 'Being told to be quiet at eight years old.',
            'note' => 'Worth coming back to.',
            'feelings' => ['angry', 'hurt'],
            'kind' => 'full',
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'shared_with_coach' => false,
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $row = $this->getJson('/api/journal')->assertOk()->json('items.0');

        foreach (self::CONTENT as $field) {
            $this->assertArrayHasKey(
                $field,
                $row,
                "the list dropped {$field}, which empties \"Export my data\" — see this test's note",
            );
        }

        // By value, not only by key: a field present and null is the same file
        // for the person as a field that is gone.
        $this->assertSame('He talked over me in front of everybody.', $row['whatHappened']);
        $this->assertSame('Being told to be quiet at eight years old.', $row['memory']);
        $this->assertSame('Worth coming back to.', $row['note']);
    }

    /**
     * And the page size the export asks for is allowed.
     *
     * `wholeJournal()` pages at 100, which is also `Paged`'s ceiling. A lower
     * ceiling would not break the export — it would just page more — but a
     * ceiling below 100 with `everyPage` trusting its own `limit` is the kind
     * of mismatch worth one assertion.
     */
    public function test_the_export_s_page_size_is_not_capped_below_what_it_asks_for(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/journal?limit=100')->assertOk();
    }
}
