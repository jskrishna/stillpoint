<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Models\GuidedSession;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The safety queue never looks up who the person is.
 *
 * "The console never names anyone" is the rule, and `SafetyFlagResource` keeps
 * it: it prints `UserHandle::for($flag->user_id)`, a salted hash of an integer,
 * and no name and no address. What it was doing anyway was `->with('user')` on
 * the list and `->load('user')` on the single read — so every page of the queue
 * fetched the whole `users` row for every flag on it, name and email included,
 * to render a screen designed not to have them. Nothing used `$flag->user`:
 * grepped across the application, zero call sites.
 *
 * So this is `CoachAttention`'s standard applied one screen over. That read
 * "selects two timestamp columns, not the row", and the reason given there is
 * the reason here: a request that does not ask for the column at all is a rule,
 * where asking and not using it is a habit. On this screen the habit costs
 * more, because the queue is the one place staff read somebody's own words and
 * the handle exists precisely so they cannot also read their name.
 *
 * Asserted on the SQL, because there is nothing in the response to see it by —
 * the version that loaded every user printed exactly the same JSON.
 */
final class TheQueueDoesNotLookUpWhoTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<string> */
    private function sqlWhile(callable $act): array
    {
        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $act();

        return $queries;
    }

    private function flagFor(User $user): SafetyFlag
    {
        $session = GuidedSession::create([
            'user_id' => $user->id,
            'kind' => 'full',
            'protocol_version' => '1.0',
            'safety_level' => SafetyLevel::None,
            'started_at' => now()->subMinutes(5),
        ]);

        return SafetyFlag::create([
            'user_id' => $user->id,
            'guided_session_id' => $session->id,
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'I am not coping with any of this.',
            'outcome' => 'Flagged for review. Session continued.',
            'status' => 'open',
            'raised_at' => now(),
        ]);
    }

    public function test_the_queue_reads_no_users_row(): void
    {
        $this->flagFor(User::factory()->create());
        $this->flagFor(User::factory()->create());

        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $queries = $this->sqlWhile(function (): void {
            $this->getJson('/api/admin/safety-flags')->assertOk();
        });

        // Matched on the real shape, which took printing the SQL to learn:
        // Eloquent **inlines** integer keys for an eager load, so it is
        // `"users"."id" in (1, 2)` and not `in (?, ?)`. The first version of
        // this assertion looked for the bound form and passed with the eager
        // load still in place — a check that was not looking at the thing it
        // named.
        foreach ($queries as $sql) {
            $this->assertStringNotContainsString(
                '"users"."id" in',
                $sql,
                "the queue looked up who the flags belong to: {$sql}",
            );
            $this->assertStringNotContainsString(
                '`users`.`id` in',
                $sql,
                "the queue looked up who the flags belong to: {$sql}",
            );
        }

        // And it did read the flags, so the assertion above is not vacuous.
        $this->assertNotEmpty(
            array_filter($queries, static fn (string $sql) => str_contains($sql, 'safety_flags')),
        );
    }

    public function test_one_flag_reads_no_users_row(): void
    {
        $flag = $this->flagFor(User::factory()->create());

        Sanctum::actingAs(User::factory()->admin()->create());

        $queries = $this->sqlWhile(function () use ($flag): void {
            $this->getJson("/api/admin/safety-flags/{$flag->id}")->assertOk();
        });

        // The same shape with one id — `"users"."id" in (1)` — and counting
        // users reads instead was the other wrong answer: `Sanctum::actingAs`
        // resolves without touching the database, so the single read this
        // expected to be the bearer token's **was** the eager load, and the
        // count of one passed for precisely the wrong reason. Printing the SQL
        // is what settled both.
        $this->assertNotEmpty(
            array_filter($queries, static fn (string $sql) => str_contains($sql, 'safety_flags')),
        );

        foreach ($queries as $sql) {
            $this->assertStringNotContainsString('"users"."id" in', $sql, "read a users row: {$sql}");
            $this->assertStringNotContainsString('`users`.`id` in', $sql, "read a users row: {$sql}");
        }
    }

    /**
     * And marking one reviewed, which was the third.
     *
     * There were three eager loads, not two: the list, the single read and the
     * response to "Mark as reviewed". Two of them turned up in the grep that
     * started this and the third only when the code was re-read afterwards —
     * which is why this case exists rather than the two above standing for the
     * controller.
     */
    public function test_marking_one_reviewed_reads_no_users_row(): void
    {
        $flag = $this->flagFor(User::factory()->create());

        Sanctum::actingAs(User::factory()->admin()->create());

        $queries = $this->sqlWhile(function () use ($flag): void {
            $this->postJson("/api/admin/safety-flags/{$flag->id}/review")->assertOk();
        });

        $this->assertNotEmpty(
            array_filter($queries, static fn (string $sql) => str_contains($sql, 'safety_flags')),
        );

        foreach ($queries as $sql) {
            $this->assertStringNotContainsString('"users"."id" in', $sql, "read a users row: {$sql}");
            $this->assertStringNotContainsString('`users`.`id` in', $sql, "read a users row: {$sql}");
        }
    }

    /** And the handle is still what the response carries, rather than a name. */
    public function test_the_response_names_nobody(): void
    {
        $user = User::factory()->create(['name' => 'Asha Verma', 'email' => 'asha@example.com']);
        $this->flagFor($user);

        Sanctum::actingAs(User::factory()->admin()->create());

        $body = $this->getJson('/api/admin/safety-flags')->assertOk()->content();

        $this->assertStringNotContainsString('Asha Verma', $body);
        $this->assertStringNotContainsString('asha@example.com', $body);
        $this->assertStringContainsString('"user":"u_', $body);
    }
}
