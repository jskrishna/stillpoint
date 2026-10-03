<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A coach's invitation to a client.
     *
     * Separate from `coach_client` because an invite exists before the pairing
     * does, and may exist before the person does: a coach invites an email
     * address, and whoever holds that address decides. The pairing is created
     * when they accept, by them, which is the only way round that makes sense
     * for a product where sharing is the client's choice.
     */
    public function up(): void
    {
        Schema::create('coach_invites', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('coach_id')->constrained('users')->cascadeOnDelete();

            // Who it was sent to, which may not have an account yet. Not a
            // foreign key for that reason.
            $table->string('email');
            // Looked up by, so unique and indexed. Long enough not to be
            // guessed: holding one lets someone accept a coaching relationship.
            $table->string('token', 64)->unique();

            // pending | accepted | revoked. An expired invite is still pending;
            // `expires_at` decides whether it may be used.
            $table->string('status', 10)->default('pending');
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One open invite per coach per address; a second would just be the
            // same invite with a different token.
            $table->index(['coach_id', 'status']);
            $table->index(['email', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coach_invites');
    }
};
