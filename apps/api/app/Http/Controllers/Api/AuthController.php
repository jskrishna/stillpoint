<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Plan;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accounts and tokens.
 *
 * Deliberately plain: email and password, with a Sanctum token. The designs
 * show Google and Apple sign-in too; those are not built, and a stub that
 * pretended to be them would be worse than their absence.
 */
final class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::defaults()],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ])->refresh();

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => self::profile($user),
        ], Response::HTTP_CREATED);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if ($user === null || ! Hash::check($validated['password'], $user->password)) {
            // One message for both cases, so the response cannot be used to
            // discover which addresses have accounts.
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        return response()->json([
            'token' => $user->createToken('web')->plainTextToken,
            'user' => self::profile($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        // Revoke the token this call was made with.
        $token = $request->user()->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        // And drop any session. Sanctum authenticates a stateful request from
        // a session cookie, so deleting the token alone can leave a browser
        // signed in — which is not what anyone means by "log out".
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(status: Response::HTTP_NO_CONTENT);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(self::profile($request->user()));
    }

    /** Preferences, as the settings screen changes them. */
    public function updateMe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'guideVoice' => ['sometimes', 'in:sage,river'],
            'talkMode' => ['sometimes', 'in:hold,hands_free,type'],
            'coachSharing' => ['sometimes', 'in:ask_each_time,never,always'],
        ]);

        $user = $request->user();
        $user->fill(array_filter([
            'guide_voice' => $validated['guideVoice'] ?? null,
            'talk_mode' => $validated['talkMode'] ?? null,
            'coach_sharing' => $validated['coachSharing'] ?? null,
        ], fn ($v) => $v !== null))->save();

        return response()->json(self::profile($user->refresh()));
    }

    /**
     * Records consent.
     *
     * Only ids the product actually asks about are stored, and the timestamp is
     * set when the required ones are present — consent is a record of what was
     * agreed and when, not a preference to be toggled.
     */
    public function consent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'accepted' => ['present', 'array'],
            'accepted.*' => ['string', 'in:understands,adult,improve'],
        ]);

        $user = $request->user();
        $user->accepted_consent = array_values(array_unique($validated['accepted']));
        $user->consented_at = $user->hasRequiredConsent() ? now() : null;
        $user->save();

        return response()->json(self::profile($user->refresh()));
    }

    /** @return array<string, mixed> */
    private static function profile(User $user): array
    {
        $plan = Plan::fromStored($user->plan);
        // Counted here so the app can say "one full session left this week"
        // before someone starts one and is refused.
        $used = app(SessionService::class)->fullSessionsInWindow($user, Plan::ALLOWANCE_WINDOW_DAYS);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'plan' => $user->plan,
            'role' => $user->role->value,
            'fullSessionsPerWeek' => $plan->fullSessionsPerWeek(),
            'fullSessionsLeft' => $plan->fullSessionsLeft($used),
            'country' => $user->country,
            'guideVoice' => $user->guide_voice,
            'talkMode' => $user->talk_mode,
            'coachSharing' => $user->coach_sharing,
            'acceptedConsent' => $user->accepted_consent ?? [],
            'hasRequiredConsent' => $user->hasRequiredConsent(),
            'consentedAt' => $user->consented_at?->toIso8601String(),
        ];
    }
}
