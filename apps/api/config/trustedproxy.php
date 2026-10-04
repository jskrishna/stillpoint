<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Which proxies this API believes about the client's address
|--------------------------------------------------------------------------
|
| `Illuminate\Http\Middleware\TrustProxies` reads this key, and until this
| file existed it resolved to null: no proxy was trusted, so
| `X-Forwarded-For` was ignored and `$request->ip()` was whatever opened the
| TCP connection.
|
| **That is the right answer for the stack as it ships and the wrong one the
| moment anything sits in front of it**, which `LAUNCH.md` item 3 says will
| happen, because `deploy/nginx.conf` listens on port 80 and assumes
| something else holds the certificate.
|
| Why it matters here rather than in general: this API generates no URLs —
| the password-reset link and the invitation link both come from
| `APP_FRONTEND_URL`, not from `url()` — so an untrusted proxy costs nothing
| in link generation. What it costs is the rate limiters.
| `AppServiceProvider`'s `guessable` limiter keys two of its three buckets on
| `$request->ip()`, and behind a terminator every request carries the
| terminator's address:
|
|   - `Limit::perMinute(60)->by('ip:'.$request->ip())` stops being a ceiling
|     on one machine and becomes **sixty requests a minute for the whole
|     product**, across sign-in, registration, password recovery and opening
|     an invitation.
|   - `Limit::perMinute(6)->by($target.'|ip:'.$request->ip())` collapses to
|     six a minute per account from anywhere, which is the innocent lockout
|     that limit was reshaped to prevent: anybody who knows an address can
|     keep that person out of their own journal indefinitely. An address is
|     not a secret — a coach types a client's into an invitation.
|
| So this is configuration rather than a fixed value, because the answer is a
| fact about a deployment's topology and cannot be guessed from here.
|
| **Set `TRUSTED_PROXIES` to the terminator's address the moment one exists.**
| A comma-separated list, or `*`. The default is empty, which trusts nothing:
| of the two ways to be wrong, failing closed locks real people out of their
| journals and failing open lets a forged header walk past the per-IP ceiling
| — which is explicitly the weakest of the three limits, the per-account ones
| being the defence against guessing. Neither is acceptable in a deployment
| that has a terminator and has not set this.
|
| `TrustedProxiesTest` pins both halves: ignored when nothing is trusted, and
| honoured when the proxy is named.
|
*/

$proxies = env('TRUSTED_PROXIES');

return [
    'proxies' => match (true) {
        ! is_string($proxies) || trim($proxies) === '' => null,
        trim($proxies) === '*' => '*',
        default => array_values(array_filter(array_map('trim', explode(',', $proxies)))),
    },
];
