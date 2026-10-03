<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\CalmerRating;
use App\Domain\ConsentItem;
use App\Domain\Plan;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Exceptions\SessionAlreadyEnded;
use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Models\GuidedSession;
use App\Services\ProtocolVersionService;
use App\Services\SessionService;
use App\Support\GuideBudget;
use Illuminate\Cache\RateLimiter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

final class SessionController extends Controller
{
    /**
     * Guided turns one caller may take in a minute.
     *
     * A number, not a configuration knob: it is a statement about human pace,
     * and the only reason to change it is a different idea of that.
     */
    public const GUIDED_TURNS_PER_MINUTE = 30;

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

        $kind = SessionKind::tryFrom($validated['kind'] ?? 'full') ?? SessionKind::Full;

        // The pricing page promises "3 full sessions a week" on Free. A promise
        // the server does not keep is the same problem in either direction, so
        // the plan decides here and the domain decides what the plan means.
        $plan = Plan::fromStored($user->plan);
        $used = $this->sessions->fullSessionsInWindow($user, Plan::ALLOWANCE_WINDOW_DAYS);
        $decision = $plan->mayStart($kind, $used);

        if ($decision['allowed'] !== true) {
            return response()->json([
                'message' => $decision['reason'] ?? 'Your plan does not allow another full session this week.',
                'limit' => $decision['limit'] ?? null,
                'usedThisWeek' => $used,
                // Always true, and said explicitly: someone who is upset should
                // never be told to come back next week.
                'quickStillAllowed' => true,
            ], Response::HTTP_PAYMENT_REQUIRED);
        }

        $row = $this->sessions->start($user, $kind);

        return (new SessionResource(
            $row,
            $this->versions->forSession($row),
            $this->sessions->openingLine($row),
        ))->response()->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * The session this user is in the middle of, or null.
     *
     * The first thing a client asks, so that closing a tab does not lose a
     * session: it stays open on the server, and before this nothing could reach
     * it again — while on a free plan it had already spent one of three full
     * sessions for the week.
     *
     * Carries the step's question too, so resuming reads the same as starting.
     */
    public function current(Request $request): JsonResponse
    {
        $open = $this->sessions->current($request->user());

        if ($open === null) {
            return response()->json(null);
        }

        return (new SessionResource(
            $open,
            $this->versions->forSession($open),
            $this->sessions->openingLine($open),
        ))->response();
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

        // Read rather than validated, deliberately. A rule here would refuse
        // the request before the screen had seen it — the same objection as a
        // rate limit in front of this route — so a `step` that is missing,
        // misspelled or not a string at all is treated as the client not
        // having said, and the turn proceeds to be screened. Only a step that
        // is recognised *and* has moved on refuses anything, and that refusal
        // happens inside the domain, after the screen.
        $said = $request->input('step');
        $answering = is_string($said) ? StepId::tryFrom($said) : null;

        if ($session->toDomain()->hasEnded()) {
            return response()->json(['message' => 'This session has ended.'], Response::HTTP_CONFLICT);
        }

        // The budget is resolved here and passed in, so it applies *after* the
        // screen. This route carries no `throttle` middleware on purpose: a
        // limit in front of it would refuse a request before anything had
        // looked at what was said, and the one request that must never be
        // refused is someone saying they are not safe.
        $budget = $this->guideBudget($request);

        try {
            $result = $this->sessions->takeTurn(
                $session,
                $validated['utterance'],
                guideAvailable: $budget->remaining() > 0,
                answering: $answering,
            );
        } catch (SessionAlreadyEnded $e) {
            // The check above is the fast path; this is the one that ran under
            // the row lock. Between the two, another request can have ended
            // this session — most often by screening a crisis — and that stop
            // is not something a turn already in flight may write away.
            return response()->json(['message' => $e->getMessage()], Response::HTTP_CONFLICT);
        }

        if ($result->stale) {
            // The answer was to a question this session has moved past, most
            // often because the client's last reply was lost on the way back
            // and it sent the same words again. Recording them against the
            // step now in progress would put the wrong words in the journal
            // and leave the real question unasked, so this refuses and the
            // client asks the server where the session actually is.
            //
            // The signal was screened and recorded first, and a flag was
            // raised if one was due: the words were said, and that they
            // answered an old question does not make them less of a
            // disclosure.
            return response()->json([
                'message' => 'That answer was for an earlier step. The session has moved on.',
            ], Response::HTTP_CONFLICT);
        }

        if ($result->throttled) {
            // The signal was screened and recorded; only the guide was
            // withheld. 429 and a human message, not a silent no-op.
            return response()->json([
                'message' => 'That was a lot of answers very quickly. Give it a moment and try again.',
                'retryAfter' => $budget->availableIn(),
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        // Charged only when the guide actually ran. A safety stop never
        // reaches it, so a session that stopped has nothing to pay for.
        if ($result->guideConsulted()) {
            $budget->hit();
        }

        return (new SessionResource(
            $session->refresh(),
            $this->versions->forSession($session),
            $result->say,
        ))->response();
    }

    /**
     * How many more guided turns this token may take this minute.
     *
     * Generous, because what it guards against is one client running the guide
     * flat out, not a person typing: a step takes a human seconds at least,
     * and 30 answers in a minute is not someone working through something that
     * upset them.
     */
    private function guideBudget(Request $request): GuideBudget
    {
        return new GuideBudget(
            app(RateLimiter::class),
            'guided-turns:'.($request->user()?->id ?? $request->ip()),
            perMinute: self::GUIDED_TURNS_PER_MINUTE,
        );
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
