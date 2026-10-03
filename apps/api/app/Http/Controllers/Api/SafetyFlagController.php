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

        $page = (clone $filtered)
            ->with('user')
            ->byUrgency()
            ->cursorPaginate(Paged::limit($request, 50));

        return response()->json(
            Paged::of($page, SafetyFlagResource::class, $request, (clone $filtered)->count()),
        );
    }

    public function show(SafetyFlag $flag): SafetyFlagResource
    {
        return new SafetyFlagResource($flag->load('user'));
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

        return new SafetyFlagResource($flag->refresh()->load('user'));
    }
}
