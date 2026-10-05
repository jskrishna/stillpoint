<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\CalmerRating;
use App\Domain\ClientStatus;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\CoachInvite;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A stranger holding somebody else's resource id is refused, on every route.
 *
 * Each of these checks already existed: `authorizeOwnership()` on sessions and
 * on the journal, `authorizePairing()` on the coach portal, a `coach_id`
 * comparison on an invitation, the addressee comparison on accepting one. What
 * did not exist was coverage of all of them — and the one that was missing is
 * the reason this is a sweep rather than a case.
 *
 * `SessionApiTest::test_a_user_cannot_touch_someone_elses_session` named three
 * of that controller's four id-taking routes: `show`, `turn` and `stop`, and
 * not `rating`. The check is on `rate()` and always was, so nothing was wrong;
 * what was missing was the thing that keeps it there. And a rating is not the
 * harmless one of the four — it is the single operation the reducer still
 * accepts on an **ended** session, and it writes through to the journal entry,
 * so it is the one route by which a stranger could have altered what somebody
 * else reads back about their own session.
 *
 * So the route table is asked rather than listed, which is
 * `PageSizesAreBoundedTest` reading the source and
 * `ErasureLeavesNoAddressAnywhereTest` asking the schema. A route added
 * tomorrow with `{entry}` in it is covered the day it is written, and a route
 * with a parameter neither map names fails this test until somebody says which
 * of the two it is. That is `RotateEncryptionKey::COLUMNS`'s direction: refuse
 * what is not covered, so the next one has to be argued for.
 *
 * Only authenticated routes are swept, which is by construction rather than by
 * exclusion: "what does a stranger get" presupposes somebody signed in.
 * `GET /invites/{token}` is the one id-taking route with no `auth:sanctum`, and
 * it is public on purpose — whoever holds an invitation link has not signed in
 * yet and needs to know who is asking before deciding whether to.
 */
final class EveryOwnedRouteRefusesAStrangerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Route parameters naming a resource somebody owns, and what a stranger
     * holding its id is answered.
     *
     * 404 everywhere but one, and the exception is the interesting entry.
     * Accepting an invitation addressed to somebody else answers **403** with
     * the address to sign in as, because whoever holds that link was *given*
     * it: they are not a stranger who guessed an id, they are the wrong
     * account for a legitimate invitation, and telling them nothing would
     * strand them. Every other 404 here is this product's standard — not 403,
     * so a route does not confirm its own resource exists to somebody who may
     * not have it.
     *
     * @var array<string, int>
     */
    private const OWNED = [
        'session' => 404,
        'entry' => 404,
        'coach' => 404,
        'client' => 404,
        'invite' => 404,
        'token' => 403,
    ];

    /**
     * Parameters that are deliberately **not** ownership checks.
     *
     * Each is a staff route or not a resource, and the reason is the entry: a
     * parameter landing here by accident is how an unguarded route would pass
     * this test.
     *
     * @var array<string, string>
     */
    private const NOT_OWNED = [
        // Any admin may change any account's role or plan — that is what the
        // console is. The guards there are different in kind and live in
        // `AdminUserApiTest`: nobody changes their own role, and the last
        // admin cannot be demoted.
        'user' => 'an admin route: every admin administers every account',
        // The queue is the whole queue. An admin reads it or is not an admin,
        // which `EnsureStaff` decides one layer out.
        'flag' => 'an admin route: the safety queue is not partitioned by owner',
        // Not a resource. It names a step of the one shared draft version.
        'stepId' => 'not a resource: a step id on the single draft',
    ];

    public function test_every_authenticated_route_parameter_is_accounted_for(): void
    {
        $unaccounted = [];
        $found = 0;

        foreach ($this->authenticatedRoutesWithParameters() as $route) {
            foreach ($route->parameterNames() as $name) {
                $found++;
                if (! isset(self::OWNED[$name]) && ! isset(self::NOT_OWNED[$name])) {
                    $unaccounted[] = $route->methods()[0].' '.$route->uri().' — {'.$name.'}';
                }
            }
        }

        $this->assertSame([], $unaccounted, implode("\n", array_merge(
            ['A route takes a parameter neither OWNED nor NOT_OWNED names.'],
            ['Say which it is: a resource a stranger must be refused, or a staff'],
            ['route where every holder of the role may act on every row.'],
            $unaccounted,
        )));

        // A sweep that matches nothing passes. `getRoutes()` returning an empty
        // set, or `parameterNames()` changing shape, would otherwise read as
        // every route being accounted for.
        $this->assertGreaterThanOrEqual(14, $found, 'The route sweep found almost nothing — check it still matches.');
    }

    public function test_a_stranger_is_refused_every_owned_resource(): void
    {
        $swept = [];

        foreach ($this->authenticatedRoutesWithParameters() as $route) {
            $owned = array_values(array_filter(
                $route->parameterNames(),
                fn (string $n) => isset(self::OWNED[$n]),
            ));

            if ($owned === []) {
                continue;
            }

            $method = $route->methods()[0];
            $uri = $route->uri();

            // Fresh fixtures per route, because a stranger refused one
            // resource tells you nothing about the next. Fresh rows rather
            // than a fresh application: `refreshApplication()` would drop the
            // in-memory database `RefreshDatabase` migrated.
            $this->owner = null;

            $values = [];
            $stranger = null;
            foreach ($route->parameterNames() as $name) {
                if (isset(self::OWNED[$name])) {
                    [$values[$name], $stranger] = $this->somebodyElses($name);
                } else {
                    $values[$name] = 'notice';
                }
            }

            $this->assertNotNull($stranger);
            Sanctum::actingAs($stranger);

            $path = '/'.$uri;
            foreach ($values as $name => $value) {
                // Cast, because `users.id` is an auto-increment integer where
                // every other id here is a ULID string.
                $path = str_replace('{'.$name.'}', (string) $value, $path);
            }

            $expected = min(array_map(fn (string $n) => self::OWNED[$n], $owned));

            $response = $this->json($method, $path, self::BODY);

            $this->assertSame(
                $expected,
                $response->status(),
                "$method $uri answered {$response->status()} to a stranger holding somebody else's id, not $expected.",
            );

            $swept[] = "$method $uri";
        }

        // Named rather than counted, so a fixture that stopped building its
        // resource — and so a route quietly skipped — shows up as an absence.
        $this->assertSame([
            'POST api/sessions/{session}/turns',
            'POST api/sessions/{session}/help',
            'GET api/sessions/{session}',
            'POST api/sessions/{session}/stop',
            'POST api/sessions/{session}/rating',
            'GET api/journal/{entry}',
            'PATCH api/journal/{entry}',
            'DELETE api/journal/{entry}',
            'DELETE api/me/coaches/{coach}',
            'POST api/invites/{token}/accept',
            'GET api/coach/clients/{client}',
            'PATCH api/coach/clients/{client}',
            'DELETE api/coach/invites/{invite}',
        ], $swept);
    }

    /**
     * Every field any of these routes validates, in one body.
     *
     * A per-route body would be the hand-written list this test exists to
     * avoid, and the extra fields are ignored: `validate()` reads what it
     * names. What it buys is that a 422 can never stand in for the refusal —
     * on `rate()` and `turn()` the ownership check runs first anyway, and this
     * stops the test resting on that ordering.
     */
    private const BODY = [
        'utterance' => 'My manager called me out in front of the team',
        'step' => 'notice',
        'rating' => 'yes',
        'note' => 'a note on an entry that is not mine',
        'sharedWithCoach' => false,
        'coachNotes' => 'notes on a client who is not mine',
    ];

    /**
     * A resource owned by somebody, and an account that is not them.
     *
     * The stranger's role is part of the fixture rather than a constant: a
     * coach route is behind `EnsureCoach`, so an ordinary account there would
     * be refused 404 by the middleware and the test would pass without the
     * ownership check existing at all.
     *
     * @return array{0: string|int, 1: User}
     */
    private function somebodyElses(string $parameter): array
    {
        return match ($parameter) {
            'session' => [$this->sessionOf($this->owner())->id, $this->stranger()],

            'entry' => [$this->entryOf($this->owner())->id, $this->stranger()],

            // The id is a coach's. Who owns the relationship is the client
            // paired with them, so the stranger is a different client.
            'coach' => (function (): array {
                $coach = User::factory()->coach()->create();
                $this->pair($coach, $this->owner());

                return [$coach->id, $this->stranger()];
            })(),

            // Behind `EnsureCoach`: the stranger has to be a coach, or the
            // middleware refuses before `authorizePairing()` is reached.
            'client' => (function (): array {
                $client = $this->owner();
                $this->pair(User::factory()->coach()->create(), $client);

                return [$client->id, User::factory()->coach()->create()];
            })(),

            'invite' => (function (): array {
                $invite = CoachInvite::open(User::factory()->coach()->create(), 'invited@stillpoint.test');

                return [$invite->id, User::factory()->coach()->create()];
            })(),

            // Usable on purpose — pending and unexpired — so the refusal is
            // the addressee comparison and not the 409 an expired link gets.
            'token' => (function (): array {
                $invite = CoachInvite::open(User::factory()->coach()->create(), 'invited@stillpoint.test');

                return [$invite->token, User::factory()->create(['email' => 'somebody.else@stillpoint.test'])];
            })(),

            default => throw new \LogicException("No fixture for {$parameter}."),
        };
    }

    /** @return iterable<RouteDefinition> */
    private function authenticatedRoutesWithParameters(): iterable
    {
        foreach (Route::getRoutes() as $route) {
            if ($route->parameterNames() === []) {
                continue;
            }
            if (! in_array('auth:sanctum', $route->gatherMiddleware(), true)) {
                continue;
            }
            yield $route;
        }
    }

    /** Whoever the resource belongs to. */
    private function owner(): User
    {
        return $this->owner ??= $this->consented();
    }

    /**
     * Somebody who is not them.
     *
     * Its own method because the first version of this test returned
     * `owner()` here, so three routes were swept by the account that owns the
     * resource — and `POST sessions/{session}/turns` answered **200**, which
     * is what the owner correctly gets. The check failed loudly against the
     * fix rather than passing against a bug, which is the better of the two
     * ways for a check to be wrong, and it is why the assertion names the
     * status it got.
     */
    private function stranger(): User
    {
        return $this->consented();
    }

    private function consented(): User
    {
        return User::factory()->create(['accepted_consent' => ['understands', 'adult']]);
    }

    private ?User $owner = null;

    private function sessionOf(User $user): GuidedSession
    {
        return GuidedSession::create([
            'user_id' => $user->id,
            'kind' => SessionKind::Full,
            'step_id' => StepId::Notice,
            'started_at' => now()->subMinutes(5),
        ]);
    }

    private function entryOf(User $user): JournalEntry
    {
        return JournalEntry::create([
            'user_id' => $user->id,
            'guided_session_id' => null,
            'kind' => SessionKind::Full,
            'duration_minutes' => 12,
            'reached_final_step' => true,
            'calmer_rating' => CalmerRating::Yes,
            'occurred_at' => now()->subDay(),
            'feelings' => ['angry'],
            'title' => 'Not yours to read',
            'shared_with_coach' => false,
        ]);
    }

    private function pair(User $coach, User $client): void
    {
        $coach->clients()->attach($client->id, [
            'status' => ClientStatus::Active->value,
            'since' => now()->subMonth(),
        ]);
    }
}
