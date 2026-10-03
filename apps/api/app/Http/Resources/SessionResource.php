<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Helpline;
use App\Domain\ProtocolVersion;
use App\Domain\StepId;
use App\Models\GuidedSession;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A session as the client sees it.
 *
 * What the client is told is deliberately narrow. It never receives the risk
 * assessment or the matched phrase: a user mid-session has no use for "you
 * tripped the self-harm rule", and a client that knows the rule can be built
 * to dodge it.
 *
 * @property GuidedSession $resource
 */
final class SessionResource extends JsonResource
{
    public function __construct(
        GuidedSession $resource,
        private readonly ProtocolVersion $version,
        private readonly ?string $say = null,
    ) {
        parent::__construct($resource);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $session = $this->resource->toDomain();
        $stoppedForSafety = $session->endReason?->value === 'safety_stop';

        return [
            'id' => $this->resource->id,
            'kind' => $session->kind->value,
            'step' => $session->stepId === null ? null : [
                'id' => $session->stepId->value,
                'name' => $session->stepId->name(),
                'ordinal' => $session->stepId->ordinal(),
            ],
            'stepCount' => StepId::count(),
            'ended' => $session->hasEnded(),
            'endReason' => $session->endReason?->value,
            'say' => $this->say,
            'data' => [
                'whatHappened' => $session->data->whatHappened,
                'feelings' => array_map(fn ($f) => $f->value, $session->data->feelings),
                'belief' => $session->data->belief,
                'forgiveness' => $session->data->forgiveness,
                'title' => $session->data->title,
                'calmerRating' => $session->data->calmerRating?->value,
            ],
            // Only on a safety stop, and only what the user needs right then.
            'safety' => $stoppedForSafety ? [
                'title' => $this->version->pauseTitle,
                'body' => $this->version->pauseBody,
                'helplines' => array_map(fn (Helpline $h) => [
                    'name' => $h->name,
                    'number' => $h->number,
                    'detail' => $h->detail,
                    'kind' => $h->kind,
                ], Helpline::forCountry($request->user()?->country ?? 'IN')),
            ] : null,
        ];
    }
}
