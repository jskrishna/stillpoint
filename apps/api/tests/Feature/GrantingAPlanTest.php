<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Plan;
use App\Domain\SessionKind;
use App\Models\PlanChange;
use App\Models\User;
use App\Services\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * What an account is allowed to use.
 *
 * `Plan` has always said what each plan allows, and nothing in the product
 * could put anybody on one: registration does not accept a plan, the profile
 * update whitelists three unrelated fields, and the console changed `role`. So
 * every account was `free` for ever, the two paid plans were unreachable
 * states, and the prices on the marketing site were for plans nobody could be
 * on.
 *
 * This is the route that moves somebody, and it is a **grant** rather than a
 * purchase — there is no billing anywhere in this product. What is asserted
 * here is that it is guarded the way the role route is, that it is recorded,
 * and that it actually changes what the server allows: a plan that the
 * allowance does not honour would be the pricing page's promise broken from
 * the other direction.
 */
final class GrantingAPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_an_admin_may_change_a_plan(): void
    {
        $someone = User::factory()->create();

        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create());
        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertNotFound();

        $this->app['auth']->forgetGuards();
        // A coach is not an admin, here as everywhere.
        Sanctum::actingAs(User::factory()->coach()->create());
        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertNotFound();

        $this->assertSame('free', $someone->refresh()->plan);
    }

    public function test_nobody_may_set_their_own_plan(): void
    {
        // Not only a guard against mistakes. An unlimited allowance one person
        // can give themselves is a benefit nobody else agreed to — the same
        // argument the role route makes about granting itself the safety queue.
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$admin->id}/plan", ['plan' => 'plus'])
            ->assertForbidden();

        $this->assertSame('free', $admin->refresh()->plan);
        $this->assertSame(0, PlanChange::query()->count());
    }

    public function test_a_request_may_not_set_its_own_plan_through_any_other_route(): void
    {
        // Registration and the profile update are the two routes that take a
        // body from the person it is about, and neither accepts a plan.
        //
        // Note what holds this up, because it is not the fillable list: both
        // routes build their own array from validated fields, so naming a
        // plan in the body is ignored whether or not the column is fillable —
        // checked by putting `plan` back in `User`'s fillable list, and this
        // test stayed green. Taking it out is a second line for the next route
        // that reaches for `fill()`, and the assertion below is what pins it,
        // since no request can tell the difference today.
        $this->postJson('/api/auth/register', [
            'name' => 'Hopeful',
            'email' => 'hopeful@example.com',
            'password' => 'correct-horse-battery-staple',
            'plan' => 'coach',
        ])->assertCreated();

        $this->assertSame('free', User::query()->where('email', 'hopeful@example.com')->sole()->plan);

        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $this->patchJson('/api/me', ['plan' => 'plus'])->assertSuccessful();
        $this->assertSame('free', $user->refresh()->plan);

        // The second line, stated: `plan` is not something a request may set,
        // for the reason `role` is not. The console's own route assigns it
        // directly.
        $this->assertNotContains('plan', (new User)->getFillable());
        $this->assertNotContains('role', (new User)->getFillable());
    }

    public function test_an_admin_grants_a_plan_and_it_is_recorded(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'reviewer@example.com']);
        $someone = User::factory()->create(['email' => 'pilot@example.com']);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertSuccessful()
            ->assertJsonPath('plan', 'plus');

        $this->assertSame('plus', $someone->refresh()->plan);

        $trail = PlanChange::query()->sole();
        $this->assertSame('free', $trail->from_plan->value);
        $this->assertSame('plus', $trail->to_plan->value);
        $this->assertSame('pilot@example.com', $trail->user_email);
        $this->assertSame('reviewer@example.com', $trail->changed_by_email);
    }

    public function test_setting_the_plan_it_already_has_records_nothing(): void
    {
        // A trail of no-ops is a trail nobody reads.
        $admin = User::factory()->admin()->create();
        $someone = User::factory()->create();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'free'])
            ->assertSuccessful();

        $this->assertSame(0, PlanChange::query()->count());
    }

    public function test_an_unknown_plan_is_refused(): void
    {
        $admin = User::factory()->admin()->create();
        $someone = User::factory()->create();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'enterprise'])
            ->assertStatus(422);
        $this->patchJson("/api/admin/users/{$someone->id}/plan", [])->assertStatus(422);

        $this->assertSame('free', $someone->refresh()->plan);
    }

    public function test_the_granted_plan_is_what_the_allowance_honours(): void
    {
        // The point of the whole route. Free gets three full sessions a week
        // and the fourth is refused with 402; Plus is unlimited, and a plan
        // that the server did not honour would be the pricing page's promise
        // broken from the other direction.
        $admin = User::factory()->admin()->create();
        // Consent is the server's gate on starting a session at all, so an
        // account that has not consented never reaches the allowance.
        $someone = User::factory()->create([
            'accepted_consent' => ['understands', 'adult'],
            'consented_at' => now(),
        ]);

        Sanctum::actingAs($someone);
        for ($i = 0; $i < 3; $i++) {
            $id = $this->postJson('/api/sessions', ['kind' => SessionKind::Full->value])
                ->assertCreated()
                ->json('id');
            // Said something into it, or the next start hands this same
            // session back instead of spending another allowance — which is a
            // rule of its own, and would make this test pass for the wrong
            // reason by never reaching the limit at all.
            $this->postJson("/api/sessions/{$id}/turns", [
                'utterance' => 'My manager called me out in front of everyone',
            ])->assertSuccessful();
        }
        $this->postJson('/api/sessions', ['kind' => SessionKind::Full->value])
            ->assertStatus(402);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertSuccessful();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($someone->refresh());
        $this->postJson('/api/sessions', ['kind' => SessionKind::Full->value])
            ->assertCreated();

        $this->assertNull(Plan::Plus->fullSessionsPerWeek());
    }

    public function test_the_trail_pages_and_never_repeats_a_row(): void
    {
        // `created_at` is not unique, so the ordering ends in `id`. A tie with
        // no tiebreaker makes a page repeat a row.
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        foreach (range(1, 5) as $n) {
            $user = User::factory()->create(['email' => "p{$n}@example.com"]);
            $this->patchJson("/api/admin/users/{$user->id}/plan", ['plan' => 'plus'])
                ->assertSuccessful();
        }

        $first = $this->getJson('/api/admin/plan-changes?limit=2')->assertSuccessful()->json();
        $this->assertCount(2, $first['items']);
        $this->assertSame(5, $first['total']);
        $this->assertNotNull($first['nextCursor']);

        $second = $this->getJson('/api/admin/plan-changes?limit=2&cursor='.$first['nextCursor'])
            ->assertSuccessful()->json();

        $ids = array_column($first['items'], 'id');
        foreach ($second['items'] as $row) {
            $this->assertNotContains($row['id'], $ids);
        }
        $this->assertSame('free', $first['items'][0]['fromPlan']);
        $this->assertSame('plus', $first['items'][0]['toPlan']);
    }

    public function test_erasing_an_account_keeps_the_trail_and_drops_the_address(): void
    {
        // The pattern the deletion sweep asks for whenever a table is added:
        // the record of an administrative action outlives the account, with
        // the address taken out.
        $admin = User::factory()->admin()->create(['email' => 'reviewer@example.com']);
        $someone = User::factory()->create(['email' => 'pilot@example.com']);
        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$someone->id}/plan", ['plan' => 'plus'])
            ->assertSuccessful();

        app(AccountDeletionService::class)->erase($someone->refresh());

        $trail = PlanChange::query()->sole();
        $this->assertSame(AccountDeletionService::ERASED, $trail->user_email);
        $this->assertSame('reviewer@example.com', $trail->changed_by_email);
        $this->assertSame('plus', $trail->to_plan->value);

        app(AccountDeletionService::class)->erase($admin->refresh());
        $this->assertSame(
            AccountDeletionService::ERASED,
            PlanChange::query()->sole()->changed_by_email,
        );
    }
}
