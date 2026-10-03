<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\ProtocolVersion;
use App\Domain\StepId;

/**
 * A protocol version as the editor sees it.
 *
 * Not a JsonResource: what this wraps is a domain object, not a model, and
 * there is no row to bind to. It also carries `problems` — what would block
 * publishing — because the editor renders the domain's answer rather than
 * deciding for itself what counts as incomplete.
 */
final class ProtocolVersionResource
{
    /** @return array<string, mixed> */
    public static function toArray(ProtocolVersion $version): array
    {
        $steps = [];
        foreach (StepId::ordered() as $id) {
            $step = $version->step($id);
            $steps[] = [
                'id' => $id->value,
                'ordinal' => $id->ordinal(),
                'name' => $id->name(),
                'summary' => $id->summary(),
                'answerKind' => $id->answerKind()->value,
                'main' => $step->prompts->main,
                'backups' => $step->prompts->backups,
                'doneWhen' => $step->doneWhen,
                'maxGuideTurns' => $step->maxGuideTurns,
                'complete' => $step->isComplete(),
            ];
        }

        $problems = [];
        foreach ($version->publishProblems() as $problem) {
            $problems[] = [
                'stepId' => $problem['stepId']?->value,
                'reason' => $problem['reason'],
            ];
        }

        return [
            'label' => $version->label(),
            'major' => $version->major,
            'minor' => $version->minor,
            'status' => $version->status,
            'pauseTitle' => $version->pauseTitle,
            'pauseBody' => $version->pauseBody,
            'publishedAt' => $version->publishedAt?->format(\DateTimeInterface::ATOM),
            'steps' => $steps,
            'problems' => $problems,
            'publishable' => $version->isPublishable(),
            'runnable' => $version->isRunnable(),
        ];
    }
}
