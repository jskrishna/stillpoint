<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The headers an API's own origin needs, set by the application.
 *
 * Three of these were in `deploy/nginx.conf` and nowhere else, which is the
 * one-place argument this repository makes about `describe()` and about having
 * one API client: a rule that lives in the edge holds only for that edge.
 * Measured against the running API — `curl -I` — every response from
 * `artisan serve` carried no security header at all, which is the development
 * container, the end-to-end stack, and any deployment whose terminator is not
 * this nginx. The web app's own policy is twelve directives long and built
 * from `NEXT_PUBLIC_API_URL`; the origin it talks to had none.
 *
 * **`default-src 'none'` is the one that was missing everywhere.** This origin
 * serves JSON and nothing else: no page, no script, no stylesheet, no
 * `frame-ancestors` worth allowing. A policy that forbids everything is the
 * correct policy for it, and it is what makes `nosniff` more than a hint — a
 * browser that is talked into rendering a JSON response as a document finds a
 * document that may not load or run anything. `routes/web.php` is empty for a
 * related reason (`NoWebSessionsTest`), so there is no page here to break.
 *
 * `X-Frame-Options: DENY` is kept beside `frame-ancestors` deliberately: the
 * two say the same thing, and the older header is the one a browser without
 * CSP support honours.
 *
 * And `X-Powered-By` goes, which `deploy/php.ini` turns off with
 * `expose_php=Off` in the deployment and nothing turns off anywhere else. It
 * is only version disclosure — `PHP/8.3.6`, measured — but a version is the
 * first thing an automated scan reads. Note how it has to go: see the comment
 * at the call, because the obvious way is a no-op that reads as a fix.
 */
final class SecurityHeaders
{
    /** What this origin is allowed to do, which is nothing. */
    private const POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Content-Security-Policy', self::POLICY);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        // `header_remove`, not `$response->headers->remove()`. PHP adds this
        // one itself when `expose_php` is on, at the SAPI's own header list
        // rather than through the response — so taking it off the response bag
        // is a no-op and looks like it worked. Measured against `artisan
        // serve`: the header was still `PHP/8.3.6`. `deploy/php.ini` sets
        // `expose_php=Off`, which is the real fix and reaches only the
        // deployment; this reaches every other way of running the app.
        $response->headers->remove('X-Powered-By');
        if (! headers_sent()) {
            header_remove('X-Powered-By');
        }

        return $response;
    }
}
