<?php

declare(strict_types=1);

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A coach's notes about a client, encrypted like everything else personal.
 *
 * `coach_client.coach_notes` is free text a coach writes about a person:
 * what they said on a call, what the coach is worried about. It was the one
 * column of that kind stored as typed. The session, the journal and a safety
 * flag's excerpt have used the `encrypted` cast since they were written, and
 * this one was simply not on the list, so the sentence "personal content is
 * encrypted at rest" was true of every such column except the one a third
 * party writes about somebody.
 *
 * Two steps, and the second is the one with rows in it. The column is widened
 * for the reason the others were: encryption roughly doubles what is stored,
 * and `text` is 65,535 bytes. Then every existing note is encrypted in place.
 */
return new class extends Migration
{
    /** In the shape `EncryptedColumnsAreWideEnoughTest` reads. */
    public const COLUMNS = [
        'coach_client' => ['coach_notes'],
    ];

    public function up(): void
    {
        Schema::table('coach_client', function (Blueprint $table): void {
            $table->mediumText('coach_notes')->nullable()->change();
        });

        $this->encryptExisting();
    }

    public function down(): void
    {
        DB::table('coach_client')->whereNotNull('coach_notes')->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    try {
                        $plain = Crypt::decryptString((string) $row->coach_notes);
                    } catch (DecryptException) {
                        // Not something this key wrote, so not something to
                        // guess at. Left as it is.
                        continue;
                    }

                    DB::table('coach_client')->where('id', $row->id)->update(['coach_notes' => $plain]);
                }
            });

        Schema::table('coach_client', function (Blueprint $table): void {
            $table->text('coach_notes')->nullable()->change();
        });
    }

    /**
     * Encrypts every note that is not already encrypted.
     *
     * Safe to run twice, which a migration that stops half way needs: a value
     * that decrypts under the current key is one this already wrote and is
     * left alone. `encryptString`, because that is what the `encrypted` cast
     * stores, so the model reads back exactly what was typed.
     */
    public function encryptExisting(): void
    {
        DB::table('coach_client')->whereNotNull('coach_notes')->orderBy('id')
            ->chunkById(200, function ($rows): void {
                foreach ($rows as $row) {
                    $stored = (string) $row->coach_notes;

                    try {
                        Crypt::decryptString($stored);

                        continue;
                    } catch (DecryptException) {
                        // Plain text, which is what is being fixed.
                    }

                    DB::table('coach_client')->where('id', $row->id)
                        ->update(['coach_notes' => Crypt::encryptString($stored)]);
                }
            });
    }
};
