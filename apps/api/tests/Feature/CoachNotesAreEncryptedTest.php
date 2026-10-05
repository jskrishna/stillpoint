<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Console\Commands\RotateEncryptionKey;
use App\Domain\ClientStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use ReflectionClass;
use Tests\TestCase;

/**
 * What a coach writes about a client is encrypted at rest.
 *
 * Measured before it was: a coach saved a note through the portal and the raw
 * column held the sentence as typed. It is free text about a person, written
 * by somebody else, and it was the only column of that kind the `encrypted`
 * cast had not reached.
 *
 * The second half of this file is the reason it went unnoticed. Both checks
 * that are meant to catch an encrypted column nobody accounted for, the key
 * rotation's and the column-width test's, looked at three models by name. A
 * fourth model was outside both, so adding a cast to it would have left that
 * text on the old key through a rotation, and the step after a rotation is to
 * destroy the old key.
 */
final class CoachNotesAreEncryptedTest extends TestCase
{
    use RefreshDatabase;

    private const NOTE = 'She mentioned not sleeping, and that her manager singled her out again.';

    /** @return array{User, User} */
    private function pairing(): array
    {
        $coach = User::factory()->coach()->create();
        $client = User::factory()->create();
        DB::table('coach_client')->insert([
            'coach_id' => $coach->id,
            'client_id' => $client->id,
            'status' => ClientStatus::Active->value,
            'since' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$coach, $client];
    }

    public function test_a_saved_note_is_not_readable_in_the_table(): void
    {
        [$coach, $client] = $this->pairing();
        Sanctum::actingAs($coach);

        $this->patchJson("/api/coach/clients/{$client->id}", ['coachNotes' => self::NOTE])
            ->assertOk()
            ->assertJsonPath('coachNotes', self::NOTE);

        $stored = (string) DB::table('coach_client')->where('client_id', $client->id)->value('coach_notes');

        $this->assertStringNotContainsString('manager', $stored);
        $this->assertSame(self::NOTE, Crypt::decryptString($stored));

        // And it still reads back, on both of the coach's screens.
        $this->getJson("/api/coach/clients/{$client->id}")->assertOk()->assertJsonPath('coachNotes', self::NOTE);
        $this->assertSame(self::NOTE, $this->getJson('/api/coach/clients')->assertOk()->json('0.coachNotes'));
    }

    public function test_clearing_a_note_stores_nothing(): void
    {
        [$coach, $client] = $this->pairing();
        Sanctum::actingAs($coach);

        $this->patchJson("/api/coach/clients/{$client->id}", ['coachNotes' => self::NOTE])->assertOk();
        $this->patchJson("/api/coach/clients/{$client->id}", ['coachNotes' => ''])
            ->assertOk()
            ->assertJsonPath('coachNotes', null);

        $this->assertNull(DB::table('coach_client')->where('client_id', $client->id)->value('coach_notes'));
    }

    public function test_the_migration_encrypts_a_note_that_was_already_there(): void
    {
        [$coach, $client] = $this->pairing();
        // As every note was stored before this: typed, and as typed.
        DB::table('coach_client')->where('client_id', $client->id)->update(['coach_notes' => self::NOTE]);

        /** @var object{encryptExisting: callable} $migration */
        $migration = require database_path('migrations/2026_10_06_000000_encrypt_the_coachs_notes.php');
        $migration->encryptExisting();

        $stored = (string) DB::table('coach_client')->where('client_id', $client->id)->value('coach_notes');
        $this->assertNotSame(self::NOTE, $stored);
        $this->assertSame(self::NOTE, Crypt::decryptString($stored));

        // Twice is once: a migration that stops half way is run again.
        $migration->encryptExisting();
        $this->assertSame(
            $stored,
            (string) DB::table('coach_client')->where('client_id', $client->id)->value('coach_notes'),
        );

        Sanctum::actingAs($coach);
        $this->getJson("/api/coach/clients/{$client->id}")->assertOk()->assertJsonPath('coachNotes', self::NOTE);
    }

    public function test_a_key_rotation_covers_every_encrypted_column_of_every_model(): void
    {
        // Found by reading the models directory, not by naming models: the
        // hand-written list is what a fourth model slipped past.
        $declared = [];
        foreach (glob(app_path('Models/*.php')) ?: [] as $file) {
            $class = 'App\\Models\\'.basename($file, '.php');
            /** @var Model $model */
            $model = new $class;
            foreach ($model->getCasts() as $column => $cast) {
                if (is_string($cast) && str_starts_with($cast, 'encrypted')) {
                    $declared[] = $model->getTable().'.'.$column;
                }
            }
        }
        sort($declared);

        $covered = [];
        /** @var array<class-string<Model>, list<string>> $columns */
        $columns = (new ReflectionClass(RotateEncryptionKey::class))->getConstant('COLUMNS');
        foreach ($columns as $class => $names) {
            foreach ($names as $name) {
                $covered[] = (new $class)->getTable().'.'.$name;
            }
        }
        sort($covered);

        // Not vacuous: the models were found, and this column is among them.
        $this->assertContains('coach_client.coach_notes', $declared);
        $this->assertSame($declared, $covered);
    }

    public function test_the_rotation_itself_reads_the_models_directory(): void
    {
        // The command's own refusal, which is what stops a rotation rather
        // than a test run. Its check walked its own list, so a model missing
        // from the list was a model it never looked at.
        $source = (string) file_get_contents(app_path('Console/Commands/RotateEncryptionKey.php'));
        $code = (string) preg_replace('#/\*.*?\*/|//[^\n]*#s', '', $source);

        $this->assertStringContainsString("app_path('Models", $code);
    }
}
