<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('plan', 10)->default('free')->after('email');
            $table->string('country', 2)->default('IN')->after('plan');

            // Preferences chosen during onboarding and changeable in settings.
            $table->string('guide_voice', 16)->default('sage');
            $table->string('talk_mode', 16)->default('hold');
            // Defaults to asking, so sharing stays a decision about a
            // particular session rather than one made once and forgotten.
            $table->string('coach_sharing', 16)->default('ask_each_time');

            // Consent is a record, not a preference: what was agreed, and when.
            $table->json('accepted_consent')->nullable();
            $table->timestamp('consented_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'plan', 'country', 'guide_voice', 'talk_mode',
                'coach_sharing', 'accepted_consent', 'consented_at',
            ]);
        });
    }
};
