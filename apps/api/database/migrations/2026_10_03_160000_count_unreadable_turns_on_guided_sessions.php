<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many turns in a session the risk screen could not read.
 *
 * The screen has phrases in Latin and Devanagari and in nothing else, so an
 * utterance in Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia,
 * Gurmukhi or Urdu is not screened at all. It says so now
 * (`RiskAssessment::$unreadable`); this is where that gets counted, so the gap
 * is a number somebody can act on rather than something to be inferred.
 *
 * A plain integer, deliberately. It is not the user's text and it is not a
 * language they declared — it is how often this screen admitted it was out of
 * its depth, which is the console's business in exactly the way the step-reach
 * figures are. Nothing here names a script: which language to cover next needs
 * a decision about whether that is ours to store, and a count is enough to
 * know whether the question is worth asking.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table) {
            $table->unsignedInteger('unreadable_turns')->default(0)->after('guide_turns_used');
        });
    }

    public function down(): void
    {
        Schema::table('guided_sessions', function (Blueprint $table) {
            $table->dropColumn('unreadable_turns');
        });
    }
};
