<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\Role;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\RoleChange;
use App\Models\User;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Accounts, and what they are allowed to be.
 *
 * Granting `admin` grants the safety queue, which holds what someone said at
 * the moment they said they were not safe. Most of what is asserted here is
 * about that being hard to do by accident and impossible to do unrecorded.
 */
final class AdminUserApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_an_admin_may_read_or_change_accounts(): void
    {
        $someone = User::factory()->create();

        $this->getJson('/api/admin/users')->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/admin/users')->assertNotFound();
        $this->patchJson("/api/admin/users/{$someone->id}", ['role' => 'admin'])->assertNotFound();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs(User::factory()->coach()->create());
        // A coach is not an admin, here as everywhere.
        $this->getJson('/api/admin/users')->assertNotFound();
        $this->patchJson("/api/admin/users/{$someone->id}", ['role' => 'admin'])->assertNotFound();

        $this->assertSame(Role::User, $someone->refresh()->role);
    }

    public function test_a_user_cannot_escalate_themselves_through_the_route(): void
    {
        $plain = User::factory()->create();

        Sanctum::actingAs($plain);
        $this->patchJson("/api/admin/users/{$plain->id}", ['role' => 'admin'])->assertNotFound();

        $this->assertSame(Role::User, $plain->refresh()->role);
    }

    public function test_an_admin_finds_an_account_by_name_or_address(): void
    {
        User::factory()->create(['name' => 'Asha Rao', 'email' => 'asha@example.com']);
        User::factory()->create(['name' => 'Rohan Kumar', 'email' => 'rohan@example.com']);

        Sanctum::actingAs(User::factory()->admin()->create(['name' => 'The Admin']));

        $byName = array_column($this->getJson('/api/admin/users?q=Asha')->assertOk()->json('items'), 'email');
        $this->assertSame(['asha@example.com'], $byName);

        $byEmail = array_column($this->getJson('/api/admin/users?q=rohan@')->json('items'), 'email');
        $this->assertSame(['rohan@example.com'], $byEmail);
    }

    public function test_the_list_shows_administration_and_never_session_content(): void
    {
        $user = User::factory()->create(['name' => 'Asha Rao']);
        JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => null,
            'kind' => SessionKind::Full,
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now(),
            'feelings' => ['angry'],
            'title' => 'My manager dismissed my work',
            'belief' => 'I am not good enough',
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $body = $this->getJson('/api/admin/users?q=Asha')->assertOk()->content();

        // That a person has an account is not a secret from the people who run
        // the product. What they said in a session is.
        $this->assertStringContainsString('Asha Rao', $body);
        $this->assertStringNotContainsString('My manager dismissed my work', $body);
        $this->assertStringNotContainsString('I am not good enough', $body);
    }

    public function test_a_role_search_narrows_to_that_role(): void
    {
        User::factory()->create();
        User::factory()->coach()->create(['email' => 'coach@example.com']);

        Sanctum::actingAs(User::factory()->admin()->create());
        $coaches = array_column($this->getJson('/api/admin/users?role=coach')->json('items'), 'email');

        $this->assertSame(['coach@example.com'], $coaches);
    }

    public function test_an_admin_makes_someone_a_coach_and_it_is_recorded(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.com']);
        $user = User::factory()->create(['email' => 'asha@example.com']);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'coach'])
            ->assertOk()
            ->assertJsonPath('role', 'coach');

        $this->assertSame(Role::Coach, $user->refresh()->role);

        $change = RoleChange::query()->sole();
        $this->assertSame(Role::User, $change->from_role);
        $this->assertSame(Role::Coach, $change->to_role);
        $this->assertSame($admin->id, $change->changed_by);
        // The addresses as they were, so the trail still reads if an account is
        // renamed or deleted.
        $this->assertSame('asha@example.com', $change->user_email);
        $this->assertSame('admin@example.com', $change->changed_by_email);
    }

    public function test_the_new_coach_can_use_the_portal_at_once(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        Sanctum::actingAs($admin);
        $this->getJson('/api/coach/clients')->assertNotFound();
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'coach'])->assertOk();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user->refresh());
        $this->getJson('/api/coach/clients')->assertOk();
    }

    public function test_nobody_changes_their_own_role(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->admin()->create();

        Sanctum::actingAs($admin);
        // Not only a guard against typos: an escalation one person can perform
        // on themselves alone is one nobody else had to agree to.
        $this->patchJson("/api/admin/users/{$admin->id}", ['role' => 'user'])->assertForbidden();

        $this->assertSame(Role::Admin, $admin->refresh()->role);
        $this->assertSame(0, RoleChange::query()->count());
    }

    public function test_the_last_admin_cannot_be_demoted(): void
    {
        $first = User::factory()->admin()->create();
        $second = User::factory()->admin()->create();

        Sanctum::actingAs($first);
        // Two admins: demoting one is fine.
        $this->patchJson("/api/admin/users/{$second->id}", ['role' => 'user'])->assertOk();
        $this->assertSame(Role::User, $second->refresh()->role);

        // One admin left, and it is the actor — who cannot change their own
        // role anyway. Promote a third and try from there.
        $third = User::factory()->admin()->create();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($third);

        $this->patchJson("/api/admin/users/{$first->id}", ['role' => 'user'])->assertOk();
        $this->patchJson("/api/admin/users/{$third->id}", ['role' => 'user'])->assertForbidden();

        // The product must not end up with nobody who can administer it, and a
        // safety queue nobody can read.
        $this->assertSame(1, User::query()->where('role', 'admin')->count());
    }

    public function test_demoting_the_only_other_admin_down_to_one_is_refused_from_a_third_party(): void
    {
        $actor = User::factory()->admin()->create();
        $only = User::factory()->admin()->create();

        Sanctum::actingAs($actor);
        $this->patchJson("/api/admin/users/{$only->id}", ['role' => 'user'])->assertOk();

        // Now `actor` is the last admin. Another admin would be needed to
        // demote them, and there is none — which is the point.
        $this->patchJson("/api/admin/users/{$actor->id}", ['role' => 'user'])->assertForbidden();
        $this->assertSame(Role::Admin, $actor->refresh()->role);
    }

    public function test_setting_the_role_it_already_has_changes_nothing_and_records_nothing(): void
    {
        $admin = User::factory()->admin()->create();
        $coach = User::factory()->coach()->create();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$coach->id}", ['role' => 'coach'])
            ->assertOk()
            ->assertJsonPath('role', 'coach');

        // Nothing changed, so there is nothing to record. A trail of no-ops is
        // a trail nobody reads.
        $this->assertSame(0, RoleChange::query()->count());
    }

    public function test_an_unknown_role_is_rejected(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'superadmin'])
            ->assertUnprocessable();

        $this->assertSame(Role::User, $user->refresh()->role);
    }

    public function test_the_trail_is_readable_and_names_both_people(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.com']);
        $user = User::factory()->create(['email' => 'asha@example.com']);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'coach'])->assertOk();
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'admin'])->assertOk();

        $trail = $this->getJson('/api/admin/role-changes')->assertOk();

        $this->assertSame(2, $trail->json('total'));
        // Newest first: the most recent grant is the one worth seeing.
        $this->assertSame('admin', $trail->json('items.0.toRole'));
        $this->assertSame('coach', $trail->json('items.0.fromRole'));
        $this->assertSame('asha@example.com', $trail->json('items.0.userEmail'));
        $this->assertSame('admin@example.com', $trail->json('items.0.changedByEmail'));
    }

    /**
     * Two accounts with the same name must still have a settled order.
     *
     * `CLAUDE.md` says every paged ordering ends in `id` because "a tie with
     * no tiebreaker makes a page repeat a row", and this list is ordered by
     * `name` — which is the least unique column of the four. Two people called
     * Asha Verma is not a contrived case the way two flags in the same second
     * is; it is a Tuesday. The rule was right here and nothing asserted it, so
     * dropping the `orderBy('id')` would have been silent: an admin paging
     * accounts would see one twice and another never.
     *
     * Checked by removing that line — this goes red and nothing else does.
     */
    public function test_paging_accounts_is_stable_when_names_collide(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Admin', 'email' => 'admin@example.com']);
        for ($i = 0; $i < 4; $i++) {
            User::factory()->create(['name' => 'Asha Verma', 'email' => "asha{$i}@example.com"]);
        }

        Sanctum::actingAs($admin);

        $seen = [];
        $cursor = null;
        do {
            $page = $this->getJson('/api/admin/users?limit=1'.($cursor === null ? '' : "&cursor={$cursor}"));
            $page->assertOk();
            $seen = [...$seen, ...array_column($page->json('items'), 'id')];
            $cursor = $page->json('nextCursor');
        } while ($cursor !== null);

        // Five accounts, each exactly once. A repeat and an omission are the
        // same bug and this catches both: the count and the uniqueness.
        $this->assertCount(5, $seen);
        $this->assertCount(5, array_unique($seen));
    }

    /**
     * And two role changes in the same second.
     *
     * This trail is ordered by `created_at` descending, and two grants made
     * back to back land on the same second routinely — the test above this one
     * makes two. It is the trail of who was given the safety queue, so a row
     * that pages out of sight is a grant nobody can see was made.
     */
    public function test_paging_the_role_trail_is_stable_when_changes_share_a_second(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.com']);
        $users = User::factory()->count(4)->create();

        Sanctum::actingAs($admin);
        // One `now()` for all four, which is what a script or a quick hand does
        // anyway — and what `created_at` cannot tell apart.
        $this->travelTo(now());
        foreach ($users as $user) {
            $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'coach'])->assertOk();
        }

        $seen = [];
        $cursor = null;
        do {
            $page = $this->getJson('/api/admin/role-changes?limit=1'.($cursor === null ? '' : "&cursor={$cursor}"));
            $page->assertOk();
            $seen = [...$seen, ...array_column($page->json('items'), 'id')];
            $cursor = $page->json('nextCursor');
        } while ($cursor !== null);

        $this->assertCount(4, $seen);
        $this->assertCount(4, array_unique($seen));
    }

    public function test_the_trail_is_admin_only(): void
    {
        Sanctum::actingAs(User::factory()->coach()->create());
        $this->getJson('/api/admin/role-changes')->assertNotFound();
    }

    public function test_the_trail_outlives_the_accounts_it_names(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'leaving@example.com']);
        User::factory()->admin()->create();
        $user = User::factory()->create(['email' => 'granted@example.com']);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$user->id}", ['role' => 'coach'])->assertOk();

        // Both accounts erased, by the route a person would use.
        app(AccountDeletionService::class)->erase($admin);
        app(AccountDeletionService::class)->erase($user->refresh());

        // The record survives, because the trail exists so a grant has a date
        // and a name on it — one that disappears with the account is not a
        // trail. What it no longer holds is either address.
        $change = RoleChange::query()->sole();
        $this->assertSame(Role::Coach, $change->to_role);
        $this->assertSame(AccountDeletionService::ERASED, $change->user_email);
        $this->assertSame(AccountDeletionService::ERASED, $change->changed_by_email);
        $this->assertStringNotContainsString('leaving@example.com', $change->toJson());
        $this->assertStringNotContainsString('granted@example.com', $change->toJson());
    }
}
