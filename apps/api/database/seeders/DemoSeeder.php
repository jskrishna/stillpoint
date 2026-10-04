<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\ClientStatus;
use App\Domain\Role;
use App\Models\User;
use App\Services\ProtocolVersionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;

/**
 * The accounts the end-to-end checks and a local demo both need.
 *
 * `role` is deliberately not fillable and pairing has no public route, so there
 * is no way to produce a coach or an admin through the API — which is correct,
 * and which means every run of `e2e/admin.mjs` or `e2e/coach.mjs` used to start
 * with someone pasting artisan commands out of a README. This is that, written
 * down and idempotent.
 *
 * It creates **accounts and a pairing, and nothing else**. No sessions, no
 * journal entries, no safety flags: the checks make their own, because a
 * fixture that already contains what a test is about is a test that passes
 * whether or not the code works. It is also why the seeded password is a
 * passphrase rather than something memorable — these accounts exist in
 * development and in CI, and nowhere that matters.
 *
 * Re-running it is safe. It matches on the email address and leaves anything
 * else about an existing account alone, apart from resetting the password and
 * the role, which is the point of running it again.
 */
final class DemoSeeder extends Seeder
{
    /**
     * The one password for every seeded account.
     *
     * `SEED_PASSWORD` overrides it. Long and dull on purpose: it is not a
     * secret, and it should not look like one worth trying elsewhere.
     */
    public const PASSWORD = 'correct-horse-battery-staple';

    public function run(): void
    {
        $password = (string) (env('SEED_PASSWORD') ?? self::PASSWORD);

        $user = $this->account('you@stillpoint.test', 'You', Role::User, $password);
        $admin = $this->account('admin@stillpoint.test', 'Reviewer', Role::Admin, $password);
        $coach = $this->account('coach@stillpoint.test', 'Meera', Role::Coach, $password);
        $client = $this->account('client@stillpoint.test', 'Arjun', Role::User, $password);

        // `e2e/coach.mjs` ends a pairing and checks the coach's list shrinks, so
        // it needs more than one client to shrink from.
        foreach ([$client, $user] as $paired) {
            $this->pair($coach, $paired);
        }

        $this->publishStepCopy();

        $this->command?->info('Seeded 4 accounts; password: '.$password);
        $this->command?->info("  user   {$user->email}");
        $this->command?->info("  admin  {$admin->email}");
        $this->command?->info("  coach  {$coach->email} (paired with 2 clients)");
        $this->command?->info("  client {$client->email}");
    }

    private function account(string $email, string $name, Role $role, string $password): User
    {
        $user = User::firstOrNew(['email' => $email]);

        $user->name = $user->exists ? $user->name : $name;
        $user->password = Hash::make($password);
        // Assigned here rather than through `fill`, because `role` is not
        // fillable — which is the rule that makes this seeder necessary.
        $user->role = $role;
        $user->plan ??= 'free';
        // No country here on purpose. It used to be `??= 'IN'`, written when
        // India was the only market, so every demo account's safety stop
        // offered Tele-MANAS and 112 after Canada became the first one — a
        // seeder quietly holding the second market's crisis numbers. The
        // column's default is the answer (`CA`), and leaving it to the column
        // means the next market change is one migration rather than a search
        // for everywhere that guessed.

        // Consent is the server's gate on starting a session. A seeded account
        // that has not consented cannot do the thing it was seeded to do, and
        // the failure arrives three screens later as a 403.
        $user->accepted_consent = ['understands', 'adult'];
        $user->consented_at ??= now();

        $user->save();

        return $user;
    }

    /**
     * Publishes the draft step copy, so a demo or a development database has a
     * guide that speaks at every step.
     *
     * In production nothing publishes itself: an admin reads the draft at
     * `/admin/protocol` and presses the button, which is the point of the
     * editor. This seeder exists to make a working demo, and a demo where
     * three of the six steps are silent is not one — and `e2e/flow.mjs` asserts
     * a question at every step, which it can only do against a published
     * version.
     *
     * Already-published copy is left alone, and so is anything a person has
     * edited: `stillpoint:draft-step-copy` only fills what is empty.
     */
    private function publishStepCopy(): void
    {
        $versions = app(ProtocolVersionService::class);

        if ($versions->current()->status === 'live') {
            $this->command?->info('  protocol already published; left alone');

            return;
        }

        Artisan::call('stillpoint:draft-step-copy');
        $published = $versions->publishDraft();

        $this->command?->info($published === null
            ? '  protocol NOT published — the draft is still incomplete'
            : "  protocol v{$published->major}.{$published->minor} published (draft copy, unreviewed)");
    }

    private function pair(User $coach, User $client): void
    {
        if ($coach->clients()->whereKey($client->getKey())->exists()) {
            return;
        }

        $coach->clients()->attach($client->getKey(), [
            'status' => ClientStatus::Active->value,
            'since' => now(),
        ]);
    }
}
