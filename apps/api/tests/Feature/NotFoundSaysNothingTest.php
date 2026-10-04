<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A 404 from route-model binding must not say what it could not find.
 *
 * Laravel's message is "No query results for model [App\Models\JournalEntry]
 * 01m43t9qg569tsgrz0cya5kv5a", and `APP_DEBUG=false` does not change it — a
 * `NotFoundHttpException` is an `HttpExceptionInterface`, so the framework
 * keeps its own wording in production. That is asserted here with debug
 * explicitly off, because the development default is on and a test that only
 * passed under debug would be testing the wrong deployment.
 *
 * It matters because `describe()` on both surfaces prefers the API's own
 * message over a generic one. That preference is right — the generic lines
 * were being shown in place of refusals the server had explained — so the
 * wording has to be fit to show, and a PHP class name and a database id are
 * not. Measured on the settings screen: a double-tapped "Delete everything"
 * sent a second delete for an entry the first had removed, and the journal
 * page said so in Laravel's words.
 *
 * The empty message is not a gap. `EnsureStaff` and `authorizePairing()`
 * already `abort(404)` with none, and `describe()` has the sentence for it.
 */
final class NotFoundSaysNothingTest extends TestCase
{
    use RefreshDatabase;

    private const GONE = '01m43t9qg569tsgrz0cya5kv5a';

    protected function setUp(): void
    {
        parent::setUp();
        // The deployment's setting, not the container's.
        config(['app.debug' => false]);
    }

    public function test_a_missing_journal_entry_is_not_described(): void
    {
        $response = $this->actingAs(User::factory()->create())
            ->deleteJson('/api/journal/'.self::GONE);

        $response->assertNotFound();
        $response->assertExactJson(['message' => '']);
    }

    /**
     * Every bound route, not only the one that was found.
     *
     * The fix is one renderer, so this would be belt and braces if the routes
     * were the same shape — and they are not: these span four models, two of
     * them behind `EnsureStaff` and one behind `EnsureCoach`, so a middleware
     * that answered 404 first would make the assertion pass for the wrong
     * reason. An admin is used so the console routes are reached.
     */
    public function test_no_bound_route_names_the_model_it_could_not_find(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $routes = [
            ['DELETE', '/api/journal/'.self::GONE],
            ['GET', '/api/journal/'.self::GONE],
            ['GET', '/api/sessions/'.self::GONE],
            ['POST', '/api/sessions/'.self::GONE.'/turns'],
            ['POST', '/api/admin/safety-flags/'.self::GONE.'/review'],
            ['PATCH', '/api/admin/users/'.self::GONE],
            ['PATCH', '/api/admin/users/'.self::GONE.'/plan'],
            ['DELETE', '/api/me/coaches/'.self::GONE],
        ];

        foreach ($routes as [$method, $path]) {
            $response = $this->actingAs($admin)->json($method, $path);

            $this->assertSame(404, $response->status(), "$method $path");
            $message = $response->json('message');
            $this->assertIsString($message, "$method $path");
            $this->assertStringNotContainsString('App\\Models', $message, "$method $path");
            $this->assertStringNotContainsString(self::GONE, $message, "$method $path");
            $this->assertStringNotContainsString('No query results', $message, "$method $path");
        }
    }

    /**
     * A 404 the application words itself keeps its words.
     *
     * The renderer looks for the `ModelNotFoundException` the router wraps, so
     * it cannot swallow a sentence somebody chose. Nothing in the API does
     * this today; this is what says the next one will work.
     */
    public function test_a_deliberate_404_keeps_its_own_message(): void
    {
        Route::middleware('api')->get('/api/test-abort-with-words', function (): never {
            abort(404, 'That invitation has already been used.');
        });

        $response = $this->getJson('/api/test-abort-with-words');

        $response->assertNotFound();
        $response->assertExactJson(['message' => 'That invitation has already been used.']);
    }

    /**
     * And a method the route does not take.
     *
     * "The GET method is not supported for route api/journal/01m43t….
     * Supported methods: PATCH, DELETE." Nothing in a shipped client sends
     * one, so this is consistency with the two above rather than a measured
     * user-facing bug — and the one place it becomes reachable is a client
     * built against a different version of this API, which is exactly who
     * would be shown it.
     */
    public function test_a_wrong_method_is_not_described(): void
    {
        $response = $this->actingAs(User::factory()->create())
            ->getJson('/api/admin/protocol-versions/draft/publish');

        $this->assertSame(405, $response->status());
        $response->assertExactJson(['message' => '']);
    }

    /**
     * A path that matches no route says nothing either.
     *
     * This one was found by writing the test above: `/api/admin/users/{id}/role`
     * is not a route — the role change is a `PATCH` on the user itself — so the
     * assertion came back with "The route api/admin/users/01m43t.../role could
     * not be found." A typo in a test is cheap; the same 404 reaches a person
     * when a shipped phone app meets a route the API has renamed, and that is
     * the sentence it would show them.
     */
    public function test_an_unrouted_path_is_not_echoed_back(): void
    {
        $response = $this->actingAs(User::factory()->create())
            ->patchJson('/api/admin/users/'.self::GONE.'/role');

        $response->assertNotFound();
        $response->assertExactJson(['message' => '']);
    }
}
