<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\SafetyCategory;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * "Get help" stops the session and shows a number.
 *
 * Both session screens carry that button on every step, and for most of this
 * product's life it did neither. Before the web app was pointed at this API it
 * applied a `high` safety signal directly: the session ended and the pause
 * came up with the helplines on it. When the server became the enforcement,
 * the button was changed to send a sentence ("I need help, I do not feel
 * safe") as an ordinary turn, with a comment saying the server would screen it
 * like any other answer. The screen grades that sentence `none`. Measured in
 * both languages: no stop, no flag, no helplines, and at step 1 the sentence
 * became the journal entry's title and "what happened" while the guide moved
 * on to step 2.
 *
 * So the one control on the screen that exists for somebody who is not safe
 * recorded their request as an answer to a question. No test pressed it.
 *
 * It is a route of its own because a press is not an utterance: there is
 * nothing to screen, and whether it stops must not depend on a phrase list.
 * It is declared beside the turns route, outside the throttled group, for that
 * route's reason: the request a rate limit would refuse here is somebody
 * asking for help.
 */
final class AskingForHelpTest extends TestCase
{
    use RefreshDatabase;

    private function consentedUser(): User
    {
        return User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
    }

    public function test_it_stops_the_session_and_returns_this_countrys_numbers(): void
    {
        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');

        $help = $this->withToken($token)->postJson("/api/sessions/{$id}/help")->assertOk();

        $help->assertJsonPath('ended', true);
        $help->assertJsonPath('endReason', 'safety_stop');
        $this->assertSame(
            ['988', '1-866-277-3553', '911'],
            array_column($help->json('safety.helplines'), 'number'),
        );

        // Terminal, like any other safety stop: the next turn is refused.
        $this->withToken($token)
            ->postJson("/api/sessions/{$id}/turns", ['utterance' => 'never mind', 'step' => 'notice'])
            ->assertStatus(409);
    }

    public function test_it_is_in_the_queue_with_nothing_put_in_the_persons_mouth(): void
    {
        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->json('id');

        $this->withToken($token)->postJson("/api/sessions/{$id}/help")->assertOk();

        // A session is never recorded as stopped without the flag that
        // stopped it. This one has no words in it, because none were said:
        // the excerpt is what a person typed, and a sentence written by the
        // button is not that.
        $flag = SafetyFlag::query()->where('guided_session_id', $id)->sole();
        $this->assertSame('high', $flag->level->value);
        $this->assertSame(SafetyCategory::AskedForHelp, $flag->category);
        $this->assertSame('', $flag->excerpt);
        $this->assertSame('open', $flag->status);
        $this->assertStringContainsString('Helplines shown', $flag->outcome);
    }

    public function test_nothing_is_written_to_the_journal(): void
    {
        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->json('id');

        // An answer first, so there is something a journal row could have held.
        $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();

        $this->withToken($token)->postJson("/api/sessions/{$id}/help")->assertOk();

        $this->assertSame(0, JournalEntry::query()->where('user_id', $user->id)->count());
        // And the request itself is nowhere in what the session recorded.
        $data = GuidedSession::query()->findOrFail($id)->toDomain()->data;
        $this->assertSame('My manager dismissed my work in front of the team', $data->whatHappened);
    }

    public function test_a_session_that_already_ended_is_left_as_it_ended(): void
    {
        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->json('id');
        $this->withToken($token)->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'My manager dismissed my work in front of the team',
            'step' => 'notice',
        ])->assertOk();
        $this->withToken($token)->postJson("/api/sessions/{$id}/stop")->assertOk();

        // An ended session is terminal, so this cannot relabel it. It still
        // answers 200 with the session as it is, and the screen has the
        // numbers already: it does not wait for this to show them.
        $help = $this->withToken($token)->postJson("/api/sessions/{$id}/help")->assertOk();

        $help->assertJsonPath('endReason', 'user_stopped');
        $this->assertSame(0, SafetyFlag::query()->where('guided_session_id', $id)->count());
    }

    public function test_pressing_it_twice_is_one_stop_and_one_flag(): void
    {
        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->json('id');

        $this->withToken($token)->postJson("/api/sessions/{$id}/help")->assertOk();
        $this->withToken($token)->postJson("/api/sessions/{$id}/help")
            ->assertOk()
            ->assertJsonPath('endReason', 'safety_stop');

        $this->assertSame(1, SafetyFlag::query()->where('guided_session_id', $id)->count());
    }

    public function test_a_spent_request_allowance_does_not_refuse_it(): void
    {
        config(['cache.default' => 'array']);

        $user = $this->consentedUser();
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->json('id');

        $refused = 0;
        for ($i = 0; $i < 130; $i++) {
            if ($this->withToken($token)->getJson('/api/me')->status() === 429) {
                $refused++;
            }
        }
        $this->assertGreaterThan(0, $refused, 'the allowance was never spent, so this proves nothing');

        $this->withToken($token)->postJson("/api/sessions/{$id}/help")
            ->assertOk()
            ->assertJsonPath('endReason', 'safety_stop');
    }

    public function test_the_route_carries_no_throttle_middleware(): void
    {
        // The structure, for the reason the turns route's test gives: nobody
        // adds a throttle to this line, they add the line to a throttled group.
        $route = collect(Route::getRoutes()->getRoutes())->first(
            fn ($r) => $r->uri() === 'api/sessions/{session}/help' && in_array('POST', $r->methods(), true),
        );

        $this->assertNotNull($route, 'the help route is gone');

        $names = array_map(
            fn ($middleware) => is_string($middleware) ? $middleware : $middleware::class,
            $route->gatherMiddleware(),
        );

        $this->assertContains('auth:sanctum', $names);
        foreach ($names as $name) {
            $this->assertStringNotContainsString('throttle', $name);
            $this->assertStringNotContainsString(ThrottleRequests::class, $name);
        }
    }
}
