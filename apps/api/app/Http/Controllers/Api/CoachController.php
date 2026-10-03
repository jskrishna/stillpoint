<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\CoachService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The coach portal.
 *
 * Two gates, both needed. The role gate (`EnsureCoach`) says this person is a
 * coach at all; the pairing check below says they are *this client's* coach.
 * Neither implies the other, and a route with only the first would let any
 * coach read any client.
 *
 * What a coach sees of a client is decided by `CoachView`, not here.
 */
final class CoachController extends Controller
{
    public function __construct(private readonly CoachService $coaches) {}

    public function clients(Request $request): JsonResponse
    {
        return response()->json($this->coaches->clients($request->user()));
    }

    public function client(Request $request, User $client): JsonResponse
    {
        $coach = $request->user();
        $this->authorizePairing($coach, $client);

        return response()->json($this->coaches->client($coach, $client));
    }

    /**
     * The coach's own notes and the next call.
     *
     * Notes are the coach's, about a client, and are never shown to the client.
     */
    public function update(Request $request, User $client): JsonResponse
    {
        $coach = $request->user();
        $this->authorizePairing($coach, $client);

        $validated = $request->validate([
            'coachNotes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'nextCallAt' => ['sometimes', 'nullable', 'date'],
        ]);

        $changes = [];
        if (array_key_exists('coachNotes', $validated)) {
            $notes = is_string($validated['coachNotes']) ? trim($validated['coachNotes']) : null;
            $changes['coach_notes'] = ($notes === null || $notes === '') ? null : $notes;
        }
        if (array_key_exists('nextCallAt', $validated)) {
            $changes['next_call_at'] = $validated['nextCallAt'];
        }

        if ($changes !== []) {
            $coach->clients()->updateExistingPivot($client->id, $changes);
        }

        return response()->json($this->coaches->client($coach, $client->refresh()));
    }

    /** 404, not 403: a coach learns nothing about who else has clients. */
    private function authorizePairing(User $coach, User $client): void
    {
        abort_unless(
            $coach->clients()->where('users.id', $client->id)->exists(),
            Response::HTTP_NOT_FOUND,
        );
    }
}
