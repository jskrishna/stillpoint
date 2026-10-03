<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\CalmerRating;
use App\Domain\ConsentItem;
use App\Domain\SessionKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Models\GuidedSession;
use App\Services\ProtocolVersionService;
use App\Services\SessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

final class SessionController extends Controller
{
    public function __construct(
        private readonly SessionService $sessions,
        private readonly ProtocolVersionService $versions,
    ) {}

    /**
     * Starts a session.
     *
     * Refused without consent. The consent screen is where the product says it
     * is not therapy and that the user may stop at any time, so starting
     * without it is not a thing the API should allow, whatever the client did.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->hasRequiredConsent()) {
            return response()->json([
                'message' => 'Consent is required before a session can start.',
                'missing' => ConsentItem::missing($user->accepted_consent ?? []),
            ], Response::HTTP_FORBIDDEN);
        }

        $validated = $request->validate([
            'kind' => ['sometimes', Rule::enum(SessionKind::class)],
        ]);

        $row = $this->sessions->start($user, SessionKind::tryFrom($validated['kind'] ?? 'full') ?? SessionKind::Full);

        return (new SessionResource(
            $row,
            $this->versions->forSession($row),
            $this->sessions->openingLine($row),
        ))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Request $request, GuidedSession $session): SessionResource
    {
        $this->authorizeOwnership($request, $session);

        return new SessionResource($session, $this->versions->forSession($session));
    }

    /**
     * Takes one turn.
     *
     * This is where safety screening happens, on the server, before the guide
     * is consulted. A client cannot skip it by not calling it: there is no
     * other way to advance a session.
     */
    public function turn(Request $request, GuidedSession $session): JsonResponse
    {
        $this->authorizeOwnership($request, $session);

        $validated = $request->validate([
            'utterance' => ['required', 'string', 'max:5000'],
        ]);

        if ($session->toDomain()->hasEnded()) {
            return response()->json(['message' => 'This session has ended.'], Response::HTTP_CONFLICT);
        }

        $result = $this->sessions->takeTurn($session, $validated['utterance']);

        return (new SessionResource(
            $session->refresh(),
            $this->versions->forSession($session),
            $result->say,
        ))->response();
    }

    /** The user choosing to stop, which they may do at any time. */
    public function stop(Request $request, GuidedSession $session): SessionResource
    {
        $this->authorizeOwnership($request, $session);
        $this->sessions->stop($session);

        return new SessionResource($session->refresh(), $this->versions->forSession($session));
    }

    public function rate(Request $request, GuidedSession $session): SessionResource
    {
        $this->authorizeOwnership($request, $session);

        $validated = $request->validate([
            'rating' => ['required', Rule::enum(CalmerRating::class)],
        ]);

        $this->sessions->rate($session, CalmerRating::from($validated['rating']));

        return new SessionResource($session->refresh(), $this->versions->forSession($session));
    }

    private function authorizeOwnership(Request $request, GuidedSession $session): void
    {
        abort_unless($session->user_id === $request->user()->id, Response::HTTP_NOT_FOUND);
    }
}
