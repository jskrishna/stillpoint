<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoachInvite;
use App\Models\User;
use App\Support\EmailAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Coach invitations.
 *
 * **The client creates the pairing, by accepting.** A coach can invite an
 * address; they cannot attach themselves to an account. In a product where what
 * a coach sees is the client's own choice session by session, the relationship
 * itself has to be the client's choice too — otherwise the first choice is made
 * for them.
 *
 * Reading an invite is public, because the person holding the link has not
 * signed in yet and needs to know who is asking before they decide whether to.
 * It says who invited them and nothing else: an invite is not a way to look up
 * whether an address has an account.
 */
final class CoachInviteController extends Controller
{
    /** The coach's own invitations. */
    public function index(Request $request): JsonResponse
    {
        $invites = CoachInvite::query()
            ->where('coach_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json($invites->map(fn (CoachInvite $i) => self::forCoach($i))->all());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        $coach = $request->user();
        $email = EmailAddress::normalise($validated['email']);

        if ($email === EmailAddress::normalise($coach->email)) {
            return response()->json(
                ['message' => 'You cannot invite yourself.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        // Already paired? Say so rather than opening an invite that would do
        // nothing. This leaks only what the coach's own client list already
        // tells them.
        $existing = User::query()->whereRaw('lower(email) = ?', [$email])->first();
        if ($existing !== null && $coach->clients()->where('users.id', $existing->id)->exists()) {
            return response()->json(
                ['message' => 'They are already one of your clients.'],
                Response::HTTP_CONFLICT,
            );
        }

        // One open invite per address: a second would be the same invitation
        // with a different token, and two links for one decision is confusing.
        $open = CoachInvite::query()
            ->where('coach_id', $coach->id)
            ->where('email', $email)
            ->usable()
            ->first();

        $invite = $open ?? CoachInvite::open($coach, $email);

        return response()->json(
            self::forCoach($invite),
            $open === null ? Response::HTTP_CREATED : Response::HTTP_OK,
        );
    }

    /** Withdraws an invitation that has not been accepted. */
    public function destroy(Request $request, CoachInvite $invite): JsonResponse
    {
        abort_unless($invite->coach_id === $request->user()->id, Response::HTTP_NOT_FOUND);

        if ($invite->status === 'accepted') {
            // Withdrawing an accepted invite would imply it undoes the pairing,
            // which it does not: ending a pairing is the client's to do.
            return response()->json(
                ['message' => 'This invitation was already accepted. The pairing is theirs to end.'],
                Response::HTTP_CONFLICT,
            );
        }

        $invite->status = 'revoked';
        $invite->save();

        return response()->json(self::forCoach($invite->refresh()));
    }

    /**
     * What an invitation says to whoever holds the link.
     *
     * Public, and deliberately thin: who is inviting you, and whether the link
     * still works. Not whether the address has an account — an invite is not a
     * lookup tool.
     */
    public function show(string $token): JsonResponse
    {
        $invite = CoachInvite::query()->where('token', $token)->first();
        abort_if($invite === null, Response::HTTP_NOT_FOUND);

        return response()->json([
            'coachName' => $invite->coach->name,
            'email' => $invite->email,
            'usable' => $invite->isUsable(),
            'reason' => $invite->unusableReason(),
            'expiresAt' => $invite->expires_at->toIso8601String(),
        ]);
    }

    /**
     * Accepts an invitation, which is what creates the pairing.
     *
     * Only by the person it was sent to. A signed-in user cannot accept an
     * invitation addressed to somebody else, however they came by the link.
     */
    public function accept(Request $request, string $token): JsonResponse
    {
        $invite = CoachInvite::query()->where('token', $token)->first();
        abort_if($invite === null, Response::HTTP_NOT_FOUND);

        if (! $invite->isUsable()) {
            return response()->json(
                ['message' => $invite->unusableReason() ?? 'This invitation cannot be used.'],
                Response::HTTP_CONFLICT,
            );
        }

        $user = $request->user();
        if (EmailAddress::normalise($user->email) !== $invite->email) {
            return response()->json([
                'message' => 'This invitation was sent to a different address. Sign in as '.$invite->email.' to accept it.',
            ], Response::HTTP_FORBIDDEN);
        }

        if ($invite->coach_id === $user->id) {
            return response()->json(
                ['message' => 'You cannot be your own client.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        DB::transaction(function () use ($invite, $user): void {
            $coach = $invite->coach;

            // Idempotent: accepting twice is one pairing, not two.
            if (! $coach->clients()->where('users.id', $user->id)->exists()) {
                $coach->clients()->attach($user->id, [
                    'status' => 'active',
                    'since' => now(),
                ]);
            }

            $invite->status = 'accepted';
            $invite->accepted_at = now();
            $invite->accepted_by = $user->id;
            $invite->save();
        });

        return response()->json([
            'coachName' => $invite->coach->name,
            'acceptedAt' => $invite->refresh()->accepted_at?->toIso8601String(),
        ]);
    }

    /**
     * An invitation as its own coach sees it.
     *
     * Carries the token, because there is no mail driver yet: the coach is given
     * the link to pass on themselves. When mail is wired this stops being
     * returned and the invite is sent instead.
     *
     * @return array<string, mixed>
     */
    private static function forCoach(CoachInvite $invite): array
    {
        return [
            'id' => $invite->id,
            'email' => $invite->email,
            'status' => $invite->status,
            'usable' => $invite->isUsable(),
            'expiresAt' => $invite->expires_at->toIso8601String(),
            'acceptedAt' => $invite->accepted_at?->toIso8601String(),
            'link' => '/welcome/invite/'.$invite->token,
        ];
    }
}
