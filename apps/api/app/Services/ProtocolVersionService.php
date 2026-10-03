<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\ProtocolStep;
use App\Domain\ProtocolVersion;
use App\Domain\StepId;
use App\Domain\StepPrompts;
use App\Models\GuidedSession;
use App\Models\ProtocolVersion as ProtocolVersionModel;

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
