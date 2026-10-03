<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Recovering an account.
 *
 * Without this a forgotten password meant an encrypted journal nobody could
 * ever read again, including its owner. The two things worth asserting are that
 * it works and that asking does not reveal who has an account — what this
 * product is used for is not a thing to let anyone check.
 */
final class PasswordResetApiTest extends TestCase
{
    use RefreshDatabase;

    private const OLD = 'correct-horse-battery-staple';

    private const NEW = 'another-long-enough-password';

    public function test_asking_sends_a_link_to_an_account_that_exists(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'asha@example.com']);

        $this->postJson('/api/auth/forgot-password', ['email' => 'asha@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_the_address_is_matched_whatever_the_case(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'asha@example.com']);

        $this->postJson('/api/auth/forgot-password', ['email' => '  Asha@Example.com '])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_asking_about_an_unknown_address_answers_the_same_and_sends_nothing(): void
    {
        Notification::fake();
        User::factory()->create(['email' => 'asha@example.com']);

        $known = $this->postJson('/api/auth/forgot-password', ['email' => 'asha@example.com'])->assertOk();
        $unknown = $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])->assertOk();

        // Byte for byte the same. A different answer for a known address turns
        // this into a way to find out who uses the product.
        $this->assertSame($known->json(), $unknown->json());
        Notification::assertCount(1);
    }

    public function test_the_link_is_never_returned_to_whoever_asked(): void
    {
        Notification::fake();
        User::factory()->create(['email' => 'asha@example.com']);

        $body = $this->postJson('/api/auth/forgot-password', ['email' => 'asha@example.com'])
            ->assertOk()
            ->content();

        // Anyone could ask, so the only safe place for it is the inbox.
        $this->assertStringNotContainsString('token', $body);
        $this->assertStringNotContainsString('/welcome/reset/', $body);
    }

    public function test_the_email_points_at_the_web_app_not_the_api(): void
    {
        config(['app.frontend_url' => 'https://app.example.test']);
        $user = User::factory()->create(['email' => 'asha@example.com']);

        $mail = (new ResetPassword('a-token'))->toMail($user);
        $action = $mail->actionUrl ?? '';

        // A reset link is a page a person opens, and Laravel's default builds
        // it on whichever host sent the mail.
        $this->assertStringStartsWith('https://app.example.test/welcome/reset/a-token', $action);
        $this->assertStringContainsString('email=asha%40example.com', $action);
    }

    public function test_a_token_sets_a_new_password(): void
    {
        $user = User::factory()->create([
            'email' => 'asha@example.com',
            'password' => self::OLD,
        ]);
        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => self::NEW,
        ])->assertOk();

        $this->assertTrue(Hash::check(self::NEW, $user->refresh()->password));
        $this->postJson('/api/auth/login', ['email' => 'asha@example.com', 'password' => self::NEW])
            ->assertOk();
    }

    public function test_the_old_password_stops_working(): void
    {
        $user = User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);
        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => self::NEW,
        ])->assertOk();

        $this->postJson('/api/auth/login', ['email' => 'asha@example.com', 'password' => self::OLD])
            ->assertUnprocessable();
    }

    public function test_resetting_signs_out_everywhere_else(): void
    {
        $user = User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);
        $existing = $user->createToken('a phone')->plainTextToken;
        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => self::NEW,
        ])->assertOk();

        // A reset is what somebody does when they have lost control of an
        // account. Leaving the old sessions signed in defeats the point.
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$existing}")
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    public function test_a_token_works_once(): void
    {
        $user = User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);
        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => self::NEW,
        ])->assertOk();

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => 'a-third-password-entirely',
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check(self::NEW, $user->refresh()->password));
    }

    public function test_somebody_elses_token_does_not_work(): void
    {
        $asha = User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);
        $rohan = User::factory()->create(['email' => 'rohan@example.com', 'password' => self::OLD]);
        $theirs = app('auth.password.broker')->createToken($rohan);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $theirs,
            'password' => self::NEW,
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check(self::OLD, $asha->refresh()->password));
    }

    public function test_a_nonsense_token_says_the_same_as_an_expired_one(): void
    {
        User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);

        $response = $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => 'not-a-real-token',
            'password' => self::NEW,
        ])->assertUnprocessable();

        // Which it was is not information worth handing over.
        $this->assertSame(
            ['That reset link is not valid any more. Ask for a new one.'],
            $response->json('errors.token'),
        );
    }

    public function test_a_weak_new_password_is_rejected(): void
    {
        $user = User::factory()->create(['email' => 'asha@example.com', 'password' => self::OLD]);
        $token = app('auth.password.broker')->createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => 'short',
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check(self::OLD, $user->refresh()->password));
    }

    public function test_the_journal_is_still_there_after_a_reset(): void
    {
        $user = User::factory()->create([
            'email' => 'asha@example.com',
            'password' => self::OLD,
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);
        $id = $this->startedSession();

        $this->app['auth']->forgetGuards();
        $token = app('auth.password.broker')->createToken($user);
        $this->postJson('/api/auth/reset-password', [
            'email' => 'asha@example.com',
            'token' => $token,
            'password' => self::NEW,
        ])->assertOk();

        // The whole point: the encrypted content is keyed to the application,
        // not to the password, so recovering the account recovers the journal.
        Sanctum::actingAs($user->refresh());
        $this->getJson("/api/sessions/{$id}")->assertOk();
    }

    private function startedSession(): string
    {
        return $this->postJson('/api/sessions')->assertCreated()->json('id');
    }
}
