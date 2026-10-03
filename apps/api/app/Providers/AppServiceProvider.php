<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;

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
    }
}
