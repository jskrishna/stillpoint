<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('safety_flags', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('guided_session_id')->nullable()
                ->constrained('guided_sessions')->nullOnDelete();

            $table->string('level', 10);
            $table->string('category', 20);
            // The user's own words that triggered it. Encrypted, and the most
            // sensitive column in the schema.
            $table->text('excerpt');
            $table->string('outcome');

            $table->string('status', 10)->default('open');
            $table->timestamp('raised_at');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // The queue reads open flags most severe first.
            $table->index(['status', 'level', 'raised_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('safety_flags');
    }
};
