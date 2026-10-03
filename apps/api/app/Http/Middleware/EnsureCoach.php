<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Coaches only.
 *
 * An admin is not a coach either: these two roles see different things, and
 * holding one does not imply the other. 404 rather than 403, for the same
 * reason as the console — the route does not confirm its own existence.
 */
final class EnsureCoach
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user !== null && $user->isCoach(), Response::HTTP_NOT_FOUND);

        return $next($request);
    }
}
