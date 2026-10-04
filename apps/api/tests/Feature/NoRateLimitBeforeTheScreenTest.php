<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Nothing refuses a turn before the risk screen has read it.
 *
 * `CLAUDE.md` states the rule and `routes/api.php` had a comment saying the
 * turns route was "deliberately not given a `throttle` middleware" — true of
 * the line and false of the route, because a group's middleware is the
 * route's, and the turn was inside a group carrying `throttle:120,1`.
 *
 * Measured before the route moved: 120 ordinary reads of `GET /me` spent the
 * budget, and the next turn — "I want to kill myself" — answered 429 with no
 * flag raised and the session still open. The screen never ran. Precisely the
 * failure the ordering exists to prevent, arriving through the shared
 * allowance rather than through this route's own middleware.
 *
 * It was never a per-device budget either: `ThrottleRequests` keys on the user
 * id, so the web app, the phone and the desktop shell share one, and a read on
 * any other route in that group spends it.
 *
 * Two tests, and both are needed. The first is the behaviour and would pass
 * against a generous enough limit; the second is the structure and goes red the
 * moment anybody puts the route back in a throttled group — which is how it
 * got there.
 */
final class NoRateLimitBeforeTheScreenTest extends TestCase
{
    use RefreshDatabase;

    /** More than `throttle:120,1` allows, so the budget is certainly spent. */
    private const READS = 130;

    private function consentedUser(): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
    }

    public function test_a_spent_request_allowance_does_not_silence_the_screen(): void
    {
        // The array store, so this counts rather than inheriting whatever the
        // suite's cache happens to hold.
        config(['cache.default' => 'array']);

        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;

        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');

        // Ordinary reads, on another route in the throttled group. This is a
        // person with the app open on two devices, or a client that pages a
        // long journal — not an attack.
        $refused = 0;
        for ($i = 0; $i < self::READS; $i++) {
            if ($this->withToken($token)->getJson('/api/me')->status() === 429) {
                $refused++;
            }
        }
        $this->assertGreaterThan(
            0,
            $refused,
            'the allowance was never spent, so this test proves nothing about what happens when it is',
        );

        $turn = $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'I want to kill myself',
            'step' => 'notice',
        ]);

        // Not 429. The screen read it.
        $turn->assertOk();

        $session = GuidedSession::query()->findOrFail($id);
        $this->assertSame('safety_stop', $session->end_reason?->value);
        $this->assertSame(1, SafetyFlag::query()->where('user_id', $user->id)->count());

        // And the helplines are there, which is the whole point of not
        // refusing it.
        $this->assertNotSame([], $turn->json('helplines'));
    }

    /**
     * And the route carries no throttle at all, asserted on the route itself.
     *
     * The behavioural test above would pass against a limit of a million. This
     * is the one that catches the route being moved back into a group, which
     * is how it came to carry one in the first place — nobody added a
     * `throttle` to this line, they added the line to a throttled group.
     */
    public function test_the_turns_route_carries_no_throttle_middleware(): void
    {
        $route = collect(Route::getRoutes()->getRoutes())->first(
            fn ($r) => $r->uri() === 'api/sessions/{session}/turns' && in_array('POST', $r->methods(), true),
        );

        $this->assertNotNull($route, 'the turns route is gone, which is a bigger problem than this test');

        foreach ($route->gatherMiddleware() as $middleware) {
            $name = is_string($middleware) ? $middleware : $middleware::class;

            $this->assertStringNotContainsString('throttle', $name);
            $this->assertNotSame(ThrottleRequests::class, $name);
            $this->assertStringNotContainsString(ThrottleRequests::class, $name);
        }
    }
}
