<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\Paged;
use App\Http\Resources\SafetyFlagResource;
use App\Models\SafetyFlag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The safety queue.
 *
 * This is the other half of the risk screen: the screen is tuned for recall
 * because a reviewer reads what it catches, and this is where they read it. A
 * screen with no queue behind it is just a session-stopper.
 *
 * Ordered most severe first by the model's own scope, so the worst flag is
 * always the one a reviewer meets first — the ordering is the domain's, not a
 * sort written into a table.
 */
final class SafetyFlagController extends Controller
{
    /**
     * A page of the queue, most severe first.
     *
     * Paged rather than capped. It was capped at 200, which is the worse
     * failure of the two: a grown queue would simply stop showing flags, and
     * the ones it stopped showing would be the ones nobody looked at.
     */
    public function index(Request $request): JsonResponse
    {
        $filtered = SafetyFlag::query();

        // Open by default: the queue is work to be done, not a log.
        if ($request->query('status', 'open') !== 'all') {
            $filtered->where('status', $request->string('status', 'open')->toString());
        }

        /*
         * No `->with('user')`, and it was there.
         *
         * `SafetyFlagResource` prints `UserHandle::for($flag->user_id)` — a
         * salted hash of an integer — and nothing in the application reads
         * `$flag->user` at all. The eager load therefore fetched the whole
         * `users` row for every flag on the page, name, address and password
         * hash included, to render the one screen whose rule is that the
         * console never names anyone. Measured:
         * `select * from "users" where "users"."id" in (1, 2)`.
         *
         * This is `CoachAttention`'s standard one screen over — that read
         * selects two timestamp columns rather than the row, and the reason
         * given there holds here: a request that does not ask for the column
         * is a rule, where asking and not using it is a habit. On this screen
         * the habit costs more, because the handle exists exactly so that
         * whoever reads somebody's crisis words cannot also read their name.
         */
        $page = (clone $filtered)
            ->byUrgency()
            ->cursorPaginate(Paged::limit($request, 50));

        return response()->json(
            Paged::of($page, SafetyFlagResource::class, $request, (clone $filtered)->count()),
        );
    }

    /**
     * One flag.
     *
     * No `->load('user')` either, for the reason in `index()` — measured the
     * same way, `select * from "users" where "users"."id" in (1)`.
     *
     * **And no client reaches this route.** `packages/client` has
     * `safetyFlags()` and `reviewSafetyFlag()` and no method for a single
     * read; the queue's detail pane renders the row it already has, since the
     * list and this route share one resource. It is kept because a reviewer
     * deep-linked to a flag is the obvious next thing this screen grows, and
     * it is noted because an unreached route is one whose guard no browser
     * exercises.
     */
    public function show(SafetyFlag $flag): SafetyFlagResource
    {
        return new SafetyFlagResource($flag);
    }

    /**
     * Marks a flag reviewed.
     *
     * Reviewing is one-way and records who did it. There is no un-review: the
     * fact that a person looked at this is part of the record.
     */
    public function review(Request $request, SafetyFlag $flag): SafetyFlagResource
    {
        $flag->markReviewed($request->user())->save();

        // `refresh()` for the stored `reviewed_at` and `status`, and no
        // `load('user')` — the third of the three, and the one a sweep of the
        // two reads would have missed. See `index()`.
        return new SafetyFlagResource($flag->refresh());
    }
}
