<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The role-change trail stops being a relation and becomes a record.
     *
     * `user_id` cascaded on delete, which meant deleting an account also
     * deleted the record that somebody had granted it a role. The trail exists
     * precisely so a grant has a name and a date on it; one that disappears
     * with the account is not a trail.
     *
     * So both ids become plain columns. An id pointing at a row that no longer
     * exists is exactly what a historical record holds — the row says what
     * happened, not what currently is. The stored email addresses are cleared
     * when an account is erased (see `AccountDeletionService`), so what
     * survives is "an account that no longer exists was made an admin, by this
     * person, on this date" and not the person's address.
     */
    public function up(): void
    {
        Schema::table('role_changes', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropForeign(['changed_by']);
        });
    }

    public function down(): void
    {
        Schema::table('role_changes', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();
        });
    }
};
