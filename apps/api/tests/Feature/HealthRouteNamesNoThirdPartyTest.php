<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * `/up` answers JSON to everyone, and links nothing.
 *
 * Laravel's `health: '/up'` answers JSON to `Accept: application/json` and its
 * own branded HTML page to anything else. That page links `fonts.bunny.net`
 * and `cdn.jsdelivr.net` — measured in a real browser, two requests to two
 * third parties, from an API with no web routes on purpose, in a product that
 * stopped linking Google's font CDN because every visitor's IP and user-agent
 * reached somebody else. The container's healthcheck is `wget` with no
 * `Accept`, so that page is the one it had been asking for all along.
 *
 * `e2e/privacy.mjs` is what would normally catch this and never looked at this
 * origin, so the guard is here: a string search of the body, which is stricter
 * than a browser check and does not need one.
 */
final class HealthRouteNamesNoThirdPartyTest extends TestCase
{
    public function test_it_answers_json_without_an_accept_header(): void
    {
        $response = $this->get('/up');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/json');
        $this->assertSame(['status' => 'up'], $response->json());
    }

    public function test_it_names_no_other_host_and_no_framework(): void
    {
        $body = $this->get('/up')->getContent();

        $this->assertIsString($body);
        // Any absolute URL at all: the specific two were bunny.net and
        // jsdelivr, and the rule is that this response names no host rather
        // than that it avoids those two.
        $this->assertDoesNotMatchRegularExpression('#https?://#i', $body);
        $this->assertStringNotContainsStringIgnoringCase('laravel', $body);
        $this->assertStringNotContainsString('<', $body);
    }

    /**
     * A failing listener answers 500 and says nothing about why.
     *
     * Laravel's page prints the exception's message. A listener here would be
     * checking a database or a cache, so that message can name a host or a
     * credential — on a route no token guards.
     */
    public function test_a_broken_check_is_a_500_that_explains_nothing(): void
    {
        Event::listen(DiagnosingHealth::class, function (): void {
            throw new \RuntimeException('mysql://root:hunter2@db.internal:3306 is unreachable');
        });

        $response = $this->get('/up');

        $response->assertStatus(500);
        $this->assertSame(['status' => 'down'], $response->json());
        $body = $response->getContent();
        $this->assertIsString($body);
        $this->assertStringNotContainsString('hunter2', $body);
        $this->assertStringNotContainsString('db.internal', $body);
    }
}
