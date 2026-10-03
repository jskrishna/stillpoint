<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Admin only.
 *
 * Answers 404 rather than 403, so the console's routes do not confirm their own
 * existence to someone who may not use them.
 */
final class EnsureStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user !== null && $user->isStaff(), Response::HTTP_NOT_FOUND);

        return $next($request);
    }
}
