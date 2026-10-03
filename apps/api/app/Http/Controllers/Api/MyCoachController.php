<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoachClient;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Who can read this user's shared sessions, from the user's own side.
 *
 * The portal tells a coach "you only see sessions your clients choose to
 * share". That is only true in a way worth saying if the client can also see
 * who those coaches are and stop it — a sharing rule the sharer cannot inspect
 * or revoke is a promise about someone else's behaviour.
 *
 * So: this lists them, says how much they can currently see, and ends it.
 */
final class MyCoachController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $shared = JournalEntry::query()
            ->where('user_id', $user->id)
            ->where('shared_with_coach', true)
            ->count();

        $coaches = $user->coaches()->orderBy('name')->get()->map(function (User $coach) use ($shared) {
            $pivot = $coach->getRelationValue('pivot');
            assert($pivot instanceof CoachClient);

            return [
                'id' => (string) $coach->id,
                'name' => $coach->name,
                'email' => $coach->email,
                'status' => $pivot->status->value,
                'since' => $pivot->since?->toIso8601String(),
                // Said plainly, because "they can see your shared sessions" is
                // abstract and a number is not.
                'sharedSessions' => $shared,
            ];
        });

        return response()->json($coaches->all());
    }

    /**
     * Ends a coaching relationship.
     *
     * Immediate, and the client's alone — a coach cannot do this for them and
     * does not need to agree. The shared sessions are not unshared: the flag on
     * each entry is a separate decision and stays where the user put it. What
     * ends is anyone being able to read them, because reading goes through the
     * pairing.
     */
    public function destroy(Request $request, User $coach): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->coaches()->where('users.id', $coach->id)->exists(),
            Response::HTTP_NOT_FOUND,
        );

        DB::transaction(function () use ($user, $coach): void {
            $user->coaches()->detach($coach->id);
        });

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }
}
