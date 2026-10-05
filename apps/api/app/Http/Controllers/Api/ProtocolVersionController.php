<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\ProtocolVersion;
use App\Domain\StepId;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProtocolVersionResource;
use App\Services\ProtocolVersionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The step-prompt editor's backend.
 *
 * Publishing is gated by the domain, not by this controller and not by the
 * screen: `publishProblems()` decides what blocks, and a refusal comes back as
 * that list. A half-written protocol reaching a session is the failure the
 * version model exists to prevent, so the check is on the server where it
 * cannot be skipped.
 *
 * A published version is never edited. Editing opens the next draft, which is
 * also why a session is pinned to the version it started on: publishing must
 * not change the questions under someone part-way through.
 */
final class ProtocolVersionController extends Controller
{
    public function __construct(private readonly ProtocolVersionService $versions) {}

    public function index(): JsonResponse
    {
        $draft = $this->versions->draft();

        return response()->json([
            'live' => ProtocolVersionResource::toArray($this->versions->current()),
            'draft' => $draft === null ? null : ProtocolVersionResource::toArray($draft),
        ]);
    }

    /** Opens a draft from the live version, or returns the one already open. */
    public function openDraft(): JsonResponse
    {
        return response()->json(
            ProtocolVersionResource::toArray($this->versions->openDraft()),
        );
    }

    /**
     * Edits one step of the open draft.
     *
     * Only the keys present are changed, and `main` and `doneWhen` may be set
     * to null — a step whose copy the PRD has not supplied is honestly empty,
     * and clearing one back to null has to stay possible.
     */
    public function editStep(Request $request, string $stepId): JsonResponse
    {
        $step = StepId::tryFrom($stepId);
        abort_if($step === null, Response::HTTP_NOT_FOUND);

        $validated = $request->validate([
            'main' => ['sometimes', 'nullable', 'string', 'max:500'],
            'backups' => ['sometimes', 'array', 'max:5'],
            'backups.*' => ['string', 'max:500'],
            'doneWhen' => ['sometimes', 'nullable', 'string', 'max:300'],
            'maxGuideTurns' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:20'],
        ]);

        // The `integer` rule accepts "3" as well as 3 and hands back whichever
        // was sent, and the domain's field is an int: a string from a form
        // post was a TypeError and a 500 where the rule had said it was fine.
        if (isset($validated['maxGuideTurns'])) {
            $validated['maxGuideTurns'] = (int) $validated['maxGuideTurns'];
        }

        // One transaction for the read and the write. See `editDraft()`.
        $saved = $this->versions->editDraft(
            fn (ProtocolVersion $draft) => $draft->withStepEdit($step, $validated),
        );

        return response()->json(ProtocolVersionResource::toArray($saved));
    }

    /** Edits the wording a user sees when a session stops for safety. */
    public function editSafety(Request $request): JsonResponse
    {
        // `filled`, not just `string`: an empty title would publish a safety
        // screen with no words on it. Stated rather than left to the
        // empty-string-to-null middleware, which rejects it today by accident.
        $validated = $request->validate([
            'pauseTitle' => ['sometimes', 'filled', 'string', 'max:200'],
            'pauseBody' => ['sometimes', 'filled', 'string', 'max:2000'],
        ]);

        $saved = $this->versions->editDraft(
            fn (ProtocolVersion $draft) => $draft->withSafetyWording(
                $validated['pauseTitle'] ?? null,
                $validated['pauseBody'] ?? null,
            ),
        );

        return response()->json(ProtocolVersionResource::toArray($saved));
    }

    public function publish(): JsonResponse
    {
        $published = $this->versions->publishDraft();

        if ($published === null) {
            $draft = $this->versions->draft();

            return response()->json([
                'message' => $draft === null
                    ? 'There is no draft to publish.'
                    : 'This draft cannot be published yet.',
                'problems' => $draft === null
                    ? []
                    : ProtocolVersionResource::toArray($draft)['problems'],
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(ProtocolVersionResource::toArray($published));
    }
}
