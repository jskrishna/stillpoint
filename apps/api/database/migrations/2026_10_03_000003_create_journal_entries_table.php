<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A journal entry exists only for a session that was journalled.
     *
     * A session that ended for safety never gets one — the user was handed to
     * a helpline, and turning that into a diary entry is the wrong thing to put
     * in front of them later. The absence of a row is how that rule is kept.
     */
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('guided_session_id')->nullable()
                ->constrained('guided_sessions')->nullOnDelete();

            // Encrypted: the user's own words about what hurt them.
            $table->text('title');
            $table->text('what_happened')->nullable();
            $table->text('belief')->nullable();
            $table->text('forgiveness')->nullable();
            $table->text('memory')->nullable();
            $table->text('note')->nullable();

            $table->json('feelings');
            $table->string('kind', 8)->default('full');
            $table->unsignedSmallInteger('duration_minutes');
            $table->boolean('reached_final_step')->default(false);
            $table->string('calmer_rating', 10)->nullable();
            // Private until the user shares it. Never default this to true.
            $table->boolean('shared_with_coach')->default(false);
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['user_id', 'occurred_at']);
            $table->index(['user_id', 'shared_with_coach']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};
