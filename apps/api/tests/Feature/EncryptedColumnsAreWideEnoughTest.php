<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use ReflectionClass;
use Tests\TestCase;

/**
 * The encrypted columns are sized in bytes, and the product is India-first.
 *
 * Every one of them was `text` — 65,535 **bytes** on MySQL, not characters.
 * Devanagari is three bytes a character in UTF-8 and Laravel's `encrypted` cast
 * roughly doubles what it stores on top of that, so one full session answered
 * in Hindi encrypted to 90,400 bytes and did not fit, while the same session in
 * English fitted twice over. It failed for the language the product is for and
 * for nobody else.
 *
 * Nothing here caught it, because the suite and the development container run
 * on sqlite, where `text` is unbounded. So these tests assert the two things
 * that *can* be asserted off MySQL: that the widening migration covers every
 * column an `encrypted` cast writes to, and that the arithmetic which made the
 * old width too small is what it is.
 */
final class EncryptedColumnsAreWideEnoughTest extends TestCase
{
    use RefreshDatabase;

    /** MySQL's `TEXT`, in bytes. The width every one of these columns had. */
    private const TEXT_BYTES = 65535;

    /**
     * @return array<string, list<string>>
     */
    private function widenedColumns(): array
    {
        $file = database_path('migrations/2026_10_03_180000_widen_the_encrypted_text_columns.php');
        $this->assertFileExists($file);

        /** @var object $migration */
        $migration = require $file;

        /** @var array<string, list<string>> $columns */
        $columns = (new ReflectionClass($migration))->getConstant('COLUMNS');

        return $columns;
    }

    /**
     * @return list<string>
     */
    private function encryptedColumns(): array
    {
        $found = [];

        foreach ([GuidedSession::class, JournalEntry::class, SafetyFlag::class] as $class) {
            /** @var Model $model */
            $model = new $class;
            foreach ($model->getCasts() as $column => $cast) {
                if (is_string($cast) && str_starts_with($cast, 'encrypted')) {
                    $found[] = "{$model->getTable()}.{$column}";
                }
            }
        }

        sort($found);

        return $found;
    }

    public function test_every_encrypted_column_was_widened(): void
    {
        $widened = [];
        foreach ($this->widenedColumns() as $table => $columns) {
            foreach ($columns as $column) {
                $widened[] = "{$table}.{$column}";
            }
        }
        sort($widened);

        // A new `encrypted` cast on a column that is still `text` is a column
        // that holds about 21,000 Devanagari characters and then errors. If
        // this fails, the migration needs the new column too — or a new
        // migration does.
        $this->assertSame($this->encryptedColumns(), $widened);
    }

    /**
     * Why `text` was not enough, as arithmetic rather than as a claim.
     *
     * If this ever stops failing against `TEXT`, the cast's overhead or the
     * recorded-utterance limit has changed and the column widths are worth
     * re-deriving rather than trusted.
     */
    public function test_one_session_answered_in_hindi_does_not_fit_in_a_text_column(): void
    {
        $one = mb_substr(str_repeat('मुझे यह सब बहुत भारी लग रहा है और कोई सुनता नहीं। ', 120), 0, 5000);

        $plain = json_encode([
            'whatHappened' => $one,
            'belief' => $one,
            'forgiveness' => $one,
            'title' => mb_substr($one, 0, 80),
            'feelings' => ['anger', 'shame', 'fear'],
            'memory' => ['what' => $one, 'who' => 'my father'],
        ], JSON_UNESCAPED_UNICODE);

        $this->assertIsString($plain);
        $stored = strlen(Crypt::encryptString($plain));

        $this->assertGreaterThan(
            self::TEXT_BYTES,
            $stored,
            'a full session in Hindi fits in TEXT after all, so these columns can be re-derived',
        );
    }

    /**
     * The same session in English fits, which is the shape of the bug: it was
     * never going to show up in a test written in English.
     */
    public function test_the_same_session_in_english_fits_in_a_text_column(): void
    {
        $one = substr(str_repeat('I have been trying to explain this for weeks and nobody listens. ', 100), 0, 5000);

        $plain = json_encode([
            'whatHappened' => $one,
            'belief' => $one,
            'forgiveness' => $one,
            'title' => substr($one, 0, 80),
            'feelings' => ['anger', 'shame', 'fear'],
            'memory' => ['what' => $one, 'who' => 'my father'],
        ]);

        $this->assertIsString($plain);
        $this->assertLessThan(self::TEXT_BYTES, strlen(Crypt::encryptString($plain)));
    }

    /** A long session in Hindi now round-trips, which is the point of the width. */
    public function test_a_long_hindi_session_round_trips_through_the_database(): void
    {
        $one = mb_substr(str_repeat('मुझे यह सब बहुत भारी लग रहा है और कोई सुनता नहीं। ', 500), 0, 20000);

        $user = User::factory()->create();
        $session = GuidedSession::create([
            'user_id' => $user->id,
            'kind' => SessionKind::Full,
            'step_id' => StepId::Forgive,
            'safety_level' => SafetyLevel::None,
            'protocol_version' => '1.0',
            'data' => [
                'whatHappened' => $one,
                'belief' => $one,
                'forgiveness' => $one,
                'feelings' => ['anger'],
            ],
            'started_at' => now(),
        ]);

        $read = GuidedSession::query()->findOrFail($session->id);
        $this->assertSame($one, $read->data['whatHappened']);
        $this->assertSame(20000, mb_strlen($read->data['belief']));
    }
}
