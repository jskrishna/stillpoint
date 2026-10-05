<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CoachInvite;
use App\Models\User;
use App\Support\EmailAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * An address is stored and compared in one spelling.
 *
 * `users.email` was written exactly as typed while the password broker, the
 * invitation table, the rate limiter and the erasure sweep all lowercased. On
 * MySQL that disagreement is invisible, because the default collation is
 * case-insensitive. On sqlite — the development container and the documented
 * end-to-end stack — `=` is case-sensitive, and all three of the cases below
 * were measured failing before `App\Support\EmailAddress` existed.
 *
 * The third is the one that matters. A reset asked for with the **exact**
 * address somebody registered answered 200 and sent nothing: no notification,
 * no token row. The 200 is deliberate, so an unauthenticated caller cannot
 * learn who has an account — which means the person is told a link is on its
 * way to an account they can never get back into.
 *
 * These are written as sqlite tests on purpose. They would pass against MySQL
 * before the fix as well as after, by the collation's accident rather than by
 * anything the application does, and that is the whole point: the rule belongs
 * to the application, so the product behaves the same where it is developed
 * and where it runs.
 */
final class OneSpellingForAnAddressTest extends TestCase
{
    use RefreshDatabase;

    private const TYPED = 'Aarav@Example.com';

    private const LOWER = 'aarav@example.com';

    private const PASSWORD = 'correct-horse-battery-staple';

    private function register(string $email): TestResponse
    {
        return $this->postJson('/api/auth/register', [
            'name' => 'Aarav',
            'email' => $email,
            'password' => self::PASSWORD,
        ]);
    }

    public function test_the_stored_address_is_the_normalised_one(): void
    {
        $this->register(self::TYPED)->assertCreated();

        $this->assertSame(self::LOWER, User::query()->sole()->email);
    }

    public function test_signing_in_does_not_depend_on_how_it_was_typed(): void
    {
        $this->register(self::TYPED)->assertCreated();

        foreach ([self::TYPED, self::LOWER, 'AARAV@EXAMPLE.COM', '  aarav@example.com  '] as $spelling) {
            $this->postJson('/api/auth/login', [
                'email' => $spelling,
                'password' => self::PASSWORD,
            ])->assertOk();
        }
    }

    public function test_a_second_account_cannot_be_registered_in_another_case(): void
    {
        $this->register(self::TYPED)->assertCreated();

        $this->register(self::LOWER)
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        $this->assertSame(1, User::query()->count());
    }

    /** The sharpest one: the only path back into an account. */
    public function test_a_reset_reaches_an_account_registered_with_capitals(): void
    {
        Notification::fake();
        $this->register(self::TYPED)->assertCreated();

        $this->postJson('/api/auth/forgot-password', ['email' => self::TYPED])->assertOk();

        // Before the fix: zero of each, with a 200 saying otherwise.
        $this->assertSame(1, DB::table('password_reset_tokens')->count());
        Notification::assertCount(1);
    }

    /**
     * And an invitation sent to the address still finds the person.
     *
     * This path already lowercased both sides, so it worked before — it is
     * here because it is the same rule, and because routing it through one
     * function is what makes "the same rule" true rather than claimed.
     */
    public function test_an_invitation_is_accepted_whatever_case_it_was_sent_in(): void
    {
        $this->register(self::TYPED)->assertCreated();
        $client = User::query()->sole();
        $coach = User::factory()->create(['role' => 'coach']);

        $invite = CoachInvite::open($coach, 'AARAV@Example.COM');
        $this->assertSame(self::LOWER, $invite->email, 'the invitation stored another spelling');

        $this->actingAs($client)
            ->postJson("/api/invites/{$invite->token}/accept")
            ->assertSuccessful();

        $this->assertSame(1, $coach->clients()->count());
    }

    /**
     * Registration is the only thing that writes the column.
     *
     * That is what makes normalising there sufficient, and nothing pinned it.
     * `PATCH /me` validates three unrelated fields and builds its own array,
     * so naming an address in the body is already ignored — this asserts it
     * the way `GrantingAPlanTest` asserts the fillable list: no request can
     * exploit it today, and the next route that reaches for `fill()` is the
     * reason to have said so.
     *
     * If a route ever should change an address, this test going red is the
     * right way to find out that it has to normalise and that the uniqueness
     * check has to be case-insensitive with it.
     */
    public function test_the_profile_update_cannot_change_the_address(): void
    {
        $this->register(self::TYPED)->assertCreated();
        $user = User::query()->sole();

        $this->actingAs($user)
            ->patchJson('/api/me', [
                'email' => 'someone.else@example.com',
                'guideVoice' => 'river',
            ])
            ->assertOk();

        $this->assertSame(self::LOWER, $user->fresh()->email);
        // And the field it does accept really was applied, so this is not
        // passing because the whole request was refused.
        $this->assertSame('river', $user->fresh()->guide_voice);
    }

    /** One function, and these are the shapes it has to flatten. */
    public function test_the_normaliser_itself(): void
    {
        $this->assertSame(self::LOWER, EmailAddress::normalise(self::TYPED));
        $this->assertSame(self::LOWER, EmailAddress::normalise('  AARAV@EXAMPLE.COM '));
        $this->assertSame(self::LOWER, EmailAddress::normalise(self::LOWER));
        $this->assertSame('', EmailAddress::normalise(null));
        $this->assertSame('', EmailAddress::normalise('   '));
    }

    /**
     * The migration leaves a collision alone rather than failing.
     *
     * Two rows differing only in case are storable on sqlite and were never
     * storable on MySQL, so this is a development database's problem — and a
     * blind `LOWER(email)` would violate the unique index and break the
     * migration for whoever had one. Merging two accounts is not a migration's
     * decision: each has its own journal.
     *
     * **It can only run on sqlite, and that is the point rather than a
     * limitation.** The two rows this needs are the ones MySQL's unique index
     * refuses — measured by `pnpm run check:mysql`, which answered
     * `1062 Duplicate entry 'aarav@example.com'` on the second `create()`,
     * before the migration under test was reached. So the fixture cannot exist
     * on the engine where the collision cannot happen, and skipping says so
     * rather than reporting a failure about a state that server makes
     * impossible.
     *
     * Skipped rather than deleted because the collision is real where this is
     * developed, and a migration that broke a development database is still a
     * broken migration.
     */
    public function test_the_migration_leaves_a_case_collision_alone(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlite') {
            $this->markTestSkipped(
                'Two rows differing only in case are unstorable here, which is the fact this test is about.',
            );
        }

        $a = User::factory()->create(['email' => self::TYPED]);
        $b = User::factory()->create(['email' => self::LOWER]);
        $alone = User::factory()->create(['email' => 'Meera@Example.com']);

        require database_path('migrations/2026_10_04_180000_normalise_stored_email_addresses.php');
        $migration = include database_path('migrations/2026_10_04_180000_normalise_stored_email_addresses.php');
        $migration->up();

        // Untouched, both of them.
        $this->assertSame(self::TYPED, $a->fresh()->email);
        $this->assertSame(self::LOWER, $b->fresh()->email);
        // And the one with no collision is normalised.
        $this->assertSame('meera@example.com', $alone->fresh()->email);
    }
}
