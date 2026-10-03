<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Role;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A record that somebody's role changed, and who changed it.
 *
 * It keeps the email addresses as they were at the time, not only the foreign
 * keys: an account can be renamed or deleted, and a trail that stops reading
 * when it does is not much of a trail.
 */
final class RoleChange extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = [
        'user_id', 'changed_by', 'from_role', 'to_role', 'user_email', 'changed_by_email',
    ];

    protected function casts(): array
    {
        return [
            'from_role' => Role::class,
            'to_role' => Role::class,
        ];
    }

    public static function record(User $user, Role $from, Role $to, ?User $by): self
    {
        return self::create([
            'user_id' => $user->id,
            'changed_by' => $by?->id,
            'from_role' => $from,
            'to_role' => $to,
            'user_email' => $user->email,
            'changed_by_email' => $by?->email,
        ]);
    }
}
