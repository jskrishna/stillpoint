<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When the last thing was said into a session.
 *
 * A session's duration was the wall clock from `started_at` to the moment it
 * ended, and ending is not something the person is necessarily present for.
 * `POST /sessions` ends whatever was open, so somebody who answered two
 * questions on Monday and came back on Friday had Monday's session journalled
 * on Friday: measured, **5,760 minutes**, shown to them as "5760 min" in a
 * product whose own home screen says a session takes about 10 to 15 minutes.
 *
 * Start to last turn is not a perfect measure of time spent — a pause between
 * two answers is still counted — but it invents nothing, and it removes the
 * whole dead stretch between somebody's last word and whenever the session got
 * closed, which is where the absurd numbers came from. Counting only the gaps
 * that look like attention would need a threshold for "looks like attention",
 * and that is a product decision rather than a column.
 *
 * Nullable: a session nothing was ever said into has no last turn, and that is
 * a different fact from "it was said at the moment it started".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table): void {
            $table->timestamp('last_turn_at')->nullable()->after('ended_at');
        });

        // Existing rows have no record of it. `updated_at` is the closest
        // thing — for a session that was answered and abandoned it is when it
        // was answered — and it is wrong for one that was ended later, which
        // is the case this column exists for. So only rows that were never
        // ended get it, where `updated_at` is the last turn exactly; the rest
        // keep null and fall back to the old meaning. Nothing has run against
        // real traffic, so in practice this is demo data.
        DB::table('guided_sessions')
            ->whereNull('ended_at')
            ->update(['last_turn_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table): void {
            $table->dropColumn('last_turn_at');
        });
    }
};
