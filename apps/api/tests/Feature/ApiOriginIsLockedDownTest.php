<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The headers on this origin, which had none.
 *
 * Three of the four were in `deploy/nginx.conf` and only there. Measured with
 * `curl -I` against `artisan serve`: no security header on any response, which
 * covers the development container, the end-to-end stack and any deployment
 * whose terminator is not that nginx. They are the application's now, and this
 * is what says so.
 *
 * The fourth, `Content-Security-Policy`, was nowhere. This origin serves JSON
 * and nothing else, so `default-src 'none'` is not a compromise — it is the
 * accurate description, and it is what gives `nosniff` something to fall back
 * on if a browser is talked into treating a response as a document.
 */
final class ApiOriginIsLockedDownTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string}> */
    public static function headers(): array
    {
        return [
            'nothing may load or run' => [
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            ],
            'no content-type sniffing' => ['X-Content-Type-Options', 'nosniff'],
            'no framing, for a browser without CSP' => ['X-Frame-Options', 'DENY'],
            'no referrer' => ['Referrer-Policy', 'no-referrer'],
        ];
    }

    #[DataProvider('headers')]
    public function test_a_signed_in_response_carries_the_header(string $header, string $value): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/me')
            ->assertOk()
            ->assertHeader($header, $value);
    }

    /**
     * And a refusal carries them too.
     *
     * The exception handler builds its own response, so a middleware appended
     * to the group is the only placement that reaches both. A 401 is the one
     * an unauthenticated caller sees most, and it is the response a browser is
     * most likely to be holding when something goes wrong.
     */
    #[DataProvider('headers')]
    public function test_a_401_carries_the_header(string $header, string $value): void
    {
        $this->getJson('/api/me')
            ->assertUnauthorized()
            ->assertHeader($header, $value);
    }

    /**
     * And the version is not announced.
     *
     * `deploy/php.ini` sets `expose_php=Off` for the deployment and nothing
     * sets it anywhere else, so every other way of running this app answered
     * `X-Powered-By: PHP/8.3.6`. Only version disclosure, and the first thing
     * an automated scan reads.
     */
    public function test_the_php_version_is_not_announced(): void
    {
        $this->getJson('/api/me')->assertHeaderMissing('X-Powered-By');
    }
}
