<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Role;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The safety queue, and who may read it.
 *
 * A flag's excerpt is the user's own words at the moment they said they were
 * not safe. Most of what is asserted here is about keeping it away from anyone
 * who is not a reviewer.
 */
final class SafetyQueueApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_account_is_not_staff(): void
    {
        $user = User::factory()->create()->refresh();

        $this->assertSame(Role::User, $user->role);
        $this->assertFalse($user->isStaff());
    }

    public function test_registering_cannot_make_someone_staff(): void
    {
        // `role` is not fillable, so a request cannot set it even by naming it.
        $this->postJson('/api/auth/register', [
            'name' => 'Opportunist',
            'email' => 'opportunist@example.com',
            'password' => 'correct-horse-battery-staple',
            'role' => 'admin',
        ])->assertCreated();

        $this->assertSame(Role::User, User::where('email', 'opportunist@example.com')->sole()->role);
    }

    public function test_the_queue_requires_a_token(): void
    {
        $this->getJson('/api/admin/safety-flags')->assertUnauthorized();
    }

    public function test_an_ordinary_user_cannot_see_the_queue(): void
    {
        $this->flag(User::factory()->create());

        Sanctum::actingAs(User::factory()->create());
        // 404, not 403: the route does not confirm its own existence.
        $this->getJson('/api/admin/safety-flags')->assertNotFound();
    }

    public function test_a_coach_cannot_see_the_queue(): void
    {
        $this->flag(User::factory()->create());

        Sanctum::actingAs($this->staff(Role::Coach));
        $this->getJson('/api/admin/safety-flags')->assertNotFound();
    }

    public function test_an_ordinary_user_cannot_read_one_flags_excerpt(): void
    {
        $flag = $this->flag(User::factory()->create(), ['excerpt' => 'the most sensitive text']);

        Sanctum::actingAs(User::factory()->create());
        $response = $this->getJson("/api/admin/safety-flags/{$flag->id}")->assertNotFound();
        $this->assertStringNotContainsString('the most sensitive text', $response->content());
    }

    public function test_an_ordinary_user_cannot_review_a_flag(): void
    {
        $flag = $this->flag(User::factory()->create());

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/admin/safety-flags/{$flag->id}/review")->assertNotFound();
        $this->assertSame('open', $flag->refresh()->status);
    }

    public function test_an_admin_reads_the_queue_most_severe_first(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner, ['level' => SafetyLevel::Low, 'raised_at' => now()]);
        $this->flag($owner, ['level' => SafetyLevel::High, 'raised_at' => now()->subHour()]);
        $this->flag($owner, ['level' => SafetyLevel::Medium, 'raised_at' => now()]);

        Sanctum::actingAs($this->staff(Role::Admin));
        $levels = array_column($this->getJson('/api/admin/safety-flags')->assertOk()->json('items'), 'level');

        // High first even though it is the oldest: severity outranks recency.
        $this->assertSame(['high', 'medium', 'low'], $levels);
    }

    public function test_the_queue_shows_open_flags_only_by_default(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner, ['excerpt' => 'still open']);
        $this->flag($owner, ['status' => 'reviewed', 'excerpt' => 'already handled']);

        Sanctum::actingAs($this->staff(Role::Admin));

        $open = array_column($this->getJson('/api/admin/safety-flags')->json('items'), 'excerpt');
        $this->assertSame(['still open'], $open);

        $all = array_column($this->getJson('/api/admin/safety-flags?status=all')->json('items'), 'excerpt');
        $this->assertCount(2, $all);
    }

    /**
     * The queue was capped at 200 rows with no way to reach the rest.
     *
     * That is the worse of the two failures available: a grown queue would
     * simply stop showing flags, and the ones it stopped showing would be the
     * ones nobody had looked at.
     */
    public function test_the_queue_pages_rather_than_truncating(): void
    {
        $owner = User::factory()->create();
        for ($i = 0; $i < 5; $i++) {
            $this->flag($owner, ['excerpt' => "flag {$i}", 'raised_at' => now()->subMinutes($i)]);
        }

        Sanctum::actingAs($this->staff(Role::Admin));

        $seen = [];
        $cursor = null;
        do {
            $page = $this->getJson('/api/admin/safety-flags?limit=2'.($cursor === null ? '' : "&cursor={$cursor}"));
            $page->assertOk();
            $seen = [...$seen, ...array_column($page->json('items'), 'excerpt')];
            $cursor = $page->json('nextCursor');
        } while ($cursor !== null);

        // Every flag is reachable, and none is served twice.
        $this->assertSame(['flag 0', 'flag 1', 'flag 2', 'flag 3', 'flag 4'], $seen);
        $this->assertSame(5, $this->getJson('/api/admin/safety-flags')->json('total'));
    }

    /**
     * Flags raised in the same second must still have a settled order.
     *
     * The queue was ordered by a `CASE level ...` expression, which sorts
     * correctly but is not a column a cursor can be built from — so two pages
     * overlapped and a reviewer could have seen one flag twice and another
     * never. Equal timestamps are the case that exposes it.
     */
    public function test_paging_is_stable_when_flags_share_a_timestamp(): void
    {
        $owner = User::factory()->create();
        $at = now();
        $levels = [SafetyLevel::Low, SafetyLevel::High, SafetyLevel::Medium, SafetyLevel::High];
        foreach ($levels as $i => $level) {
            $this->flag($owner, ['level' => $level, 'excerpt' => "flag {$i}", 'raised_at' => $at]);
        }

        Sanctum::actingAs($this->staff(Role::Admin));

        $seen = [];
        $cursor = null;
        do {
            $page = $this->getJson('/api/admin/safety-flags?limit=1'.($cursor === null ? '' : "&cursor={$cursor}"));
            $page->assertOk();
            $seen = [...$seen, ...array_column($page->json('items'), 'excerpt')];
            $cursor = $page->json('nextCursor');
        } while ($cursor !== null);

        // Each flag exactly once, and still most severe first.
        $this->assertCount(4, $seen);
        $this->assertCount(4, array_unique($seen));
        $this->assertSame(
            ['high', 'high', 'medium', 'low'],
            array_column($this->getJson('/api/admin/safety-flags')->json('items'), 'level'),
        );
    }

    public function test_the_severity_column_follows_the_level(): void
    {
        $owner = User::factory()->create();
        $flag = $this->flag($owner, ['level' => SafetyLevel::Low]);
        $this->assertSame(SafetyLevel::Low->rank(), $flag->refresh()->severity);

        // Kept in step on write, so a caller cannot forget it.
        $flag->level = SafetyLevel::High;
        $flag->save();
        $this->assertSame(SafetyLevel::High->rank(), $flag->refresh()->severity);
    }

    public function test_the_total_counts_the_filtered_queue_not_every_flag(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner);
        $this->flag($owner, ['status' => 'reviewed']);

        Sanctum::actingAs($this->staff(Role::Admin));

        $this->assertSame(1, $this->getJson('/api/admin/safety-flags')->json('total'));
        $this->assertSame(2, $this->getJson('/api/admin/safety-flags?status=all')->json('total'));
    }

    public function test_an_admin_sees_the_excerpt_because_the_job_needs_it(): void
    {
        $flag = $this->flag(User::factory()->create(), [
            'excerpt' => 'everyone would be better off without me',
        ]);

        Sanctum::actingAs($this->staff(Role::Admin));
        $this->getJson("/api/admin/safety-flags/{$flag->id}")
            ->assertOk()
            ->assertJsonPath('excerpt', 'everyone would be better off without me');
    }

    public function test_the_queue_never_names_the_user(): void
    {
        $owner = User::factory()->create(['name' => 'Asha Rao', 'email' => 'asha@example.com']);
        $this->flag($owner);

        Sanctum::actingAs($this->staff(Role::Admin));
        $response = $this->getJson('/api/admin/safety-flags')->assertOk();

        $this->assertStringNotContainsString('Asha Rao', $response->content());
        $this->assertStringNotContainsString('asha@example.com', $response->content());
        $this->assertMatchesRegularExpression('/^u_[0-9a-f]{12}$/', $response->json('items.0.user'));
    }

    public function test_the_same_user_always_gets_the_same_handle(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner);
        $this->flag($owner);

        Sanctum::actingAs($this->staff(Role::Admin));
        $handles = array_unique(array_column($this->getJson('/api/admin/safety-flags')->json('items'), 'user'));

        $this->assertCount(1, $handles);
    }

    public function test_reviewing_records_who_and_when(): void
    {
        $flag = $this->flag(User::factory()->create());
        $admin = $this->staff(Role::Admin);

        Sanctum::actingAs($admin);
        $this->postJson("/api/admin/safety-flags/{$flag->id}/review")
            ->assertOk()
            ->assertJsonPath('status', 'reviewed');

        $flag->refresh();
        $this->assertSame($admin->id, $flag->reviewed_by);
        $this->assertNotNull($flag->reviewed_at);
    }

    public function test_reviewing_twice_keeps_the_first_review(): void
    {
        $flag = $this->flag(User::factory()->create());
        $first = $this->staff(Role::Admin);
        $second = $this->staff(Role::Admin);

        Sanctum::actingAs($first);
        $this->postJson("/api/admin/safety-flags/{$flag->id}/review")->assertOk();
        $at = $flag->refresh()->reviewed_at;

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($second);
        $this->postJson("/api/admin/safety-flags/{$flag->id}/review")->assertOk();

        // Reviewing is one-way and the record of who looked is not overwritten.
        $flag->refresh();
        $this->assertSame($first->id, $flag->reviewed_by);
        $this->assertEquals($at, $flag->reviewed_at);
    }

    public function test_a_malformed_status_filter_is_the_default_and_not_a_500(): void
    {
        $this->flag(User::factory()->create());
        Sanctum::actingAs($this->staff(Role::Admin));

        $this->getJson('/api/admin/safety-flags?status[]=open')
            ->assertOk()
            ->assertJsonPath('total', 1);
    }

    private function staff(Role $role): User
    {
        return User::factory()
            ->state(['role' => $role])
            ->create()
            ->refresh();
    }

    /** @param array<string, mixed> $attributes */
    private function flag(User $owner, array $attributes = []): SafetyFlag
    {
        return SafetyFlag::create(array_merge([
            'user_id' => $owner->id,
            'guided_session_id' => null,
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'something they said',
            'outcome' => 'Session stopped. Helplines shown.',
            'status' => 'open',
            'raised_at' => now(),
        ], $attributes));
    }
}
