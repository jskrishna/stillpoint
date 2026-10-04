<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Canada is the first market, so that is what a new account is assumed to be in.
 *
 * `country` decides which crisis numbers somebody is shown, which is the one
 * thing on the safety screen that has to be right. It defaulted to `IN` from
 * when India was the first market, and Canada had no numbers at all — so a
 * Canadian who said they were not safe saw a pause screen with nothing to
 * call. `App\Domain\Helpline` covers both countries now; this is the other
 * half.
 *
 * **Existing rows are left exactly as they are.** A column default decides
 * what a new account gets, and nothing here rewrites a country somebody is
 * actually in — guessing at that would be the same mistake as substituting a
 * plausible-looking helpline. India's accounts keep India's numbers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('country', 2)->default('CA')->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('country', 2)->default('IN')->change();
        });
    }
};
