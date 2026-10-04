<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Helpline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Canada is the first market, so Canada has crisis numbers.
 *
 * It did not. `forCountry()` answered for India and returned an empty list for
 * everywhere else, which was the right rule written for the wrong first
 * market: a Canadian who said they were not safe had their session stopped,
 * saw the pause screen, and had **nothing to call** on it. The screen's whole
 * purpose is the number on it.
 *
 * The rule itself has not changed. A country this does not cover still gets an
 * empty list rather than a plausible-looking number from somewhere else.
 */
final class CanadianHelplinesTest extends TestCase
{
    use RefreshDatabase;

    private function userIn(string $country): User
    {
        $user = User::factory()->create([
            'country' => $country,
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function stop(): array
    {
        $id = $this->postJson('/api/sessions')->json('id');
        $response = $this->postJson("/api/sessions/{$id}/turns", [
            'utterance' => 'Sometimes I think everyone would be better off without me',
            'step' => 'notice',
        ])->assertOk()->assertJsonPath('endReason', 'safety_stop');

        return $response->json('safety.helplines') ?? [];
    }

    /** The bug this closes, stated as a test. */
    public function test_a_canadian_in_crisis_is_shown_canadian_numbers(): void
    {
        $this->userIn('CA');

        $numbers = array_column($this->stop(), 'number');
        $this->assertSame(['988', '1-866-277-3553', '911'], $numbers);
    }

    public function test_an_indian_in_crisis_is_still_shown_indian_numbers(): void
    {
        $this->userIn('IN');

        $numbers = array_column($this->stop(), 'number');
        $this->assertSame(['14416', '112'], $numbers);
    }

    /**
     * A country with no numbers still gets none. Being the first market is a
     * reason to add Canada, not a reason to start guessing.
     */
    public function test_a_country_with_no_numbers_is_still_given_none(): void
    {
        $this->userIn('US');

        $this->assertSame([], $this->stop());
        $this->assertSame([], Helpline::forCountry('GB'));
        $this->assertSame([], Helpline::forCountry(''));
    }

    public function test_a_new_account_is_assumed_to_be_in_canada(): void
    {
        $this->assertSame('CA', Helpline::DEFAULT_COUNTRY);

        // Through the API, so the column default is what is being checked and
        // not a value the factory happened to set.
        $token = $this->postJson('/api/auth/register', [
            'name' => 'New Here',
            'email' => 'new-here@example.com',
            'password' => 'correct-horse-battery-staple',
            'password_confirmation' => 'correct-horse-battery-staple',
        ])->assertCreated()->json('token');

        $this->assertSame('CA', User::query()->where('email', 'new-here@example.com')->sole()->country);
        $this->assertNotSame('', (string) $token);
    }

    /** Nobody's recorded country is rewritten by the default changing. */
    public function test_an_existing_account_keeps_the_country_it_had(): void
    {
        $indian = User::factory()->create(['country' => 'IN']);

        $this->assertSame('IN', $indian->refresh()->country);
    }

    public function test_no_country_is_handed_another_countrys_numbers(): void
    {
        foreach (Helpline::COUNTRIES as $country) {
            $lines = Helpline::forCountry($country);
            $this->assertNotSame([], $lines, $country);

            foreach ($lines as $line) {
                $this->assertSame($country, $line->country, "{$country}: {$line->number}");
            }

            // Exactly one emergency number, and it comes last.
            $emergencies = array_values(array_filter($lines, fn (Helpline $h) => $h->kind === 'emergency'));
            $this->assertCount(1, $emergencies, $country);
            $this->assertSame('emergency', $lines[count($lines) - 1]->kind, $country);
        }
    }
}
