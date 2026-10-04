<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The limit on the routes worth guessing at.
 *
 * Three buckets, and the one that matters most here is the one that was
 * missing. The tight limit used to be keyed on the account alone, so six
 * requests a minute from anywhere held a person out of their own journal
 * indefinitely — and an address is not a secret. The person it happens to is
 * somebody who went looking for help with being upset and cannot reach what
 * they wrote.
 *
 * `Password::min(12)` is what makes keying it by address as well safe rather
 * than a trade: online guessing is not the threat, credential stuffing is, and
 * that needs one attempt.
 */
final class GuessableRoutesAreLimitedTest extends TestCase
{
    use RefreshDatabase;

    /**
     * What `UserFactory` hashes. The twelve-character minimum is a rule for
     * what a request may *set*, and this one is already stored.
     */
    private const PASSWORD = 'password';

    public function test_one_machine_guessing_one_account_is_cut_off(): void
    {
        $user = User::factory()->create(['email' => 'target@example.com']);

        for ($i = 0; $i < 6; $i++) {
            $this->signIn('target@example.com', 'wrong-password-entirely', '203.0.113.9')
                ->assertStatus(422);
        }

        $this->signIn('target@example.com', 'wrong-password-entirely', '203.0.113.9')
            ->assertStatus(429);

        // Including with the right password: the budget is spent, and that is
        // the point of spending it.
        $this->signIn('target@example.com', self::PASSWORD, '203.0.113.9')
            ->assertStatus(429);

        $this->assertNotNull($user->refresh());
    }

    public function test_one_machine_exhausting_its_budget_does_not_lock_the_account_out(): void
    {
        // The half that was broken. Keyed on the account alone, this signed-in
        // request answered 429 — somebody else's six wrong guesses were enough
        // to keep the owner out of their own journal, renewably, for ever.
        User::factory()->create(['email' => 'target@example.com']);

        for ($i = 0; $i < 7; $i++) {
            $this->signIn('target@example.com', 'wrong-password-entirely', '203.0.113.9');
        }

        $this->signIn('target@example.com', self::PASSWORD, '198.51.100.4')
            ->assertSuccessful()
            ->assertJsonStructure(['token']);
    }

    public function test_many_machines_against_one_account_are_still_capped(): void
    {
        // Looser than six, because twelve characters is what stops online
        // guessing — but not unbounded.
        User::factory()->create(['email' => 'target@example.com']);

        $refusals = 0;
        for ($i = 0; $i < 40; $i++) {
            // A different address each time, so only the per-account bucket
            // can be what answers.
            $address = '192.0.2.'.(string) ($i + 1);
            if ($this->signIn('target@example.com', 'wrong-password-entirely', $address)->status() === 429) {
                $refusals++;
            }
        }

        $this->assertGreaterThan(0, $refusals, 'an account has no ceiling across addresses');
    }

    public function test_one_address_guessing_different_accounts_does_not_share_the_tight_bucket(): void
    {
        // The tight bucket is per account *and* address, so a carrier's
        // subscribers behind one public address do not spend each other's.
        foreach (range(1, 6) as $n) {
            User::factory()->create(['email' => "person{$n}@example.com"]);
            $this->signIn("person{$n}@example.com", 'wrong-password-entirely', '203.0.113.9')
                ->assertStatus(422);
        }

        // The seventh account from the same address is a fresh tight bucket.
        User::factory()->create(['email' => 'person7@example.com']);
        $this->signIn('person7@example.com', self::PASSWORD, '203.0.113.9')
            ->assertSuccessful();
    }

    public function test_a_request_with_no_address_to_guess_does_not_share_one_bucket(): void
    {
        // An invitation is looked up by its token. A request with neither an
        // email nor a token must not land in a bucket every other such request
        // shares, because that bucket is a global lock.
        $first = $this->getJson('/api/invites/nope-one', ['REMOTE_ADDR' => '203.0.113.9']);
        $this->assertNotSame(429, $first->status());

        for ($i = 0; $i < 8; $i++) {
            $this->getJson('/api/invites/nope-one', ['REMOTE_ADDR' => '203.0.113.9']);
        }

        // A different token from a different address is untouched by that.
        $other = $this->getJson('/api/invites/nope-two', ['REMOTE_ADDR' => '198.51.100.4']);
        $this->assertNotSame(429, $other->status());
    }

    private function signIn(string $email, string $password, string $address): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withServerVariables(['REMOTE_ADDR' => $address])
            ->postJson('/api/auth/login', ['email' => $email, 'password' => $password]);
    }
}
