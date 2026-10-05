<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Half a character in an answer does not get the answer refused.
 *
 * A JavaScript string can hold half of a surrogate pair, and `JSON.stringify`
 * writes it out as an escape. PHP's `json_decode` rejects that body whole, so
 * Laravel saw a request with no fields in it and the turns route answered 422
 * "The utterance field is required." Measured with a statement of intent
 * followed by half an emoji: 422, no flag, the session still open. The screen
 * never ran, which makes this the same refusal as `max:5000` was, with a rarer
 * trigger: an emoji cut in half by a field's length limit, a paste, or a
 * keyboard's backspace.
 *
 * A raw byte that is not UTF-8 does the same thing from a client that is not a
 * browser. Both are repaired here, on this route only, by putting U+FFFD where
 * the broken character was, and then the turn is an ordinary turn.
 */
final class ABrokenCharacterIsNotARefusalTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function bodies(): array
    {
        return [
            // Written out as JSON text: backslash, u, four hex digits.
            'half a surrogate pair, the high half' => ['{"utterance":"I want to kill myself \\ud83d","step":"notice"}'],
            'the low half' => ['{"utterance":"\\ude22 I want to kill myself","step":"notice"}'],
            'two high halves in a row' => ['{"utterance":"I want to kill myself \\ud83d\\ud83d","step":"notice"}'],
            'a byte that is not UTF-8' => ["{\"utterance\":\"I want to kill myself \xff\",\"step\":\"notice\"}"],
        ];
    }

    #[DataProvider('bodies')]
    public function test_the_turn_is_read_and_the_session_stops(string $body): void
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');

        $turn = $this->call('POST', "/api/sessions/{$id}/turns", [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
        ], $body);

        $turn->assertOk();
        $this->assertSame('safety_stop', GuidedSession::query()->findOrFail($id)->end_reason?->value);
        $this->assertCount(3, $turn->json('safety.helplines'));

        // What the reviewer reads has a replacement character where the broken
        // one was, and every word around it.
        $excerpt = SafetyFlag::query()->where('user_id', $user->id)->sole()->excerpt;
        $this->assertStringContainsString('I want to kill myself', $excerpt);
        $this->assertTrue(mb_check_encoding($excerpt, 'UTF-8'));
    }

    public function test_a_whole_emoji_and_an_escaped_backslash_are_left_alone(): void
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');

        // A valid pair, and the six characters `\ud83d` typed as text, which
        // JSON writes with the backslash doubled. Neither is broken, so
        // neither is touched, and the body is repaired only because of the
        // half pair at the end.
        $body = '{"utterance":"My manager \\ud83d\\ude22 wrote \\\\ud83d in the review \\ud83d","step":"notice"}';

        $this->call('POST', "/api/sessions/{$id}/turns", [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
        ], $body)->assertOk();

        $this->assertSame(
            "My manager \u{1F622} wrote \\ud83d in the review \u{FFFD}",
            GuidedSession::query()->findOrFail($id)->toDomain()->data->whatHappened,
        );
    }

    public function test_a_body_that_is_not_json_at_all_is_still_a_422(): void
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;
        $id = $this->withToken($token)->postJson('/api/sessions')->assertCreated()->json('id');

        // The control: the repair is for a broken character, not a licence to
        // guess at a body with no utterance in it.
        $this->call('POST', "/api/sessions/{$id}/turns", [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer '.$token,
        ], '{"utterance":"I want to')->assertStatus(422);
    }
}
