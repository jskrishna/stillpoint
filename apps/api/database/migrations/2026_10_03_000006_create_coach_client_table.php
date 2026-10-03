<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coach_client', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coach_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('client_id')->constrained('users')->cascadeOnDelete();

            $table->string('status', 10)->default('invited');
            $table->timestamp('since')->nullable();
            $table->timestamp('next_call_at')->nullable();
            // The coach's own notes about a client. Never shown to the client.
            $table->text('coach_notes')->nullable();
            $table->timestamps();

            $table->unique(['coach_id', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coach_client');
    }
};
