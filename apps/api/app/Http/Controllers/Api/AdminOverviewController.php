<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AdminOverviewService;
use Illuminate\Http\JsonResponse;

/** The console's overview: how the protocol is working, not what anyone said. */
final class AdminOverviewController extends Controller
{
    public function __construct(private readonly AdminOverviewService $overview) {}

    public function show(): JsonResponse
    {
        return response()->json($this->overview->forWindow());
    }
}
