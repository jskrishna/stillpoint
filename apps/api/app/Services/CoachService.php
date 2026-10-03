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
            'sharedSessions' => array_map(
                fn (array $e) => $e['presented'],
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
     * @return list<array<string, mixed>>
     */
    private function journalOf(User $client): array
    {
        $entries = [];

        foreach (JournalEntry::query()->where('user_id', $client->id)->newestFirst()->get() as $entry) {
            $entries[] = [
                'sharedWithCoach' => (bool) $entry->shared_with_coach,
                'occurredAt' => $entry->occurred_at->toDateTimeImmutable(),
                'belief' => $entry->belief,
                'presented' => [
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
