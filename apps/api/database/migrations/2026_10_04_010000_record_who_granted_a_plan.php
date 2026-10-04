<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who changed whose plan, and when.
     *
     * The pricing page names three plans and the server has always enforced
     * what each one allows, but nothing in the product could move anybody
     * between them: registration does not accept a plan, the profile update
     * whitelists three unrelated fields, and the console changed `role`. So
     * every account was `free` for ever and the two paid plans were states
     * nobody could reach.
     *
     * This is not billing, and it is not pretending to be. There is no
     * provider, no checkout and no money; what this records is a plan an
     * admin **granted** — a pilot account, a coach being set up, a refund
     * honoured by hand. When billing lands it writes here too, with
     * `changed_by` null for a change nobody made by hand.
     *
     * Trailed for the same reason role changes are, one step down: a paid
     * allowance given to somebody is a decision, and a decision with nobody's
     * name on it is one nobody can ask about. Append-only in practice — there
     * is no route that edits or deletes a row here.
     *
     * No foreign keys, deliberately, which `role_changes` had to learn by
     * migration: `user_id` constrained with `cascadeOnDelete` would mean
     * deleting an account also deletes the record that somebody granted it a
     * plan, and a trail that disappears with the account is not a trail. An id
     * pointing at a row that no longer exists is exactly what a historical
     * record holds. The stored addresses are cleared on erasure
     * (`AccountDeletionService`), so what survives is "an account that no
     * longer exists was given Plus, by this person, on this date".
     */
    public function up(): void
    {
        Schema::create('plan_changes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('changed_by')->nullable();

            $table->string('from_plan', 10);
            $table->string('to_plan', 10);
            // Who they were at the time, kept because an account can be
            // renamed or deleted and the trail should still read.
            $table->string('user_email');
            $table->string('changed_by_email')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            // The trail pages, and a cursor is built from the ordering
            // columns — `created_at` is not unique, so the ordering ends in
            // `id` and this index matches it.
            $table->index(['created_at', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_changes');
    }
};
