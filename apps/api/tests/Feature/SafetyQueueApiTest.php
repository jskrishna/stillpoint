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
        $levels = array_column($this->getJson('/api/admin/safety-flags')->assertOk()->json(), 'level');

        // High first even though it is the oldest: severity outranks recency.
        $this->assertSame(['high', 'medium', 'low'], $levels);
    }

    public function test_the_queue_shows_open_flags_only_by_default(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner, ['excerpt' => 'still open']);
        $this->flag($owner, ['status' => 'reviewed', 'excerpt' => 'already handled']);

        Sanctum::actingAs($this->staff(Role::Admin));

        $open = array_column($this->getJson('/api/admin/safety-flags')->json(), 'excerpt');
        $this->assertSame(['still open'], $open);

        $all = array_column($this->getJson('/api/admin/safety-flags?status=all')->json(), 'excerpt');
        $this->assertCount(2, $all);
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
        $this->assertMatchesRegularExpression('/^u_[0-9a-f]{4}$/', $response->json('0.user'));
    }

    public function test_the_same_user_always_gets_the_same_handle(): void
    {
        $owner = User::factory()->create();
        $this->flag($owner);
        $this->flag($owner);

        Sanctum::actingAs($this->staff(Role::Admin));
        $handles = array_unique(array_column($this->getJson('/api/admin/safety-flags')->json(), 'user'));

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
