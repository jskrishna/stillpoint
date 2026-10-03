<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who changed whose role, and when.
     *
     * Granting `admin` grants the safety queue, which holds what someone said
     * at the moment they said they were not safe — the most sensitive column in
     * the schema. A grant like that should not be a thing that happened with
     * nobody's name on it.
     *
     * Append-only in practice: there is no route that edits or deletes a row
     * here, because a trail that can be tidied is not one.
     */
    public function up(): void
    {
        Schema::create('role_changes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            // Whose role changed.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Who changed it. Nullable only so deleting an account does not
            // take the record of what they did with it.
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('from_role', 10);
            $table->string('to_role', 10);
            // Who they were at the time, kept because an account can be renamed
            // or deleted and the trail should still read.
            $table->string('user_email');
            $table->string('changed_by_email')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_changes');
    }
};
