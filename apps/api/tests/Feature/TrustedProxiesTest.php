<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * Whose address the rate limiters are counting.
 *
 * `config/trustedproxy.php` has the argument; this is the consequence, which
 * is the only reason that file exists. Two of the three `guessable` buckets
 * key on `$request->ip()`, and behind a TLS terminator that is the
 * terminator's address for every request unless the proxy is trusted.
 *
 * Both halves are pinned because both are wrong in production and neither is
 * visible from a green suite: `deploy/nginx.conf` listens on port 80 and
 * assumes something in front holds the certificate, so the documented
 * topology is the one where this bites.
 */
final class TrustedProxiesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RateLimiter::clear('guessable');
        TrustProxies::at([]);
    }

    protected function tearDown(): void
    {
        // Static, so it would otherwise leak into every test that runs after.
        TrustProxies::at([]);

        parent::tearDown();
    }

    /** One failed sign-in attempt for one address, from one claimed address. */
    private function attempt(string $forwardedFor): int
    {
        return $this->withHeaders(['X-Forwarded-For' => $forwardedFor])
            ->postJson('/api/auth/login', [
                'email' => 'locked-out@example.com',
                'password' => 'not-the-password-either',
            ])->getStatusCode();
    }

    /**
     * The tight bucket is keyed by the account **and** the address, so that
     * exhausting it locks out the machine doing the guessing and nobody else.
     * With the proxy untrusted every request claims the same address, so
     * seven attempts from seven different machines share one bucket — and the
     * person whose address it is cannot sign in.
     *
     * This is the state the API is in today, and it is correct while nginx is
     * the edge: there is no proxy, so there is nothing to believe.
     */
    public function test_an_untrusted_proxys_forwarded_address_is_ignored(): void
    {
        $seen = [];
        for ($i = 0; $i < 8; $i++) {
            $seen[] = $this->attempt("203.0.113.{$i}");
        }

        $this->assertContains(
            429,
            $seen,
            'Eight attempts claiming eight different addresses shared one bucket, '
                .'which is what an untrusted proxy means. Statuses: '.implode(',', $seen),
        );
    }

    /**
     * Named as a proxy, the forwarded address is the one that counts, so each
     * machine gets its own bucket and one of them cannot lock out the rest.
     */
    public function test_a_trusted_proxys_forwarded_address_is_the_one_counted(): void
    {
        TrustProxies::at(['127.0.0.1']);

        $seen = [];
        for ($i = 0; $i < 8; $i++) {
            $seen[] = $this->attempt("203.0.113.{$i}");
        }

        $this->assertNotContains(
            429,
            $seen,
            'Each claimed address should have had its own bucket. Statuses: '
                .implode(',', $seen),
        );
    }

    /**
     * The looser per-account bucket is 30 a minute across every address, so a
     * trusted proxy does not turn the limit off — it only stops one person's
     * attempts counting against another's.
     */
    public function test_a_trusted_proxy_does_not_uncap_one_account(): void
    {
        TrustProxies::at(['127.0.0.1']);

        $seen = [];
        for ($i = 0; $i < 34; $i++) {
            $seen[] = $this->attempt('203.0.113.'.(string) $i);
        }

        $this->assertContains(
            429,
            $seen,
            'Thirty-four attempts on one account from thirty-four addresses should '
                .'still hit the per-account cap.',
        );
    }

    /**
     * And the configuration key is the one the middleware reads.
     *
     * The test above uses `TrustProxies::at()`, which proves the mechanism and
     * says nothing about `config/trustedproxy.php` — the file whose whole
     * purpose is to be what a deployment sets. `proxies()` returns the static
     * value first and falls through to this key when it is empty, so this is
     * the path `TRUSTED_PROXIES` actually takes.
     */
    public function test_the_configuration_key_is_what_a_deployment_sets(): void
    {
        config(['trustedproxy.proxies' => ['127.0.0.1']]);

        $seen = [];
        for ($i = 0; $i < 8; $i++) {
            $seen[] = $this->attempt("203.0.113.{$i}");
        }

        $this->assertNotContains(
            429,
            $seen,
            'Setting `trustedproxy.proxies` alone should have been enough. Statuses: '
                .implode(',', $seen),
        );
    }

    /** The default is to trust nothing, which is what ships. */
    public function test_nothing_is_trusted_unless_it_is_configured(): void
    {
        $this->assertNull(
            config('trustedproxy.proxies'),
            'TRUSTED_PROXIES is unset in the test environment, so the config must '
                .'resolve to null rather than to a string or an empty array.',
        );
    }
}
