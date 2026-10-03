<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How far a session actually got.
 *
 * `step_id` cannot answer it: ending a session sets it to null, so after the
 * fact a session stopped at step 1 and one that ran all six steps look the
 * same. The console's reach chart read `step_id ?? the last step` and so
 * counted every ended session — a safety stop at step 1 included — as having
 * reached step 6, while `reachedFinalStepPct` beside it, which comes from the
 * journal, said none had. A chart about where sessions stop cannot be built
 * from a column that is cleared when they stop.
 *
 * Plain text and not encrypted, deliberately: it is a step name, it is the
 * console's to read, and the alternative was what the console was doing —
 * decrypting every session in the window on every load to work it out. See
 * `AdminOverviewService`.
 *
 * ## The backfill is best-effort, and says which rows it cannot know
 *
 * A row still in progress knows its step, and a completed one reached the
 * last. A row that ended early does not: the step it was on was overwritten
 * with null when it ended, which is the whole reason this column exists. Those
 * rows get `notice` — the only step they certainly reached — so they
 * under-report rather than over-report, which is the direction that shows a
 * drop-off instead of hiding one. Nothing has run against real traffic, so in
 * practice this is demo data; every session started after this migration
 * records the value exactly.
 */
return new class extends Migration
{
    private const LAST = 'forgive';

    public function up(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table): void {
            // Defaulted rather than nullable: a session always reached at
            // least its first step, so there is no such thing as "no furthest
            // step", and a nullable column would invite every reader to decide
            // for itself what a null meant.
            $table->string('furthest_step_id', 20)->default('notice')->after('step_id');
        });

        DB::table('guided_sessions')
            ->whereNull('end_reason')
            ->whereNotNull('step_id')
            ->update(['furthest_step_id' => DB::raw('step_id')]);

        DB::table('guided_sessions')
            ->where('end_reason', 'completed')
            ->update(['furthest_step_id' => self::LAST]);
    }

    public function down(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table): void {
            $table->dropColumn('furthest_step_id');
        });
    }
};
