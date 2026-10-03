<?php

declare(strict_types=1);

use App\Domain\SafetyLevel;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The severity rank, as a column.
     *
     * The queue was ordered by `CASE level WHEN 'high' THEN 3 ...` in SQL,
     * because the stored string sorts alphabetically and puts "high" below
     * "low". That worked for a whole result set and broke the moment the queue
     * was paged: a cursor is built from the ordering columns, and a raw
     * expression is not a column the paginator can read — so two pages
     * overlapped, and a reviewer could have seen one flag twice and another
     * never.
     *
     * The rank itself still comes from the domain (`SafetyLevel::rank()`); this
     * is where it is written down so the database can sort by it.
     */
    public function up(): void
    {
        Schema::table('safety_flags', function (Blueprint $table) {
            $table->unsignedTinyInteger('severity')->default(0)->after('level');
            // Replaces the index on (status, level, raised_at): level was never
            // the thing being ordered by.
            $table->index(['status', 'severity', 'raised_at']);
        });

        foreach (SafetyLevel::cases() as $level) {
            DB::table('safety_flags')
                ->where('level', $level->value)
                ->update(['severity' => $level->rank()]);
        }
    }

    public function down(): void
    {
        Schema::table('safety_flags', function (Blueprint $table) {
            $table->dropIndex(['status', 'severity', 'raised_at']);
            $table->dropColumn('severity');
        });
    }
};
