<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register_and_receives_a_token(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Aarav Mehta',
            'email' => 'aarav@example.com',
            'password' => 'a-long-enough-password',
        ])->assertCreated();

        $this->assertNotEmpty($response->json('token'));
        $response->assertJsonPath('user.email', 'aarav@example.com')
            ->assertJsonPath('user.plan', 'free')
            // A new account has agreed to nothing yet.
            ->assertJsonPath('user.hasRequiredConsent', false)
            ->assertJsonPath('user.acceptedConsent', []);
    }

    public function test_a_password_is_never_returned(): void
    {
        $json = $this->postJson('/api/auth/register', [
            'name' => 'A', 'email' => 'a@example.com', 'password' => 'a-long-enough-password',
        ])->json();

        $this->assertStringNotContainsString('a-long-enough-password', json_encode($json));
        $this->assertArrayNotHasKey('password', $json['user']);
    }

    public function test_a_password_is_stored_hashed(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'A', 'email' => 'a@example.com', 'password' => 'a-long-enough-password',
        ]);

        $stored = User::firstOrFail()->password;
        $this->assertNotSame('a-long-enough-password', $stored);
        $this->assertTrue(Hash::check('a-long-enough-password', $stored));
    }

    public function test_registration_rejects_a_duplicate_email(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/auth/register', [
            'name' => 'A', 'email' => 'taken@example.com', 'password' => 'a-long-enough-password',
        ])->assertJsonValidationErrors('email');
    }

    public function test_registration_rejects_a_weak_password(): void
    {
        $this->postJson('/api/auth/register', [
            'name' => 'A', 'email' => 'a@example.com', 'password' => 'short',
        ])->assertJsonValidationErrors('password');
    }

    public function test_a_user_can_log_in(): void
    {
        User::factory()->create(['email' => 'aarav@example.com', 'password' => 'a-long-enough-password']);

        $this->postJson('/api/auth/login', [
            'email' => 'aarav@example.com',
            'password' => 'a-long-enough-password',
        ])->assertOk()->assertJsonPath('user.email', 'aarav@example.com');
    }

    public function test_a_wrong_password_and_an_unknown_email_are_indistinguishable(): void
    {
        User::factory()->create(['email' => 'known@example.com', 'password' => 'a-long-enough-password']);

        $wrongPassword = $this->postJson('/api/auth/login', [
            'email' => 'known@example.com', 'password' => 'not-the-password',
        ]);
        $unknownEmail = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com', 'password' => 'not-the-password',
        ]);

        // The response must not be usable to discover which addresses exist.
        $this->assertSame($wrongPassword->getStatusCode(), $unknownEmail->getStatusCode());
        $this->assertSame(
            $wrongPassword->json('errors.email'),
            $unknownEmail->json('errors.email'),
        );
    }

    public function test_the_profile_requires_a_token(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    /**
     * Without an Accept header this used to be a 500: Laravel's default sends a
     * guest to route('login'), which this API does not have, and the auth
     * middleware resolves that before the handler decides on JSON.
     */
    public function test_an_unauthenticated_request_is_401_even_without_an_accept_header(): void
    {
        $this->get('/api/me')->assertUnauthorized();
    }

    public function test_a_token_from_login_works_on_a_protected_route(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'a-long-enough-password']);
        $token = $this->postJson('/api/auth/login', [
            'email' => 'a@example.com', 'password' => 'a-long-enough-password',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('email', 'a@example.com');
    }

    public function test_logging_out_revokes_the_token_it_was_called_with(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'a-long-enough-password']);
        $token = $this->postJson('/api/auth/login', [
            'email' => 'a@example.com', 'password' => 'a-long-enough-password',
        ])->json('token');

        $this->assertSame(1, DB::table('personal_access_tokens')->count());
        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/auth/logout')->assertNoContent();
        $this->assertSame(0, DB::table('personal_access_tokens')->count());

        // Within one test the application instance is reused and the guard
        // caches the user it already resolved, so a later request would pass on
        // that cache rather than on the token. Forgetting the guards is what
        // makes this assert what a genuinely new request would get.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/me')->assertUnauthorized();
    }

    public function test_logging_out_also_drops_the_session(): void
    {
        User::factory()->create(['email' => 'a@example.com', 'password' => 'a-long-enough-password']);
        $token = $this->postJson('/api/auth/login', [
            'email' => 'a@example.com', 'password' => 'a-long-enough-password',
        ])->json('token');

        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/auth/logout');

        $this->flushSession();
        $this->app['auth']->forgetGuards();

        // Without the token at all: a lingering session must not keep anyone in.
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_preferences_can_be_changed(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->patchJson('/api/me', ['guideVoice' => 'river', 'talkMode' => 'type'])
            ->assertOk()
            ->assertJsonPath('guideVoice', 'river')
            ->assertJsonPath('talkMode', 'type')
            // Untouched preferences keep their default.
            ->assertJsonPath('coachSharing', 'ask_each_time');
    }

    public function test_an_unknown_preference_value_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->patchJson('/api/me', ['guideVoice' => 'shouty'])->assertJsonValidationErrors('guideVoice');
        $this->patchJson('/api/me', ['talkMode' => 'telepathy'])->assertJsonValidationErrors('talkMode');
    }

    public function test_consent_is_recorded_with_a_timestamp(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/me/consent', ['accepted' => ['understands', 'adult']])
            ->assertOk()
            ->assertJsonPath('hasRequiredConsent', true);

        $this->assertNotNull($user->refresh()->consented_at);
    }

    public function test_partial_consent_is_recorded_but_does_not_count(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/me/consent', ['accepted' => ['understands']])
            ->assertOk()
            ->assertJsonPath('hasRequiredConsent', false);

        // No timestamp, because nothing was fully agreed to.
        $this->assertNull($user->refresh()->consented_at);
    }

    public function test_the_optional_item_alone_is_not_consent(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/me/consent', ['accepted' => ['improve']])
            ->assertOk()
            ->assertJsonPath('hasRequiredConsent', false);
    }

    public function test_consent_ignores_ids_the_product_does_not_ask_about(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/me/consent', ['accepted' => ['understands', 'adult', 'anything_else']])
            ->assertJsonValidationErrors('accepted.2');
    }

    public function test_consent_can_be_withdrawn(): void
    {
        $user = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/me/consent', ['accepted' => []])
            ->assertOk()
            ->assertJsonPath('hasRequiredConsent', false);

        $this->assertNull($user->refresh()->consented_at);
        // And a session can no longer be started.
        $this->postJson('/api/sessions')->assertForbidden();
    }
}
