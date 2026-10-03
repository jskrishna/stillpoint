<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Re-encrypts every personal column under the current `APP_KEY`.
 *
 * `APP_KEY` is the whole journal: there is no second copy of this text and no
 * recovery path, so changing the key is a migration rather than a
 * configuration change. `deploy/README.md` said as much and said nothing here
 * did it. This does it.
 *
 * The procedure is two steps, and the order is the whole safety of it:
 *
 *  1. Put the **old** key in `APP_PREVIOUS_KEYS` and the **new** one in
 *     `APP_KEY`. Laravel reads with either, so the app keeps working and
 *     nothing is lost if this is where you stop.
 *  2. Run this. Then, once it reports a clean pass, remove the old key.
 *
 * Reading uses Laravel's own cast, so a row encrypted under either key is read
 * and written back under the current one. That makes a half-finished run
 * harmless and the command safe to re-run: a row already rotated is simply
 * rotated again.
 *
 * What it must never do is write a value it could not read. A row that
 * decrypts under no configured key is counted, named and left exactly as it
 * is — the ciphertext is the only copy of that text, and overwriting it with a
 * guess would turn a recoverable mistake (the right key is somewhere) into the
 * unrecoverable one.
 */
final class RotateEncryptionKey extends Command
{
    protected $signature = 'stillpoint:rotate-key
                            {--dry-run : Read every row and report, writing nothing}
                            {--chunk=200 : Rows held in memory at once}';

    protected $description = 'Re-encrypt the journal, sessions and safety flags under the current APP_KEY';

    /**
     * Every encrypted column in the schema, by the model that owns it.
     *
     * Listed here rather than discovered from the casts so that adding an
     * encrypted column is a deliberate addition to this list too. A column
     * missed here is a column that silently keeps the old key — which is
     * exactly the failure the second step of the procedure makes permanent.
     *
     * @var array<class-string<Model>, list<string>>
     */
    private const COLUMNS = [
        GuidedSession::class => ['data'],
        JournalEntry::class => ['title', 'what_happened', 'belief', 'forgiveness', 'memory', 'note'],
        SafetyFlag::class => ['excerpt'],
    ];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $chunk = max(1, (int) $this->option('chunk'));

        if (! is_string(config('app.key')) || config('app.key') === '') {
            $this->error('APP_KEY is not set. There is nothing to encrypt under.');

            return self::FAILURE;
        }

        $previous = config('app.previous_keys');
        if (! $dryRun && (! is_array($previous) || $previous === [])) {
            $this->error('APP_PREVIOUS_KEYS is empty, so there is no old key to rotate away from.');
            $this->newLine();
            $this->line('If you are rotating: put the old key in APP_PREVIOUS_KEYS and the new one');
            $this->line('in APP_KEY first, then run this. Rows are then readable under either, so');
            $this->line('a run that stops half way loses nothing.');
            $this->newLine();
            $this->line('If you only want to know whether the current key can read what is stored,');
            $this->line('that is `--dry-run`.');

            return self::FAILURE;
        }

        $uncovered = $this->uncoveredColumns();
        if ($uncovered !== []) {
            $this->error('These encrypted columns are not in this command\'s list:');
            foreach ($uncovered as $column) {
                $this->line("  {$column}");
            }
            $this->newLine();
            $this->line('Add them to RotateEncryptionKey::COLUMNS. Rotating without them would');
            $this->line('leave that text on the old key, and removing the old key would then');
            $this->line('destroy it.');

            return self::FAILURE;
        }

        $rotated = 0;
        $unreadable = [];

        foreach (self::COLUMNS as $model => $columns) {
            /** @var Model $instance */
            $instance = new $model;
            $table = $instance->getTable();
            $keyName = $instance->getKeyName();

            $total = $model::query()->count();
            $this->line(sprintf('%s — %d row%s', $table, $total, $total === 1 ? '' : 's'));

            if ($total === 0) {
                continue;
            }

            $bar = $this->output->createProgressBar($total);
            $bar->start();

            // Chunked by id, and each row written on its own rather than a
            // chunk at a time inside a transaction. A long transaction over
            // every journal in the database would hold locks for the length of
            // the rotation, and it buys nothing: re-encrypting a row that is
            // already on the new key is a no-op, so stopping part-way is safe
            // and re-running is safe.
            $model::query()->orderBy($keyName)->chunkById($chunk, function ($rows) use (
                $columns, $table, $keyName, $dryRun, $bar, &$rotated, &$unreadable
            ): void {
                foreach ($rows as $row) {
                    $update = [];
                    $failed = false;

                    foreach ($columns as $column) {
                        try {
                            $plain = $row->getAttribute($column);
                        } catch (DecryptException) {
                            $unreadable[] = "{$table}.{$column} #{$row->getKey()}";
                            $failed = true;

                            continue;
                        }

                        if ($plain === null) {
                            continue;
                        }

                        // Through the model's own cast, so the stored shape is
                        // whatever the cast writes — including the JSON step
                        // that `encrypted:array` adds — rather than a second
                        // definition of it here.
                        $row->setAttribute($column, $plain);
                        $update[$column] = $row->getAttributes()[$column];
                    }

                    // A row with an unreadable column is left entirely alone.
                    // Writing its readable columns would be correct and would
                    // also make the failure look half-handled; one untouched
                    // row is easier to reason about when the right key turns up.
                    if ($failed || $update === []) {
                        $bar->advance();

                        continue;
                    }

                    if (! $dryRun) {
                        // Raw, so `updated_at` does not move and no model event
                        // fires: re-encryption is not an edit to the entry.
                        DB::table($table)->where($keyName, $row->getKey())->update($update);
                    }

                    $rotated++;
                    $bar->advance();
                }
            });

            $bar->finish();
            $this->newLine();
        }

        $this->newLine();

        if ($unreadable !== []) {
            $this->error(sprintf('%d column%s could not be decrypted under any configured key:',
                count($unreadable), count($unreadable) === 1 ? '' : 's'));
            foreach (array_slice($unreadable, 0, 20) as $where) {
                $this->line("  {$where}");
            }
            if (count($unreadable) > 20) {
                $this->line(sprintf('  … and %d more', count($unreadable) - 20));
            }
            $this->newLine();
            $this->line('Nothing was written for those rows. Find the key that reads them and add');
            $this->line('it to APP_PREVIOUS_KEYS before running this again. Do not remove a key');
            $this->line('while this list is not empty.');

            return self::FAILURE;
        }

        if ($dryRun) {
            $this->info(sprintf('Every row read cleanly. %d would be re-encrypted.', $rotated));

            return self::SUCCESS;
        }

        $this->info(sprintf('%d row%s re-encrypted under the current APP_KEY.',
            $rotated, $rotated === 1 ? '' : 's'));
        $this->newLine();
        $this->line('Now, and only now, remove the old key from APP_PREVIOUS_KEYS.');

        return self::SUCCESS;
    }

    /**
     * Encrypted columns the models declare that this command does not cover.
     *
     * The list above has to be maintained by hand; this is what makes
     * forgetting it loud instead of silent.
     *
     * @return list<string>
     */
    private function uncoveredColumns(): array
    {
        $missing = [];

        foreach (self::COLUMNS as $model => $covered) {
            /** @var Model $instance */
            $instance = new $model;

            foreach ($instance->getCasts() as $column => $cast) {
                if (! is_string($cast) || ! str_starts_with($cast, 'encrypted')) {
                    continue;
                }
                if (! in_array($column, $covered, true)) {
                    $missing[] = $instance->getTable().'.'.$column;
                }
            }
        }

        return $missing;
    }
}
