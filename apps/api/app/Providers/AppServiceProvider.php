<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // No "data" envelope: a resource response is the object itself.
        //
        // This is stated rather than inherited because the default was already
        // being defeated by accident. Laravel skips its wrapper when the
        // payload already has a `data` key, and SessionResource has one (the
        // session's captured answers). So sessions came back unwrapped while
        // the journal came back wrapped, and renaming that one key would have
        // silently changed the shape of every session response. One explicit
        // rule for every endpoint instead.
        JsonResource::withoutWrapping();

        /*
         * Twelve characters, and nothing else.
         *
         * Laravel's default is eight, which is short for the key to an account
         * holding this much of somebody's private life. Length is also the only
         * requirement here: composition rules ("one number, one symbol") push
         * people towards short passwords with a digit stuck on the end, which
         * is what NIST stopped recommending years ago.
         *
         * `uncompromised()` is deliberately absent. It would check each new
         * password against Have I Been Pwned, which is a good service and a
         * k-anonymous API — and it would also put a third-party request in the
         * middle of registration, in a product that will not even link a font
         * from someone else. It fails open when the request fails, too, so what
         * it buys is not what it looks like it buys. Worth revisiting
         * deliberately; not worth acquiring by default.
         */
        Password::defaults(fn () => Password::min(12));

        $this->rateLimiters();
    }

    /**
     * The limit on the routes worth guessing at — sign-in, registration,
     * password recovery, and opening an invitation by its token.
     *
     * Keyed by **what is being guessed** first, and only then by address.
     * `throttle:10,1` was per IP alone, and this product is India-first: a
     * mobile carrier puts tens of thousands of subscribers behind one public
     * address, so ten sign-ins a minute is a budget a whole network shares.
     * The people it locks out are strangers to each other, and one of them is
     * someone who cannot reach their journal. Keying by the address being
     * signed into is the limit that actually describes the attack — guessing a
     * password is guessing *an account's* password.
     *
     * The per-IP ceiling stays as a second line, for one machine spraying one
     * password across many accounts, and is set where only a script reaches
     * it. It is the blunt one of the two, and NAT is why: raise it and the
     * spray gets cheaper, lower it and a carrier's subscribers lock each other
     * out.
     *
     * ## Three buckets, because two of them were one
     *
     * The tight limit used to be keyed on the account **alone**, and that is a
     * way to lock somebody out of their own journal with six requests a
     * minute. The address is not a secret — a coach types their client's into
     * an invitation — so anybody who has it can hold a person out of the
     * product indefinitely by renewing the burst, and the person it happens to
     * is somebody who went looking for help with being upset and cannot get to
     * what they wrote. That is the same innocent-lockout failure the per-IP
     * limit was replaced for, arriving from the other direction.
     *
     * What makes the fix safe rather than a trade is `Password::min(12)`
     * above. Online guessing is not the threat a tight per-account limit
     * defends against: thirty attempts a minute is 43,200 a day, which against
     * twelve characters is nothing. The real threat is credential stuffing — a
     * password already known from somebody else's breach — and that needs one
     * attempt, which no rate limit stops. So the tight bucket was buying very
     * little and costing a trivial denial of service against one person.
     *
     * So: tight by account **and** address, which is the shape of a password
     * guess and cannot lock anybody else out; looser by account across every
     * address, so a distributed attempt on one account is still capped; and
     * the per-IP ceiling unchanged. `GuessableRoutesAreLimitedTest` asserts
     * each of the three, and that one address exhausting its budget leaves
     * another able to sign in — which is the half that was broken.
     */
    private function rateLimiters(): void
    {
        RateLimiter::for('guessable', function (Request $request): array {
            $email = $request->input('email');
            // An invitation is looked up by its token, so the token is what is
            // being guessed. Falling back to the address keeps a request with
            // neither from sharing one bucket with every other such request.
            $target = is_string($email) && $email !== ''
                ? 'email:'.hash('sha256', mb_strtolower(trim($email)))
                : 'token:'.hash('sha256', (string) $request->route('token')).'|'.$request->ip();

            return [
                // One machine against one account: the shape of a password
                // guess. Keyed by both, so exhausting it locks out the machine
                // doing the guessing and nobody else.
                Limit::perMinute(6)->by($target.'|ip:'.$request->ip()),
                // The same account from many addresses. Looser on purpose —
                // see the note above on why twelve characters is what makes
                // that safe — and still a cap on a distributed attempt.
                Limit::perMinute(30)->by($target),
                // One machine against many accounts.
                Limit::perMinute(60)->by('ip:'.$request->ip()),
            ];
        });
    }
}
