<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The limit on the routes worth guessing at.
 *
 * It is keyed by the account being signed into rather than by address, and
 * these are the two halves of that: guessing one account's password runs out,
 * and someone else behind the same address is not charged for it. India-first
 * means carrier NAT, so "the same address" is tens of thousands of people who
 * have never met.
 */
final class AuthThrottleTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'a-long-enough-password';

    private function user(string $email): User
    {
        return User::factory()->create([
            'email' => $email,
            'password' => Hash::make(self::PASSWORD),
        ]);
    }

    /** A wrong password is a 422 here: the refusal comes from the validator. */
    private function attempt(string $email): TestResponse
    {
        return $this->postJson('/api/auth/login', [
            'email' => $email,
            'password' => 'not-the-right-password',
        ]);
    }

    public function test_guessing_one_account_runs_out(): void
    {
        $this->user('aarav@example.com');

        for ($i = 0; $i < 6; $i++) {
            $this->attempt('aarav@example.com')->assertStatus(422);
        }

        $this->attempt('aarav@example.com')->assertStatus(429);
    }

    public function test_a_spent_account_does_not_spend_anyone_else(): void
    {
        $this->user('aarav@example.com');
        $this->user('diya@example.com');

        // Every request here comes from one address, as it would from behind a
        // carrier's NAT.
        for ($i = 0; $i < 6; $i++) {
            $this->attempt('aarav@example.com')->assertStatus(422);
        }
        $this->attempt('aarav@example.com')->assertStatus(429);

        // The second account has spent nothing, and its owner can still sign in
        // with the password they do know.
        $this->attempt('diya@example.com')->assertStatus(422);
        $this->postJson('/api/auth/login', [
            'email' => 'diya@example.com',
            'password' => self::PASSWORD,
        ])->assertOk();
    }

    public function test_a_ceiling_still_catches_one_machine_spraying_many_accounts(): void
    {
        // A different address each time, so the account-keyed limit never
        // trips; what is left is the per-IP ceiling, and it is what stops this.
        for ($i = 0; $i < 60; $i++) {
            $this->attempt("nobody{$i}@example.com")->assertStatus(422);
        }

        $this->attempt('nobody-else@example.com')->assertStatus(429);
    }

    public function test_the_limit_is_the_same_bucket_however_the_address_is_spelled(): void
    {
        $this->user('aarav@example.com');

        for ($i = 0; $i < 6; $i++) {
            $this->attempt($i % 2 === 0 ? 'Aarav@Example.com' : '  aarav@example.com  ')
                ->assertStatus(422);
        }

        $this->attempt('aarav@example.com')->assertStatus(429);
    }
}
