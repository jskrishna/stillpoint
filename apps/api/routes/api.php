<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AdminOverviewController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CoachController;
use App\Http\Controllers\Api\CoachInviteController;
use App\Http\Controllers\Api\InsightsController;
use App\Http\Controllers\Api\JournalController;
use App\Http\Controllers\Api\MyCoachController;
use App\Http\Controllers\Api\ProtocolVersionController;
use App\Http\Controllers\Api\SafetyFlagController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Middleware\EnsureCoach;
use App\Http\Middleware\EnsureStaff;
use Illuminate\Support\Facades\Route;

// Throttled: these are the routes worth guessing at. The limiter is keyed by
// what is being guessed rather than by address — see `AppServiceProvider` for
// why a per-IP limit is the wrong shape for an India-first product.
Route::middleware('throttle:guessable')->group(function () {
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);

    // Recovering an account. Without these, a forgotten password means an
    // encrypted journal nobody can ever read again — including its owner.
    Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('auth/reset-password', [AuthController::class, 'resetPassword']);

    // Public, because whoever holds an invite link has not signed in yet and
    // needs to know who is asking before deciding whether to. It says who
    // invited them and nothing else — an invite is not a way to find out
    // whether an address has an account. Throttled with the guessable routes
    // because a token is what it is looked up by.
    Route::get('invites/{token}', [CoachInviteController::class, 'show']);
});

/*
 * Taking a turn, and the one authenticated route with no rate limit on it.
 *
 * It sits outside the group below rather than inside it, and that placement is
 * the rule rather than tidiness: **nothing may refuse this request before the
 * risk screen has read it**, and a rate limit is exactly such a refusal. The
 * request it can refuse is someone saying they are not safe, and then the
 * helplines never appear.
 *
 * It used to be inside that group, with a comment here saying it was
 * "deliberately not given a `throttle` middleware" — true of this line and
 * false of the route, because a group's middleware is the route's. Measured
 * before this moved: 120 ordinary reads of `GET /me` spent the shared budget,
 * and the next turn — "I want to kill myself" — answered **429 with no flag
 * raised and the session still open**. The screen never ran. That is the
 * precise failure the ordering exists to prevent, arriving through the
 * allowance rather than through this route.
 *
 * `throttle:120,1` keys on the **user id**, not the token, so it was never a
 * per-device budget either: the web app, the phone and the desktop shell share
 * one, and reads on any other route in that group spend it.
 *
 * What limits this route instead is `App\Support\GuideBudget`, consulted in
 * the controller **after** the screen, which withholds the guide — the
 * expensive call, the one a language model sits behind — and nothing else. The
 * screen still runs, a flag is still raised, a stop still stops.
 */
Route::middleware('auth:sanctum')
    ->post('sessions/{session}/turns', [SessionController::class, 'turn']);

// Throttled as a whole. These are authenticated routes, so the limit is per
// account rather than per address — `ThrottleRequests` keys on the user id, so
// it is shared across every device somebody is signed in on — and it is
// generous: someone mid-session is doing something slow and human, not
// hammering an endpoint. The turns route is deliberately not among them; see
// above.
Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);
    Route::patch('me', [AuthController::class, 'updateMe']);
    Route::post('me/consent', [AuthController::class, 'consent']);
    // Erasing the account. Guarded by the password, and it takes everything.
    Route::delete('me', [AuthController::class, 'destroy']);

    Route::post('sessions', [SessionController::class, 'store']);
    // Before `{session}`, or the router would read "current" as an id. This is
    // how a client finds the session someone is in the middle of, so that
    // closing a tab does not lose it.
    Route::get('sessions/current', [SessionController::class, 'current']);
    Route::get('sessions/{session}', [SessionController::class, 'show']);
    // The turn is not here. It is the only way to advance a session and so the
    // only path safety screening has to cover, and it carries no rate limit at
    // all — declared above this group, with the reasoning.
    Route::post('sessions/{session}/stop', [SessionController::class, 'stop']);
    Route::post('sessions/{session}/rating', [SessionController::class, 'rate']);

    Route::get('journal', [JournalController::class, 'index']);
    Route::get('journal/{entry}', [JournalController::class, 'show']);
    Route::patch('journal/{entry}', [JournalController::class, 'update']);
    Route::delete('journal/{entry}', [JournalController::class, 'destroy']);

    Route::get('insights', [InsightsController::class, 'show']);

    // Who can read this user's shared sessions, and ending it. The client's
    // own, which is the point: a sharing rule the sharer cannot inspect or
    // revoke is a promise about someone else's behaviour.
    Route::get('me/coaches', [MyCoachController::class, 'index']);
    Route::delete('me/coaches/{coach}', [MyCoachController::class, 'destroy']);

    // Accepting is what creates a pairing, and only the client can do it.
    Route::post('invites/{token}/accept', [CoachInviteController::class, 'accept']);
});

// The admin console. A coach is not an admin: the queue holds what someone said
// at the moment they were not safe, which is not a coach's to read.
Route::middleware(['auth:sanctum', 'throttle:120,1', EnsureStaff::class])->prefix('admin')->group(function () {
    Route::get('overview', [AdminOverviewController::class, 'show']);
    Route::get('safety-flags', [SafetyFlagController::class, 'index']);
    Route::get('safety-flags/{flag}', [SafetyFlagController::class, 'show']);
    Route::post('safety-flags/{flag}/review', [SafetyFlagController::class, 'review']);

    // Accounts, and what they are allowed to be. The only way to make someone
    // a coach or an admin — and the most consequential thing here, because
    // `admin` grants the safety queue.
    Route::get('users', [AdminUserController::class, 'index']);
    Route::patch('users/{user}', [AdminUserController::class, 'update']);
    Route::get('role-changes', [AdminUserController::class, 'roleChanges']);

    // And what they are allowed to *use*. Its own route rather than a second
    // field on the one above, because that one carries the rules guarding the
    // safety queue and a plan has nothing to do with them. It is a grant, not
    // a purchase: there is no billing in this product at all.
    Route::patch('users/{user}/plan', [AdminUserController::class, 'updatePlan']);
    Route::get('plan-changes', [AdminUserController::class, 'planChanges']);

    Route::get('protocol-versions', [ProtocolVersionController::class, 'index']);
    Route::post('protocol-versions/draft', [ProtocolVersionController::class, 'openDraft']);
    Route::patch('protocol-versions/draft/steps/{stepId}', [ProtocolVersionController::class, 'editStep']);
    Route::patch('protocol-versions/draft/safety', [ProtocolVersionController::class, 'editSafety']);
    Route::post('protocol-versions/draft/publish', [ProtocolVersionController::class, 'publish']);
});

// The coach portal. "You only see sessions your clients choose to share" — the
// rule lives in App\Domain\CoachView, and every read here goes through it.
Route::middleware(['auth:sanctum', 'throttle:120,1', EnsureCoach::class])->prefix('coach')->group(function () {
    Route::get('clients', [CoachController::class, 'clients']);
    Route::get('clients/{client}', [CoachController::class, 'client']);
    Route::patch('clients/{client}', [CoachController::class, 'update']);

    // A coach may invite an address. They may not attach themselves to an
    // account: the pairing is created by the client accepting.
    Route::get('invites', [CoachInviteController::class, 'index']);
    Route::post('invites', [CoachInviteController::class, 'store']);
    Route::delete('invites/{invite}', [CoachInviteController::class, 'destroy']);
});
