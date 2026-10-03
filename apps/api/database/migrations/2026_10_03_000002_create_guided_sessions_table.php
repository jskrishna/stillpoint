<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Named guided_sessions, not sessions: Laravel's own session driver owns
     * that table name.
     */
    public function up(): void
    {
        Schema::create('guided_sessions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('kind', 8)->default('full');
            $table->string('step_id', 20)->nullable();
            $table->unsignedSmallInteger('guide_turns_used')->default(0);
            $table->string('end_reason', 20)->nullable();
            $table->string('safety_level', 10)->default('none');
            // The version the session started on, so a publish mid-session
            // never changes the questions under someone part-way through.
            $table->string('protocol_version', 16)->nullable();

            // What the session gathered. Encrypted: this is the most personal
            // text the product holds.
            $table->text('data')->nullable();

            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'started_at']);
            $table->index('end_reason');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guided_sessions');
    }
};
