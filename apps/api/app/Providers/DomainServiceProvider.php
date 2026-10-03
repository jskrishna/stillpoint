<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domain\Conversation;
use App\Domain\Guide;
use App\Domain\PhraseRiskScreen;
use App\Domain\RiskScreen;
use App\Domain\ScriptedGuide;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the domain's two seams.
 *
 * RiskScreen is where a real classifier goes. It is bound here so screening
 * happens on the server: the browser copy can be bypassed, so a client-side
 * screen is a convenience, never the enforcement.
 *
 * Guide is where a language model goes. ScriptedGuide follows the protocol's
 * own prompts and understands nothing, which is enough to run the loop until
 * the model exists.
 */
final class DomainServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(RiskScreen::class, PhraseRiskScreen::class);
        $this->app->bind(Guide::class, ScriptedGuide::class);

        $this->app->bind(Conversation::class, fn ($app) => new Conversation(
            $app->make(Guide::class),
            $app->make(RiskScreen::class),
        ));
    }
}
