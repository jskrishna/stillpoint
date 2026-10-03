<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\ProtocolStep;
use App\Domain\ProtocolVersion;
use App\Domain\StepId;
use App\Domain\StepPrompts;
use App\Models\GuidedSession;
use App\Models\ProtocolVersion as ProtocolVersionModel;
use Illuminate\Support\Facades\DB;

/** Resolves protocol versions, falling back to the baseline when none is live. */
final class ProtocolVersionService
{
    /** The live version, or the baseline when nothing has been published. */
    public function current(): ProtocolVersion
    {
        $row = ProtocolVersionModel::query()->where('status', 'live')->latest('published_at')->first();

        return $row === null ? ProtocolVersion::baseline() : self::toDomain($row);
    }

    /**
     * The version a session started on.
     *
     * A session is run against the version it was pinned to, so publishing
     * never changes the questions under someone already part-way through.
     */
    public function forSession(GuidedSession $session): ProtocolVersion
    {
        $label = $session->protocol_version;
        if ($label === null) {
            return $this->current();
        }

        [$major, $minor] = array_pad(array_map('intval', explode('.', $label)), 2, 0);
        $row = ProtocolVersionModel::query()->where('major', $major)->where('minor', $minor)->first();

        return $row === null ? ProtocolVersion::baseline() : self::toDomain($row);
    }

    /** The draft being edited, or null when there is none open. */
    public function draft(): ?ProtocolVersion
    {
        $row = ProtocolVersionModel::query()->where('status', 'draft')->latest('id')->first();

        return $row === null ? null : self::toDomain($row);
    }

    /**
     * Opens a draft from the live version, or returns the one already open.
     *
     * One draft at a time, on purpose: two people editing two drafts and
     * publishing in either order is a way to lose a step's copy without anyone
     * noticing.
     */
    public function openDraft(): ProtocolVersion
    {
        // Locked and in a transaction, the same way and in the same order as
        // `publishDraft()`, so the two cannot deadlock against each other.
        //
        // Two admins opening a draft at the same moment cannot produce two
        // drafts — `protocol_versions` is unique on (major, minor) and
        // `nextDraft()` is a pure function of the live version, so both would
        // aim at one row and the database would refuse the second. The
        // database was already doing the work; what it was not doing is
        // answering the second admin sensibly. `updateOrCreate` reads and then
        // inserts, so the one that lost the race got a unique-constraint
        // violation and a 500, for a button whose contract is "or returns the
        // one already open".
        //
        // No test. Reproducing it needs two connections writing at once, which
        // sqlite cannot do, and a sequential test of this would pass with the
        // lock removed — it would be the "returns the existing draft" case
        // wearing the name of the race.
        return DB::transaction(function (): ProtocolVersion {
            ProtocolVersionModel::query()->orderBy('id')->lockForUpdate()->get();

            $existing = $this->draft();
            if ($existing !== null) {
                return $existing;
            }

            $live = ProtocolVersionModel::query()
                ->where('status', 'live')
                ->latest('published_at')
                ->first();
            $draft = $live === null
                // Nothing published yet: the baseline is already a draft, and
                // it is the version with the designs' copy and nulls for the
                // rest.
                ? ProtocolVersion::baseline()
                : self::toDomain($live)->nextDraft();

            return $this->store($draft);
        });
    }

    /** Writes a version, inserting or updating the row for its number. */
    public function store(ProtocolVersion $version): ProtocolVersion
    {
        $steps = [];
        foreach ($version->orderedSteps() as $step) {
            $steps[$step->id->value] = [
                'main' => $step->prompts->main,
                'backups' => $step->prompts->backups,
                'doneWhen' => $step->doneWhen,
                'maxGuideTurns' => $step->maxGuideTurns,
            ];
        }

        $row = ProtocolVersionModel::query()->updateOrCreate(
            ['major' => $version->major, 'minor' => $version->minor],
            [
                'status' => $version->status,
                'steps' => $steps,
                'pause_title' => $version->pauseTitle,
                'pause_body' => $version->pauseBody,
                'published_at' => $version->publishedAt,
            ],
        );

        return self::toDomain($row->refresh());
    }

    /**
     * Publishes the open draft, archiving whatever was live.
     *
     * Returns null when the draft is not publishable; the caller reports
     * `publishProblems()` rather than this guessing at a message. Both writes
     * happen in one transaction: two live versions at once would mean two
     * different sets of questions in flight.
     */
    public function publishDraft(): ?ProtocolVersion
    {
        return DB::transaction(function (): ?ProtocolVersion {
            // Everything inside, and the rows locked first. Read outside, two
            // admins publishing at the same moment can both archive what was
            // live before either stores its replacement — and then both store
            // one, leaving two live versions and two different sets of
            // questions in flight. That is the state this method's transaction
            // was already written to prevent; it just could not see far enough
            // back to do it.
            ProtocolVersionModel::query()->orderBy('id')->lockForUpdate()->get();

            $draft = $this->draft();
            if ($draft === null) {
                return null;
            }

            $published = $draft->publish(new \DateTimeImmutable);
            if ($published === null) {
                return null;
            }

            ProtocolVersionModel::query()
                ->where('status', 'live')
                ->update(['status' => 'archived']);

            return $this->store($published);
        });
    }

    public static function toDomain(ProtocolVersionModel $row): ProtocolVersion
    {
        $steps = [];
        foreach (StepId::ordered() as $id) {
            $raw = $row->steps[$id->value] ?? [];
            $steps[$id->value] = new ProtocolStep(
                id: $id,
                prompts: new StepPrompts($raw['main'] ?? null, $raw['backups'] ?? []),
                doneWhen: $raw['doneWhen'] ?? null,
                maxGuideTurns: $raw['maxGuideTurns'] ?? null,
            );
        }

        return new ProtocolVersion(
            major: $row->major,
            minor: $row->minor,
            status: $row->status,
            steps: $steps,
            pauseTitle: $row->pause_title,
            pauseBody: $row->pause_body,
            publishedAt: $row->published_at?->toDateTimeImmutable(),
        );
    }
}
