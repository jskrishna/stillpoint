<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\Paged;
use App\Models\RoleChange;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accounts, and what they are allowed to be.
 *
 * This is the only way to make someone a coach or an admin. Until now it took
 * a shell on the server, which is not a way to run a product — but it is also
 * the single most consequential thing in the console, because granting `admin`
 * grants the safety queue and that holds what someone said at the moment they
 * said they were not safe.
 *
 * So three guards, and a trail:
 *
 *  - **nobody changes their own role.** Not a safety net against typos, though
 *    it is that too: an escalation one person can perform on themselves alone
 *    is one nobody else had to agree to.
 *  - **the last admin cannot be demoted**, because the alternative is a product
 *    nobody can administer and a queue nobody can read.
 *  - **every change is recorded** with who did it. A grant like this should not
 *    be a thing that happened with nobody's name on it.
 *
 * What it shows is account administration — a name, an address, a role. Never
 * session content: that a person has an account here is not a secret from the
 * people who run it, and what they said in a session is.
 */
final class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:255'],
            'role' => ['sometimes', 'nullable', 'string', 'in:user,coach,admin'],
        ]);

        $query = User::query();

        $search = trim((string) ($validated['q'] ?? ''));
        if ($search !== '') {
            // Searched rather than listed: an admin looking for one person
            // should not have to page through everybody to find them.
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
            $query->where(function ($q) use ($like): void {
                $q->where('name', 'like', $like)->orWhere('email', 'like', $like);
            });
        }

        $role = $validated['role'] ?? null;
        if ($role !== null && $role !== '') {
            $query->where('role', $role);
        }

        $page = (clone $query)
            ->orderBy('name')
            ->orderBy('id')
            ->cursorPaginate(Paged::limit($request, 25));

        return response()->json([
            'items' => array_map(self::profile(...), $page->items()),
            'nextCursor' => $page->nextCursor()?->encode(),
            'total' => (clone $query)->count(),
            // Shown so the screen can explain why a demotion is refused before
            // anyone tries it.
            'adminCount' => User::query()->where('role', Role::Admin->value)->count(),
        ]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['required', 'string', 'in:user,coach,admin'],
        ]);

        $actor = $request->user();
        $to = Role::from($validated['role']);
        $from = $user->role ?? Role::User;

        if ($user->id === $actor->id) {
            return response()->json([
                'message' => 'You cannot change your own role. Ask another admin.',
            ], Response::HTTP_FORBIDDEN);
        }

        if ($from === $to) {
            // Not an error, and not a trail entry either: nothing changed.
            return response()->json(self::profile($user));
        }

        if ($from === Role::Admin && self::isLastAdmin($user)) {
            return response()->json([
                'message' => 'This is the last admin. Make someone else an admin first.',
            ], Response::HTTP_CONFLICT);
        }

        DB::transaction(function () use ($user, $from, $to, $actor): void {
            $user->role = $to;
            $user->save();
            RoleChange::record($user, $from, $to, $actor);
        });

        return response()->json(self::profile($user->refresh()));
    }

    /** The trail, newest first. Read-only: there is no route that edits it. */
    public function roleChanges(Request $request): JsonResponse
    {
        $page = RoleChange::query()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->cursorPaginate(Paged::limit($request, 50));

        return response()->json([
            'items' => array_map(static fn (RoleChange $c) => [
                'id' => $c->id,
                'userEmail' => $c->user_email,
                'changedByEmail' => $c->changed_by_email,
                'fromRole' => $c->from_role->value,
                'toRole' => $c->to_role->value,
                'at' => $c->created_at?->toIso8601String(),
            ], $page->items()),
            'nextCursor' => $page->nextCursor()?->encode(),
            'total' => RoleChange::query()->count(),
        ]);
    }

    private static function isLastAdmin(User $user): bool
    {
        return User::query()
            ->where('role', Role::Admin->value)
            ->whereKeyNot($user->id)
            ->doesntExist();
    }

    /** @return array<string, mixed> */
    private static function profile(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => ($user->role ?? Role::User)->value,
            'plan' => $user->plan,
            'joinedAt' => $user->created_at?->toIso8601String(),
        ];
    }
}
