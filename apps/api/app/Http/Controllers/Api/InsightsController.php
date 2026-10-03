<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Insights;
use App\Http\Controllers\Controller;
use App\Services\InsightsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class InsightsController extends Controller
{
    public function __construct(private readonly InsightsService $insights) {}

    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'windowDays' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ]);

        $result = $this->insights->forUser(
            $request->user(),
            $validated['windowDays'] ?? Insights::DEFAULT_WINDOW_DAYS,
        );

        return response()->json([
            'windowDays' => $result->windowDays,
            'sessions' => $result->sessions,
            'feltCalmer' => $result->feltCalmer,
            'reachedFinalStep' => $result->reachedFinalStep,
            'feelings' => array_map(fn (array $f) => [
                'id' => $f['id']->value,
                'label' => $f['label'],
                'count' => $f['count'],
            ], $result->feelings),
            'recurringBelief' => $result->recurringBelief,
        ]);
    }
}
