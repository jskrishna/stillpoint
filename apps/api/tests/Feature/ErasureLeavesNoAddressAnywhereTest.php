<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Plan;
use App\Models\CoachInvite;
use App\Models\PlanChange;
use App\Models\RoleChange;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * After an erasure, the address is in no column of any table.
 *
 * `AccountDeletionService` documents a **pattern** — "every item on it is
 * something a foreign key does not cover, which is the pattern to look for
 * when a table is added" — and then relies on somebody remembering it. Each
 * item has a test, and each of those tests names the table it is about, so a
 * table added later has no test and nothing says so. `plan_changes` is the
 * worked example: it arrived after that list was written, the sweep for it was
 * added, and the list in `CLAUDE.md` still had five bullets for six things.
 *
 * So this asks the schema instead of a list. It finds every text column whose
 * name mentions an email, in every table, and asserts the erased address is in
 * none of them. A table added tomorrow with an address in it is covered by
 * this test on the day it is created, which a hand-written list cannot be.
 *
 * It is the `RotateEncryptionKey::COLUMNS` idea with the direction reversed:
 * that command refuses when a model declares an encrypted column its own list
 * does not cover, and this discovers the columns rather than declaring them.
 *
 * The thing that makes it worth anything is the second half. A sweep over
 * empty tables passes, so this writes a row into **every** one of those tables
 * first and asserts they are non-empty before erasing. Without that it would
 * be a test that cannot fail.
 */
final class ErasureLeavesNoAddressAnywhereTest extends TestCase
{
    use RefreshDatabase;

    private const ADDRESS = 'aarav@example.com';

    private const PASSWORD = 'correct-horse-battery-staple';

    /**
     * Every text column in the schema whose name mentions an email.
     *
     * By type as well as by name: `users.email_verified_at` is a timestamp and
     * holds no address, and excluding it by name would be a rule that breaks
     * the next time somebody adds `email_changed_at`.
     *
     * @return list<array{string, string}>
     */
    private function addressColumns(): array
    {
        $found = [];

        foreach (Schema::getTables() as $table) {
            foreach (Schema::getColumns($table['name']) as $column) {
                $textual = str_contains(strtolower($column['type']), 'char')
                    || str_contains(strtolower($column['type']), 'text');

                if (str_contains($column['name'], 'email') && $textual) {
                    $found[] = [$table['name'], $column['name']];
                }
            }
        }

        return $found;
    }

    public function test_the_schema_has_address_columns_to_check(): void
    {
        // If this ever reads zero, the sweep below is asserting nothing and
        // the reason is a change in how the schema is introspected rather than
        // a product with no addresses in it.
        $this->assertNotSame([], $this->addressColumns());
    }

    public function test_no_table_holds_the_address_afterwards(): void
    {
        $user = User::factory()->create([
            'email' => self::ADDRESS,
            'password' => bcrypt(self::PASSWORD),
        ]);
        $admin = User::factory()->create(['role' => 'admin']);
        $coach = User::factory()->create(['role' => 'coach']);

        // One row in every table that has an address column, so the sweep
        // cannot pass by finding nothing anywhere.
        RoleChange::create([
            'user_id' => $user->id,
            'user_email' => $user->email,
            'changed_by' => $admin->id,
            'changed_by_email' => $admin->email,
            'from_role' => 'user',
            'to_role' => 'coach',
        ]);
        PlanChange::create([
            'user_id' => $user->id,
            'user_email' => $user->email,
            'changed_by' => $admin->id,
            'changed_by_email' => $admin->email,
            'from_plan' => Plan::Free->value,
            'to_plan' => Plan::Plus->value,
        ]);
        // And as the *actor*, not only the subject: `changed_by_email` is a
        // separate column and is swept separately. This is the real case —
        // somebody who was an admin, changed another account, was later
        // demoted, and then erased their own. The non-vacuity assertion below
        // is what caught this fixture holding the address in only half the
        // columns it sweeps.
        RoleChange::create([
            'user_id' => $coach->id,
            'user_email' => $coach->email,
            'changed_by' => $user->id,
            'changed_by_email' => $user->email,
            'from_role' => 'user',
            'to_role' => 'coach',
        ]);
        PlanChange::create([
            'user_id' => $coach->id,
            'user_email' => $coach->email,
            'changed_by' => $user->id,
            'changed_by_email' => $user->email,
            'from_plan' => Plan::Free->value,
            'to_plan' => Plan::Coach->value,
        ]);
        CoachInvite::open($coach, $user->email);
        Password::broker()->sendResetLink(['email' => $user->email]);

        foreach ($this->addressColumns() as [$table, $column]) {
            $this->assertGreaterThan(
                0,
                DB::table($table)->whereRaw("LOWER({$column}) = ?", [self::ADDRESS])->count(),
                "nothing in {$table}.{$column} held the address, so erasing it proves nothing",
            );
        }

        $token = $user->createToken('test')->plainTextToken;
        $this->withToken($token)->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => 'DELETE',
        ])->assertOk();

        foreach ($this->addressColumns() as [$table, $column]) {
            $this->assertSame(
                0,
                DB::table($table)->whereRaw("LOWER({$column}) = ?", [self::ADDRESS])->count(),
                "{$table}.{$column} still holds the erased address",
            );
        }
    }

    /**
     * And somebody else's address is untouched, which is the other half.
     *
     * A sweep that deleted every row would pass the test above. This is the
     * control, in the same place, because the two failures look identical from
     * one side.
     */
    public function test_it_leaves_another_persons_address_alone(): void
    {
        $user = User::factory()->create([
            'email' => self::ADDRESS,
            'password' => bcrypt(self::PASSWORD),
        ]);
        $other = User::factory()->create(['email' => 'meera@example.com']);
        $admin = User::factory()->create(['role' => 'admin']);

        RoleChange::create([
            'user_id' => $other->id,
            'user_email' => $other->email,
            'changed_by' => $admin->id,
            'changed_by_email' => $admin->email,
            'from_role' => 'user',
            'to_role' => 'coach',
        ]);

        $token = $user->createToken('test')->plainTextToken;
        $this->withToken($token)->deleteJson('/api/me', [
            'password' => self::PASSWORD,
            'confirm' => 'DELETE',
        ])->assertOk();

        $this->assertSame(
            1,
            DB::table('role_changes')->where('user_email', 'meera@example.com')->count(),
        );
    }
}
