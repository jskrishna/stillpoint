<?php

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        /*
         * The health route is ours, not `health: '/up'`.
         *
         * Laravel's answers JSON to `Accept: application/json` and its own
         * **branded HTML page** to anything else — and that page links
         * `fonts.bunny.net` and `cdn.jsdelivr.net`. Measured in a real
         * browser: two requests to two third parties, from an API that has no
         * web routes on purpose, in a product that stopped linking Google's
         * font CDN because "every visitor's IP and user-agent reached a third
         * party". The container's own healthcheck is `wget` with no `Accept`,
         * so the page nobody meant to serve is the one it has been asking for
         * all along.
         *
         * `App\Http\Middleware\SecurityHeaders`' `default-src 'none'` stops
         * both requests now — checked, the browser refuses them — but a page
         * that tries is still the thing `e2e/privacy.mjs` exists to catch, and
         * it never looked at this origin. So the route answers JSON to
         * everyone and there is no page to link anything.
         *
         * It keeps the rest of Laravel's contract: the `DiagnosingHealth`
         * event, 200 or 500, and reachable during maintenance (the `except`
         * below, which `health:` used to arrange).
         */
        then: function (): void {
            Route::get('/up', function (): JsonResponse {
                $failure = null;

                try {
                    Event::dispatch(new DiagnosingHealth);
                } catch (Throwable $e) {
                    report($e);
                    // Never the message: a listener's exception can name a
                    // host, a database or a credential, and this route is
                    // unauthenticated. Laravel's own page prints it.
                    $failure = true;
                }

                return response()->json(
                    ['status' => $failure === null ? 'up' : 'down'],
                    $failure === null ? 200 : 500,
                );
            });
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // There is no login page to send a guest to: this is an API, and the
        // only correct answer to an unauthenticated request is 401.
        //
        // Laravel's default is `route('login')`, and the auth middleware
        // resolves it before the exception handler gets to decide on JSON. So
        // a guest request without an `Accept: application/json` header came
        // back as a 500 ("Route [login] not defined") rather than a 401.
        $middleware->redirectGuestsTo(fn (Request $request) => null);

        // On every response, including the ones the exception handler makes:
        // see the class for what each header is for and why they are set here
        // rather than only at the edge.
        $middleware->append(SecurityHeaders::class);

        // What `health: '/up'` used to do for us, since the route is ours now:
        // a deployment in maintenance mode still has to be able to say it is
        // alive, or the orchestrator kills it while it waits.
        $middleware->preventRequestsDuringMaintenance(except: ['up']);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * A 404 from route-model binding must not say what it could not find.
         *
         * Laravel's wording is "No query results for model
         * [App\Models\JournalEntry] 01m43t9qg569tsgrz0cya5kv5a", and
         * `APP_DEBUG=false` does not change it: a `NotFoundHttpException` is an
         * `HttpExceptionInterface`, so the framework keeps its message in
         * production too. Measured, not assumed.
         *
         * That sentence reaches a person. `describe()` on both surfaces prefers
         * the API's own message over a generic one — deliberately, because the
         * generic ones were being shown in place of real refusals the server
         * had explained. So a user who double-tapped "Delete everything" on
         * their journal was shown a PHP class name and a database id on their
         * settings screen.
         *
         * Answering with no words is the behaviour the rest of the API already
         * has: `EnsureStaff` and `authorizePairing()` both `abort(404)` with no
         * message so they do not confirm their own existence, and `describe()`
         * has the sentence for exactly that — "Stillpoint would not do that.
         * Reload to see where things stand." A 404 is that, and reloading is
         * what actually helps, because the thing acted on is gone.
         *
         * The router's own 404 is the same problem found by writing the test
         * for the first one: a path that matches nothing answers "The route
         * api/admin/users/01m43t.../role could not be found.", which is how a
         * shipped phone app meeting a renamed route would explain itself to
         * the person holding it.
         *
         * Both are stripped and an `abort(404, 'words')` keeps its words, told
         * apart without matching on the framework's sentences: the router
         * throws before a route is resolved, so `$request->route()` is null for
         * its 404 and set for anything raised by a controller or middleware,
         * and model binding wraps a `ModelNotFoundException`. Nothing words a
         * 404 today — 410 is the status that carries an explanation, which is
         * what the invite screen already branches on.
         */
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (! $request->is('api/*') && ! $request->expectsJson()) {
                return null;
            }

            $framework = $e->getPrevious() instanceof ModelNotFoundException
                || $request->route() === null;

            return $framework ? response()->json(['message' => ''], 404) : null;
        });

        /*
         * And the same for a method the route does not take: "The GET method
         * is not supported for route api/admin/users/01m43t…. Supported
         * methods: PATCH." Nothing in a shipped client sends one, so this is
         * consistency rather than a measured user-facing bug — but the
         * argument is identical to the 404 above, and the one place it becomes
         * reachable is a client built against a different version of this API,
         * which is exactly who would be shown it.
         */
        $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) {
            return $request->is('api/*') || $request->expectsJson()
                ? response()->json(['message' => ''], 405)
                : null;
        });
    })->create();
