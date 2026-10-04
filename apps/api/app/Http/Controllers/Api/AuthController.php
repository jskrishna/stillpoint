<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Plan;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Services\SessionService;
use App\Support\EmailAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Support\Str;
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
    /** What a user types to confirm erasing their account. */
    public const DELETE_CONFIRMATION = 'DELETE';

    public function register(Request $request): JsonResponse
    {
        // Normalised **before** validation, so `unique:users,email` compares
        // the same string that gets stored. Laravel's `unique` rule is a
        // `where email = ?`, which is case-sensitive on sqlite — validating
        // the raw input would let a second account through differing only in
        // case, and then two rows exist that MySQL would never have allowed.
        $request->merge(['email' => EmailAddress::normalise($request->input('email'))]);

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

        // Normalised, so the one spelling stored is the one looked up. On
        // MySQL the collation hid this; on sqlite somebody who registered
        // `Aarav@Example.com` could not sign in as `aarav@example.com` and
        // could not reset the password either, because the broker lowercases.
        $user = User::where('email', EmailAddress::normalise($validated['email']))->first();

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

    /**
     * Asks for a reset link.
     *
     * **Always answers the same**, whether or not the address has an account.
     * A different answer for a known address turns this into a way to find out
     * who uses the product — and what this product is used for is not a thing
     * to let anyone check.
     *
     * The link goes to the address by email and is never returned here, for
     * the obvious reason: anyone could ask.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        // The broker's own result is deliberately discarded. It distinguishes
        // "sent" from "no such user", and that distinction is the leak.
        PasswordBroker::sendResetLink(['email' => EmailAddress::normalise($validated['email'])]);

        return response()->json([
            'message' => 'If that address has an account, a reset link is on its way.',
        ]);
    }

    /**
     * Sets a new password from a reset token.
     *
     * Every existing token is revoked with it. A reset is what somebody does
     * when they have lost control of an account, so leaving the old sessions
     * signed in would defeat the point.
     */
    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', Password::defaults()],
        ]);

        $status = PasswordBroker::reset([
            'email' => EmailAddress::normalise($validated['email']),
            'password' => $validated['password'],
            'password_confirmation' => $validated['password'],
            'token' => $validated['token'],
        ], function (User $user, string $password): void {
            $user->password = $password;
            $user->setRememberToken(Str::random(60));
            $user->save();

            // Signed in everywhere else is exactly what a reset is meant to
            // end. The new password is useless if the old token still works.
            $user->tokens()->delete();
        });

        if ($status !== PasswordBroker::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                // One message for a bad token and an expired one: which it was
                // is not information worth handing over.
                'token' => ['That reset link is not valid any more. Ask for a new one.'],
            ]);
        }

        return response()->json([
            'message' => 'Your password is changed. Sign in with it.',
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

    /**
     * Erases the account and everything it owns.
     *
     * Guarded by the account's own password, not by a checkbox. This is not
     * reversible and it takes the most personal text the product holds with it,
     * so it should not be something a stray tap on an unlocked phone can do —
     * and a password is the one thing a person who is not the owner does not
     * have.
     */
    public function destroy(Request $request, AccountDeletionService $deletions): JsonResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string'],
            // Typed out, so the confirmation is an act rather than a reflex.
            'confirm' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['That password is not right.'],
            ]);
        }

        if (trim($validated['confirm']) !== self::DELETE_CONFIRMATION) {
            throw ValidationException::withMessages([
                'confirm' => ['Type '.self::DELETE_CONFIRMATION.' to confirm.'],
            ]);
        }

        $removed = $deletions->erase($user);

        // The session goes with it, for the same reason logout drops one.
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['removed' => $removed]);
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
