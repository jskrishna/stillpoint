<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\CalmerRating;
use App\Domain\Conversation;
use App\Domain\EndReason;
use App\Domain\Session as DomainSession;
use App\Domain\SessionKind;
use App\Domain\TurnResult;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Running a session against the database.
 *
 * The rules are the domain's; this only persists what the domain decided. Three
 * things it is careful about:
 *
 *  - a turn is written in one transaction, so a session can never be recorded
 *    as stopped without the flag that stopped it;
 *  - a flag is raised whenever the screen says so, even when the turn carried
 *    on, because a Medium signal still needs a reviewer;
 *  - the journal row is written only when the domain allows one, which is how
 *    a safety-stopped session stays out of the journal.
 */
final readonly class SessionService
{
    public function __construct(
        private Conversation $conversation,
        private ProtocolVersionService $versions,
    ) {}

    public function start(User $user, SessionKind $kind = SessionKind::Full): GuidedSession
    {
        $version = $this->versions->current();

        $row = new GuidedSession([
            'user_id' => $user->id,
            'started_at' => now(),
        ]);
        $row->storeDomain(DomainSession::start($kind, $version->label()))->save();

        return $row;
    }

    /** The guide's opening line for the step the session is on. */
    public function openingLine(GuidedSession $row): string
    {
        return $this->conversation->openingLine($row->toDomain(), $this->versions->current());
    }

    /**
     * Runs one turn and persists everything it produced.
     *
     * The session is resolved against the version it started on, not the
     * current one, so a publish part-way through never changes the questions
     * under someone already in a session.
     */
    public function takeTurn(GuidedSession $row, string $utterance, bool $guideAvailable = true): TurnResult
    {
        $version = $this->versions->forSession($row);

        return DB::transaction(function () use ($row, $version, $utterance, $guideAvailable) {
            $result = $this->conversation->takeTurn($row->toDomain(), $version, $utterance, $guideAvailable);

            $row->storeDomain($result->session)->save();

            if ($result->flag !== null) {
                SafetyFlag::create([
                    'user_id' => $row->user_id,
                    'guided_session_id' => $row->id,
                    'level' => $result->flag->level,
                    'category' => $result->flag->category,
                    'excerpt' => $result->flag->excerpt,
                    'outcome' => match (true) {
                        $result->stopped => 'Session stopped. Helplines shown.',
                        // Recorded as its own outcome, so a reviewer is not
                        // told the session continued when it did not.
                        $result->throttled => 'Flagged for review. The turn was rate-limited.',
                        default => 'Flagged for review. Session continued.',
                    },
                    'raised_at' => now(),
                ]);
            }

            if ($result->session->hasEnded()) {
                $this->journal($row);
            }

            return $result;
        });
    }

    /**
     * How many full sessions this user has started in the window.
     *
     * Counted from `started_at` rather than from journal rows, so a session
     * that stopped for safety — which never gets a row — still counts. It was a
     * full session; the allowance is about starting one, not finishing it.
     */
    public function fullSessionsInWindow(User $user, int $windowDays): int
    {
        return GuidedSession::query()
            ->where('user_id', $user->id)
            ->where('kind', SessionKind::Full->value)
            ->where('started_at', '>=', now()->subDays($windowDays))
            ->count();
    }

    /** Ends a session because the user chose to stop. */
    public function stop(GuidedSession $row): GuidedSession
    {
        return DB::transaction(function () use ($row) {
            $row->storeDomain($row->toDomain()->withUserStopped())->save();
            $this->journal($row);

            return $row;
        });
    }

    public function rate(GuidedSession $row, CalmerRating $rating): GuidedSession
    {
        return DB::transaction(function () use ($row, $rating) {
            $row->storeDomain($row->toDomain()->withRating($rating))->save();

            $entry = JournalEntry::where('guided_session_id', $row->id)->first();
            $entry?->update(['calmer_rating' => $rating]);

            return $row;
        });
    }

    /**
     * Writes the journal row, if the domain allows one.
     *
     * Returns null for a session that ended for safety: the user was handed to
     * a helpline, and turning that into a diary entry is the wrong thing to put
     * in front of them later.
     */
    private function journal(GuidedSession $row): ?JournalEntry
    {
        if (JournalEntry::where('guided_session_id', $row->id)->exists()) {
            return null;
        }

        $minutes = (int) max(1, round($row->started_at->diffInSeconds(now()) / 60));
        $entry = JournalEntry::fromSession($row, $minutes);
        $entry?->save();

        return $entry;
    }

    /** Whether a session ended because of a safety signal. */
    public function stoppedForSafety(GuidedSession $row): bool
    {
        return $row->toDomain()->endReason === EndReason::SafetyStop;
    }
}
