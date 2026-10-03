<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
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
    }
}
