<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\CoachAttention;
use App\Domain\CoachView;
use App\Domain\EndReason;
use App\Models\CoachClient;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;

/**
 * A coach's view of their clients, built through the sharing rule.
 *
 * Every read here goes through `CoachView`, which takes a whole journal and
 * shares it down itself. The temptation is to put `where('shared_with_coach')`
 * in each query instead; the reason not to is that a forgotten `where` is
 * silent, and what it leaks is somebody's private session.
 *
 * Nothing here is reachable without the pairing: a coach who is not this
 * client's coach gets nothing, checked by the caller before any of this runs.
 */
final readonly class CoachService
{
    /**
     * The coach's clients, each with what the coach can see of them.
     *
     * @return list<array<string, mixed>>
     */
    public function clients(User $coach): array
    {
        $rows = [];

        foreach ($coach->clients()->orderBy('name')->get() as $client) {
            $pivot = $client->getRelationValue('pivot');
            assert($pivot instanceof CoachClient);

            $rows[] = [
                'id' => (string) $client->id,
                'name' => $client->name,
                'status' => $pivot->status->value,
                'since' => $pivot->since?->toIso8601String(),
                'nextCallAt' => $pivot->next_call_at?->toIso8601String(),
                'coachNotes' => $pivot->coach_notes,
                ...self::presentSummary(CoachView::summarise($this->journalOf($client))),
            ];
        }

        return $rows;
    }

    /**
     * One client, with the sessions they shared and nothing else.
     *
     * @return array<string, mixed>
     */
    public function client(User $coach, User $client): array
    {
        $pivot = $coach->clients()->where('users.id', $client->id)->sole()
            ->getRelationValue('pivot');
        assert($pivot instanceof CoachClient);

        $journal = $this->journalOf($client);

        return [
            'id' => (string) $client->id,
            'name' => $client->name,
            'status' => $pivot->status->value,
            'since' => $pivot->since?->toIso8601String(),
            'nextCallAt' => $pivot->next_call_at?->toIso8601String(),
            'coachNotes' => $pivot->coach_notes,
            ...self::presentSummary(CoachView::summarise($journal)),
            // `presented` is a closure, called only for the entries
            // `sharedWith()` kept — so a private entry's title and note are
            // never decrypted. `CoachView` still receives the whole journal
            // and shares it down itself, which is the property that makes a
            // forgotten `where` impossible; what changed is only when the
            // text is read, not who decides.
            'sharedSessions' => array_map(
                fn (array $e) => ($e['presented'])(),
                CoachView::sharedWith($journal),
            ),
            'attention' => array_map(
                fn (CoachAttention $a) => [
                    'reason' => $a->reason,
                    'at' => $a->at->format(\DateTimeInterface::ATOM),
                ],
                $this->attention($client),
            ),
        ];
    }

    /**
     * The summary as the API spells it.
     *
     * `CoachView` reports the last shared session as epoch milliseconds so the
     * TypeScript port and this one compare as the same instant. A client of
     * this API wants a date it can render, so the conversion happens here and
     * the domain stays comparable.
     *
     * @param  array{sharedCount: int, lastSharedAtMs: ?int, recurringBelief: ?array{belief: string, sessions: int}}  $summary
     * @return array<string, mixed>
     */
    private static function presentSummary(array $summary): array
    {
        $ms = $summary['lastSharedAtMs'];

        return [
            'sharedCount' => $summary['sharedCount'],
            'lastSharedAt' => $ms === null
                ? null
                : (new \DateTimeImmutable('@'.intdiv($ms, 1000)))->format(\DateTimeInterface::ATOM),
            'recurringBelief' => $summary['recurringBelief'],
        ];
    }

    /**
     * Exactly what a coach's client view reads of a journal row.
     *
     * `forgiveness` and `memory` are absent because nothing in this path reads
     * them, and they are the client's own words. Adding a field to `presented`
     * means adding its column here, and
     * `CoachReadsOnlyWhatItNeedsTest` is what says so.
     */
    private const JOURNAL_COLUMNS = [
        'id',
        'shared_with_coach',
        'occurred_at',
        'belief',
        'title',
        'note',
        'feelings',
        'kind',
        'duration_minutes',
        'calmer_rating',
        'reached_final_step',
    ];

    /**
     * Why a client might need their coach, without saying what they said.
     *
     * A safety-stopped session is never journalled, so a coach cannot learn of
     * one by reading. This is the product telling them instead: that it
     * happened, and when. The words are in the safety queue, which is a
     * reviewer's screen — a coach is not a reviewer.
     *
     * @return list<CoachAttention>
     */
    public function attention(User $client): array
    {
        $out = [];

        // Two timestamp columns and nothing else. What this answers is "it
        // happened, and when", and `guided_sessions.data` is the most personal
        // text the product holds — so a coach's request does not read it into
        // memory at all, rather than reading it and not using it. The
        // encrypted cast is lazy, so nothing would have been decrypted either
        // way; this is the difference between a rule and a habit, and
        // `AdminOverviewService` narrows its one read for the same reason.
        //
        // `id` after `started_at` because two sessions can share a second and
        // a tie with no tiebreaker makes which five appear arbitrary.
        $stopped = GuidedSession::query()
            ->select(['id', 'started_at', 'ended_at'])
            ->where('user_id', $client->id)
            ->where('end_reason', EndReason::SafetyStop)
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        foreach ($stopped as $session) {
            $out[] = new CoachAttention(
                clientId: $client->id,
                reason: 'A session stopped for safety. Helplines were shown.',
                at: ($session->ended_at ?? $session->started_at)->toDateTimeImmutable(),
            );
        }

        return $out;
    }

    /**
     * A client's whole journal, in the shape CoachView expects.
     *
     * Whole on purpose: the sharing rule is applied by CoachView and not here,
     * so there is one place to read when asking "can a coach see this".
     * `presented` is what a coach is actually handed, and it is built from the
     * same row, so an entry cannot be summarised as shared and rendered as
     * something else.
     *
     * **It names its columns, and `presented` is a closure.** Measured: with
     * every column fetched and `presented` built eagerly, a coach's request
     * decrypted a **private** entry's title — proved by writing a ciphertext
     * no key can read into one and watching `CoachService::client()` throw
     * `DecryptException`. Nothing leaked, because `CoachView` filters before
     * the response is built; but `CoachAttention` a few lines up states the
     * standard this fell short of — a coach's request "does not read it into
     * memory at all, rather than reading it and not using it". Three encrypted
     * columns of a private entry were being decrypted (`title`, `belief`,
     * `note`) and two more fetched and never read (`forgiveness`, `memory`).
     *
     * `belief` is still read for every entry, and that is the one trade here
     * rather than an oversight. `CoachView::summarise()` filters to the shared
     * set itself and then computes the recurring belief from it, and the
     * property worth keeping is that it would be correct even if this method
     * handed it everything. Nulling a private entry's belief here would make
     * that filter unnecessary, which is exactly the "forgotten `where` is
     * silent" failure `CoachView` exists to prevent — so one column is
     * decrypted and never shown, deliberately, to keep the rule enforceable in
     * one place. Making it lazy instead means changing a contract
     * `parity/cases.json` pins against the TypeScript port, which takes plain
     * strings.
     *
     * **And it is still unbounded**, which since `InsightsService` was given a
     * ceiling makes it the only read here that is. The reason is better than
     * that one's was: the sharing rule needs the whole journal, so there is no
     * window to bound and no page to take. Measured at 2,000 entries — 470 ms
     * and 84 MB — of which 200 were shared. It also grows differently: the
     * insights ceiling bounds what one account can do to its own screen, where
     * this grows with how much a client has written and shared, over all time
     * rather than thirty days. Paging a coach's view is a design decision, not
     * a refactor.
     *
     * @return list<array<string, mixed>>
     */
    private function journalOf(User $client): array
    {
        $entries = [];

        $rows = JournalEntry::query()
            ->select(self::JOURNAL_COLUMNS)
            ->where('user_id', $client->id)
            ->newestFirst()
            ->get();

        foreach ($rows as $entry) {
            $entries[] = [
                'sharedWithCoach' => (bool) $entry->shared_with_coach,
                'occurredAt' => $entry->occurred_at->toDateTimeImmutable(),
                'belief' => $entry->belief,
                'presented' => fn (): array => [
                    'id' => $entry->id,
                    'title' => $entry->title,
                    'summary' => $entry->listSummary(),
                    'occurredAt' => $entry->occurred_at->toIso8601String(),
                    'durationMinutes' => $entry->duration_minutes,
                    'kind' => $entry->kind->value,
                    'feelings' => array_map(fn ($f) => $f->value, $entry->feelingIds()),
                    'belief' => $entry->belief,
                    'reachedFinalStep' => (bool) $entry->reached_final_step,
                    'calmerRating' => $entry->calmer_rating?->value,
                    // The client's own note travels with a shared session: they
                    // wrote it knowing the entry could be shared, and it is
                    // usually the thing they want to talk about.
                    'note' => $entry->note,
                ],
            ];
        }

        return $entries;
    }
}
