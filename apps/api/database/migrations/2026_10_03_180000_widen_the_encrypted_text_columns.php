<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every column holding encrypted personal text was `text`, which on MySQL is
 * 65,535 **bytes** — not characters.
 *
 * That is too small, and it was too small already. Measured: one full session
 * answered in Hindi, at the 5,000-character ceiling the API enforced at the
 * time, encrypts to 90,400 bytes of `guided_sessions.data`. Devanagari is three
 * bytes a character in UTF-8 and Laravel's `encrypted` cast roughly doubles
 * what it stores on top of that, so the same session that fits comfortably in
 * English does not fit in Hindi — in an India-first product, failing for the
 * language the product is for and for nobody else.
 *
 * It had not been seen because the tests and the development container run on
 * sqlite, where `text` has no such limit. On MySQL in strict mode the write
 * errors and the turn 500s; with strict mode off it would truncate, and a
 * truncated ciphertext does not decrypt — the whole session's content would be
 * unreadable rather than short.
 *
 * `mediumText` is 16MB, which is past anything these columns can be handed:
 * `App\Domain\Utterance::RECORDED_LIMIT` bounds one answer at 20,000
 * characters, so the largest a session's `data` can be is six of those plus a
 * title, around 640KB encrypted at three bytes a character.
 *
 * Nothing here is reversible-unsafe: narrowing back in `down()` is fine on an
 * empty database, which is what CI's up-and-down check runs against, and on a
 * database with real rows it would fail rather than truncate — which is the
 * right way round for this column.
 */
return new class extends Migration
{
    /** Table => the encrypted text columns on it. Public so a test can read it. */
    public const COLUMNS = [
        'guided_sessions' => ['data'],
        'journal_entries' => ['title', 'what_happened', 'belief', 'forgiveness', 'memory', 'note'],
        'safety_flags' => ['excerpt'],
    ];

    /** The ones that may be null, so `change()` does not make them required. */
    public const NULLABLE = [
        'guided_sessions.data',
        'journal_entries.what_happened',
        'journal_entries.belief',
        'journal_entries.forgiveness',
        'journal_entries.memory',
        'journal_entries.note',
    ];

    public function up(): void
    {
        $this->retype('mediumText');
    }

    public function down(): void
    {
        $this->retype('text');
    }

    private function retype(string $type): void
    {
        foreach (self::COLUMNS as $table => $columns) {
            Schema::table($table, function (Blueprint $blueprint) use ($table, $columns, $type): void {
                foreach ($columns as $column) {
                    $definition = $blueprint->{$type}($column);
                    if (in_array("{$table}.{$column}", self::NULLABLE, true)) {
                        $definition->nullable();
                    }
                    $definition->change();
                }
            });
        }
    }
};
