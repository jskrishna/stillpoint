<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Rotating `APP_KEY`.
 *
 * The assertion that matters is not "the command ran" but "the text is
 * readable with the new key and the old one gone" — because removing the old
 * key is the step that cannot be undone. Each test ends by taking the old key
 * away and reading.
 */
final class RotateEncryptionKeyTest extends TestCase
{
    use RefreshDatabase;

    private function newKey(): string
    {
        // 32 bytes, which is what AES-256-CBC takes.
        return 'base64:'.base64_encode(random_bytes(32));
    }

    /**
     * Rebuilds the encrypter, which is a singleton holding the key it was made
     * with. Without this, changing the config changes nothing.
     *
     * @param  list<string>  $previous
     */
    private function useKeys(string $key, array $previous = []): void
    {
        config(['app.key' => $key, 'app.previous_keys' => $previous]);
        $this->app->forgetInstance('encrypter');
        Crypt::clearResolvedInstances();
    }

    private function entry(): JournalEntry
    {
        return JournalEntry::create([
            'user_id' => User::factory()->create()->id,
            'title' => 'The meeting',
            'what_happened' => 'My manager dismissed my work in front of the team',
            'belief' => 'I am not good enough',
            'memory' => ['Being talked over at school'],
            'note' => null,
            'feelings' => ['ashamed'],
            'kind' => SessionKind::Full,
            'duration_minutes' => 14,
            'occurred_at' => now(),
            'reached_final_step' => true,
        ]);
    }

    private function flag(): SafetyFlag
    {
        return SafetyFlag::create([
            'user_id' => User::factory()->create()->id,
            'guided_session_id' => null,
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'I cannot go on',
            'outcome' => 'Session stopped. Helplines shown.',
            'status' => 'open',
            'raised_at' => now(),
        ]);
    }

    public function test_the_text_survives_the_old_key_being_removed(): void
    {
        $old = (string) config('app.key');
        $entry = $this->entry();
        $flag = $this->flag();

        $new = $this->newKey();
        $this->useKeys($new, [$old]);

        $this->artisan('stillpoint:rotate-key')->assertSuccessful();

        // The old key is gone, as the last step of the procedure says to do.
        $this->useKeys($new);

        $reread = JournalEntry::query()->findOrFail($entry->getKey());
        $this->assertSame('The meeting', $reread->title);
        $this->assertSame('I am not good enough', $reread->belief);
        $this->assertSame(['Being talked over at school'], $reread->memory);
        $this->assertNull($reread->note);
        $this->assertSame(
            'I cannot go on',
            SafetyFlag::query()->findOrFail($flag->getKey())->excerpt,
        );
    }

    public function test_it_refuses_when_there_is_no_old_key_to_rotate_from(): void
    {
        $entry = $this->entry();
        $before = DB::table('journal_entries')->where('id', $entry->getKey())->value('title');

        $this->artisan('stillpoint:rotate-key')->assertFailed();

        $this->assertSame(
            $before,
            DB::table('journal_entries')->where('id', $entry->getKey())->value('title'),
            'a refused run must not have written anything',
        );
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $old = (string) config('app.key');
        $entry = $this->entry();
        $before = DB::table('journal_entries')->where('id', $entry->getKey())->value('title');

        $this->useKeys($this->newKey(), [$old]);
        $this->artisan('stillpoint:rotate-key', ['--dry-run' => true])->assertSuccessful();

        $this->assertSame(
            $before,
            DB::table('journal_entries')->where('id', $entry->getKey())->value('title'),
        );
    }

    public function test_every_encrypted_column_in_the_schema_is_covered(): void
    {
        // The command's list of columns is maintained by hand, and a column
        // left off it would keep the old key — which the last step of the
        // procedure then destroys. The command refuses rather than letting
        // that happen, so this passes only while the list is complete.
        $this->useKeys((string) config('app.key'), ['base64:'.base64_encode(random_bytes(32))]);

        $this->artisan('stillpoint:rotate-key')->assertSuccessful();
    }

    public function test_a_dry_run_fails_when_the_current_key_cannot_read_a_row(): void
    {
        $this->entry();

        // A new key with no previous one: the row is now unreadable, which is
        // exactly the state a careless redeploy leaves behind. A dry run is how
        // you find that out before a user does.
        $this->useKeys($this->newKey());

        $this->artisan('stillpoint:rotate-key', ['--dry-run' => true])->assertFailed();
    }

    public function test_an_unreadable_row_is_left_exactly_as_it_was(): void
    {
        $old = (string) config('app.key');
        $readable = $this->entry();

        // A row encrypted under a key nobody will ever configure. The
        // ciphertext is the only copy of that text, so the command must not
        // overwrite it with anything.
        $lost = $this->entry();
        $this->useKeys($this->newKey());
        $ciphertext = Crypt::encryptString('words from a key that is gone');
        DB::table('journal_entries')->where('id', $lost->getKey())->update(['title' => $ciphertext]);

        $this->useKeys($this->newKey(), [$old]);
        $this->artisan('stillpoint:rotate-key')->assertFailed();

        $this->assertSame(
            $ciphertext,
            DB::table('journal_entries')->where('id', $lost->getKey())->value('title'),
            'the unreadable row must be byte-for-byte what it was',
        );

        // And the rest of the journal was still rotated, so one lost row does
        // not hold up the others.
        $this->assertNotNull(JournalEntry::query()->findOrFail($readable->getKey())->title);
    }
}
