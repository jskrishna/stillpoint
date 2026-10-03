<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\SessionKind;
use App\Models\CoachInvite;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coach invitations, and a client's control over the pairing.
 *
 * The rule under all of it: **the client creates the pairing, by accepting, and
 * ends it alone.** A coach can ask. In a product where what a coach sees is the
 * client's own choice session by session, the relationship itself has to be
 * their choice too — otherwise the first choice is made for them.
 */
final class CoachInviteApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_a_coach_may_invite(): void
    {
        $this->postJson('/api/coach/invites', ['email' => 'client@example.com'])
            ->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/coach/invites', ['email' => 'client@example.com'])->assertNotFound();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs(User::factory()->admin()->create());
        // An admin is not a coach, here as everywhere.
        $this->postJson('/api/coach/invites', ['email' => 'client@example.com'])->assertNotFound();
    }

    public function test_a_coach_opens_an_invite_and_is_given_a_link_to_pass_on(): void
    {
        $coach = User::factory()->coach()->create();
        Sanctum::actingAs($coach);

        $invite = $this->postJson('/api/coach/invites', ['email' => 'Asha@Example.com'])
            ->assertCreated()
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('usable', true)
            // Lower-cased, because that is how it is matched on acceptance and
            // "Asha@" is the same inbox as "asha@".
            ->assertJsonPath('email', 'asha@example.com')
            ->json();

        // No mail driver yet, so the coach is handed the link themselves.
        $this->assertStringStartsWith('/welcome/invite/', $invite['link']);
        $this->assertSame(0, User::query()->where('email', 'asha@example.com')->count());
    }

    public function test_inviting_the_same_address_twice_is_one_invitation(): void
    {
        $coach = User::factory()->coach()->create();
        Sanctum::actingAs($coach);

        $first = $this->postJson('/api/coach/invites', ['email' => 'asha@example.com'])->assertCreated();
        $second = $this->postJson('/api/coach/invites', ['email' => 'asha@example.com'])->assertOk();

        // Two links for one decision would be confusing, and the second would
        // quietly invalidate nothing.
        $this->assertSame($first->json('link'), $second->json('link'));
        $this->assertSame(1, CoachInvite::query()->count());
    }

    public function test_a_coach_cannot_invite_themselves(): void
    {
        $coach = User::factory()->coach()->create();
        Sanctum::actingAs($coach);

        $this->postJson('/api/coach/invites', ['email' => $coach->email])->assertUnprocessable();
        $this->assertSame(0, CoachInvite::query()->count());
    }

    public function test_inviting_an_existing_client_says_so(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $coach->clients()->attach($client->id, ['status' => 'active', 'since' => now()]);

        Sanctum::actingAs($coach);
        $this->postJson('/api/coach/invites', ['email' => $client->email])->assertConflict();
    }

    public function test_reading_an_invite_needs_no_account_and_says_only_who_is_asking(): void
    {
        $coach = User::factory()->coach()->create(['name' => 'Coach Devi']);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        $response = $this->getJson("/api/invites/{$invite->token}")->assertOk();

        $response->assertJsonPath('coachName', 'Coach Devi')->assertJsonPath('usable', true);
        // Not whether the address has an account: an invite is not a lookup
        // tool, and the coach's own email is not the holder's business either.
        $this->assertStringNotContainsString($coach->email, $response->content());
        $this->assertArrayNotHasKey('hasAccount', $response->json());
    }

    public function test_an_unknown_token_is_not_found(): void
    {
        $this->getJson('/api/invites/'.str_repeat('x', 64))->assertNotFound();
        Sanctum::actingAs(User::factory()->create());
        $this->postJson('/api/invites/'.str_repeat('x', 64).'/accept')->assertNotFound();
    }

    public function test_accepting_is_what_creates_the_pairing(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create(['email' => 'asha@example.com']);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        // Nothing until they accept. A coach cannot attach themselves.
        $this->assertSame(0, $coach->clients()->count());

        Sanctum::actingAs($client);
        $this->postJson("/api/invites/{$invite->token}/accept")
            ->assertOk()
            ->assertJsonPath('coachName', $coach->name);

        $this->assertSame(1, $coach->clients()->count());
        $this->assertSame('accepted', $invite->refresh()->status);
        $this->assertSame($client->id, $invite->accepted_by);
    }

    public function test_accepting_twice_is_one_pairing(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create(['email' => 'asha@example.com']);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        Sanctum::actingAs($client);
        $this->postJson("/api/invites/{$invite->token}/accept")->assertOk();
        // The second is refused rather than silently doubling anything.
        $this->postJson("/api/invites/{$invite->token}/accept")->assertConflict();

        $this->assertSame(1, $coach->clients()->count());
    }

    public function test_somebody_else_cannot_accept_an_invite_they_hold(): void
    {
        $coach = User::factory()->coach()->create();
        $invite = CoachInvite::open($coach, 'asha@example.com');
        $stranger = User::factory()->create(['email' => 'notasha@example.com']);

        Sanctum::actingAs($stranger);
        // However they came by the link.
        $this->postJson("/api/invites/{$invite->token}/accept")->assertForbidden();

        $this->assertSame(0, $coach->clients()->count());
        $this->assertSame('pending', $invite->refresh()->status);
    }

    public function test_an_expired_invite_cannot_be_accepted(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create(['email' => 'asha@example.com']);
        $invite = CoachInvite::open($coach, 'asha@example.com');
        $invite->expires_at = now()->subDay();
        $invite->save();

        $this->getJson("/api/invites/{$invite->token}")
            ->assertOk()
            ->assertJsonPath('usable', false)
            // The reason says what to do about it.
            ->assertJsonPath('reason', 'This invitation has expired. Ask your coach for a new one.');

        Sanctum::actingAs($client);
        $this->postJson("/api/invites/{$invite->token}/accept")->assertConflict();
        $this->assertSame(0, $coach->clients()->count());
    }

    public function test_a_withdrawn_invite_cannot_be_accepted(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create(['email' => 'asha@example.com']);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        Sanctum::actingAs($coach);
        $this->deleteJson("/api/coach/invites/{$invite->id}")
            ->assertOk()
            ->assertJsonPath('status', 'revoked');

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($client);
        $this->postJson("/api/invites/{$invite->token}/accept")->assertConflict();
        $this->assertSame(0, $coach->clients()->count());
    }

    public function test_a_coach_cannot_withdraw_another_coachs_invite(): void
    {
        $invite = CoachInvite::open(User::factory()->coach()->create(), 'asha@example.com');

        Sanctum::actingAs(User::factory()->coach()->create());
        $this->deleteJson("/api/coach/invites/{$invite->id}")->assertNotFound();
        $this->assertSame('pending', $invite->refresh()->status);
    }

    public function test_withdrawing_an_accepted_invite_is_refused_rather_than_undoing_the_pairing(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create(['email' => 'asha@example.com']);
        $invite = CoachInvite::open($coach, 'asha@example.com');

        Sanctum::actingAs($client);
        $this->postJson("/api/invites/{$invite->token}/accept")->assertOk();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($coach);
        // Withdrawing it would imply it undoes the pairing, which it does not:
        // ending one is the client's to do.
        $this->deleteJson("/api/coach/invites/{$invite->id}")->assertConflict();
        $this->assertSame(1, $coach->clients()->count());
    }

    /* ----------------------------------------- the client's side of it */

    public function test_a_client_can_see_who_reads_their_shared_sessions(): void
    {
        $coach = User::factory()->coach()->create(['name' => 'Coach Devi']);
        $client = User::factory()->create();
        $coach->clients()->attach($client->id, ['status' => 'active', 'since' => now()->subMonth()]);
        $this->entry($client, ['shared_with_coach' => true]);
        $this->entry($client, ['shared_with_coach' => true]);
        $this->entry($client, ['shared_with_coach' => false]);

        Sanctum::actingAs($client);
        $this->getJson('/api/me/coaches')
            ->assertOk()
            ->assertJsonPath('0.name', 'Coach Devi')
            // A number, because "they can see your shared sessions" is abstract
            // and two is not.
            ->assertJsonPath('0.sharedSessions', 2);
    }

    public function test_a_client_ends_a_pairing_and_the_coach_loses_access_at_once(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $coach->clients()->attach($client->id, ['status' => 'active', 'since' => now()]);
        $this->entry($client, ['title' => 'A shared session', 'shared_with_coach' => true]);

        // The coach can read it now.
        Sanctum::actingAs($coach);
        $this->getJson("/api/coach/clients/{$client->id}")->assertOk();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($client);
        $this->deleteJson("/api/me/coaches/{$coach->id}")->assertNoContent();
        $this->assertSame([], $this->getJson('/api/me/coaches')->json());

        // And not afterwards. Reading goes through the pairing, so ending it
        // ends the reading.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($coach);
        $response = $this->getJson("/api/coach/clients/{$client->id}")->assertNotFound();
        $this->assertStringNotContainsString('A shared session', $response->content());
        $this->assertSame([], $this->getJson('/api/coach/clients')->json());
    }

    public function test_ending_a_pairing_does_not_unshare_the_entries(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $coach->clients()->attach($client->id, ['status' => 'active', 'since' => now()]);
        $entry = $this->entry($client, ['shared_with_coach' => true]);

        Sanctum::actingAs($client);
        $this->deleteJson("/api/me/coaches/{$coach->id}")->assertNoContent();

        // The flag on an entry is its own decision and stays where the user put
        // it. What ended is anyone being able to read it.
        $this->assertTrue((bool) $entry->refresh()->shared_with_coach);
    }

    public function test_a_client_cannot_end_a_pairing_that_is_not_theirs(): void
    {
        $coach = User::factory()->coach()->create();
        $theirs = User::factory()->create();
        $coach->clients()->attach($theirs->id, ['status' => 'active', 'since' => now()]);

        Sanctum::actingAs(User::factory()->create());
        $this->deleteJson("/api/me/coaches/{$coach->id}")->assertNotFound();
        $this->assertSame(1, $coach->clients()->count());
    }

    public function test_a_coach_cannot_end_the_pairing_for_the_client(): void
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        $coach->clients()->attach($client->id, ['status' => 'active', 'since' => now()]);

        Sanctum::actingAs($coach);
        // There is no route for it, which is the answer: /me/coaches is the
        // client's own list, and a coach is not in their own.
        $this->deleteJson("/api/me/coaches/{$client->id}")->assertNotFound();
        $this->assertSame(1, $coach->clients()->count());
    }

    /** @param array<string, mixed> $attributes */
    private function entry(User $user, array $attributes = []): JournalEntry
    {
        return JournalEntry::create(array_merge([
            'user_id' => $user->id,
            'guided_session_id' => null,
            'kind' => SessionKind::Full,
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now()->subDay(),
            'feelings' => ['angry'],
            'title' => 'A session',
            'shared_with_coach' => false,
        ], $attributes));
    }
}
