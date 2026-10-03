<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Sanctum;

return [

    /*
    |--------------------------------------------------------------------------
    | Routes
    |--------------------------------------------------------------------------
    |
    | False, so Sanctum registers no `sanctum/csrf-cookie` route.
    |
    | That route exists for cookie mode, which this API does not use: every
    | surface authenticates with a bearer token. What it does use is the `web`
    | middleware group, which starts a session — and with
    | `SESSION_DRIVER=database` a session is a row holding the caller's IP
    | address and user-agent. So anybody could call it, repeatedly, and have
    | the product store those, for an endpoint nothing here calls.
    |
    | It was the last web route after the skeleton's `GET /` went; see
    | `routes/web.php`. Cookie mode is still the right answer for the browser
    | client and `apps/web/src/lib/api.ts` says so — **turn this back on in the
    | same change that adopts it**, because without this route the browser
    | cannot get a CSRF cookie and the whole flow fails at the first request.
    |
    */

    'routes' => false,

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following domains / hosts will receive stateful API
    | authentication cookies. Typically, these should include your local
    | and production domains which access your API via a frontend SPA.
    |
    */

    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
        '%s%s',
        'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1',
        Sanctum::currentApplicationUrlWithPort(),
        // Sanctum::currentRequestHost(),
    ))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued token will be
    | considered expired. This will override any values set in the token's
    | "expires_at" attribute, but first-party sessions are not affected.
    |
    */

    /*
     * Thirty days.
     *
     * Laravel's default is null, which means a token works forever. A token for
     * this product reads somebody's journal, and one that has leaked — from a
     * backup, a stolen laptop, an XSS against the `localStorage` the web client
     * documents as its known weakness — would keep working for as long as the
     * account existed.
     *
     * Thirty days rather than something shorter because there is no refresh
     * flow: expiry means signing in again, and a phone that asks for a password
     * every week is a phone someone stops opening when they are upset. The real
     * answer is Sanctum's cookie mode with a refresh, and that is a change to
     * how every surface authenticates rather than a number here.
     *
     * Expired tokens are rejected whether or not they are tidied up;
     * `sanctum:prune-expired` is housekeeping and wants a scheduler.
     */
    'expiration' => (int) env('SANCTUM_TOKEN_MINUTES', 60 * 24 * 30),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
