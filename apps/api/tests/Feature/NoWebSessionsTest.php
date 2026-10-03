<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * This API starts no sessions, and therefore stores nobody's IP address.
 *
 * It used to. The skeleton's `GET /` returned Laravel's `welcome` view, a web
 * route runs the `web` middleware group, that group starts a session, and
 * `SESSION_DRIVER=database` writes a row holding the caller's IP address and
 * user-agent. So every request to the API's root had the product store those —
 * for a marketing page it does not serve and a session nothing ever reads,
 * since `user_id` is always null with authentication being bearer tokens.
 *
 * Not a vulnerability; data collected for no purpose, in a product that will
 * not link a font from a third party. The route is gone, and this is what
 * stops it or anything like it coming back: a web route is easy to add and the
 * session it starts is invisible.
 */
final class NoWebSessionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_api_has_no_web_routes(): void
    {
        $web = array_values(array_filter(
            Route::getRoutes()->getRoutes(),
            static fn ($route) => in_array('web', $route->gatherMiddleware(), true),
        ));

        $this->assertSame(
            [],
            array_map(static fn ($route) => $route->uri(), $web),
            'a web route starts a session, which writes an IP address and a user-agent',
        );
    }

    public function test_the_root_is_not_a_page(): void
    {
        $this->get('/')->assertNotFound();
    }

    public function test_no_request_writes_a_session_row(): void
    {
        $this->get('/')->assertNotFound();
        // The health check, which the deployment's nginx container polls every
        // five seconds. A session row per poll would be a slow leak of nothing
        // useful.
        $this->get('/up')->assertOk();
        $this->getJson('/api/me')->assertUnauthorized();

        $this->assertSame(0, DB::table('sessions')->count());
    }
}
