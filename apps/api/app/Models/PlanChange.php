<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Plan;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A record that somebody's plan changed, and who changed it.
 *
 * The same shape as `RoleChange` and deliberately a separate table rather than
 * one trail with a "field" column: a role change grants the ability to read
 * what somebody said at the moment they said they were not safe, and a plan
 * change grants an allowance. Those are different decisions, read by different
 * people for different reasons, and the columns that describe them are not the
 * same columns.
 *
 * It keeps the email addresses as they were at the time, not only the ids: an
 * account can be renamed or deleted, and a trail that stops reading when it
 * does is not much of a trail.
 */
final class PlanChange extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'user_id', 'changed_by', 'from_plan', 'to_plan', 'user_email', 'changed_by_email',
    ];

    protected function casts(): array
    {
        return [
            'from_plan' => Plan::class,
            'to_plan' => Plan::class,
        ];
    }

    /**
     * `$by` is null for a change nobody made by hand — which is what billing
     * will be, when there is any.
     */
    public static function record(User $user, Plan $from, Plan $to, ?User $by): self
    {
        return self::create([
            'user_id' => $user->id,
            'changed_by' => $by?->id,
            'from_plan' => $from,
            'to_plan' => $to,
            'user_email' => $user->email,
            'changed_by_email' => $by?->email,
        ]);
    }
}
