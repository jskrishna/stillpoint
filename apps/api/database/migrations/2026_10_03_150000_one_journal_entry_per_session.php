<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One journal row per session, enforced by the database.
 *
 * `SessionService::journal()` already asked whether a row existed before
 * writing one, which is a check and then an act with a gap in between. Two
 * requests that end the same session at the same moment both pass the check and
 * both write, and the user opens their journal to the same session twice.
 *
 * A unique index closes the gap where it actually is. The column is nullable —
 * an entry survives its session being deleted — and MySQL and sqlite both allow
 * many nulls under a unique index, so the nullable case is unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->unique('guided_session_id');
        });
    }

    /**
     * MySQL will not let the unique index go while it is the only index on a
     * foreign key column, and `guided_session_id` has a foreign key. Adding the
     * index back comes first, then the unique one can be dropped.
     *
     * sqlite does not care either way, which is why this only showed up in CI
     * — the `up()` ran everywhere, and only the rollback against MySQL failed.
     */
    public function down(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->index('guided_session_id');
        });

        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropUnique(['guided_session_id']);
        });
    }
};
