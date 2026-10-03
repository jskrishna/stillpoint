<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Cache\RateLimiter;

/**
 * How many more guided turns a caller may take.
 *
 * A rate limit, expressed as something the turn can be *asked about* rather
 * than as middleware in front of it. The difference matters: middleware refuses
 * a request before anything has looked at what it said, and the one request
 * that must never be refused is someone saying they are not safe.
 *
 * So the screen runs first and this is consulted after it. `hit()` is called
 * only when the guide was actually consulted, so a turn that stopped for safety
 * — or one that was refused — does not spend the budget.
 */
final readonly class GuideBudget
{
    public function __construct(
        private RateLimiter $limiter,
        private string $key,
        private int $perMinute,
    ) {}

    public function remaining(): int
    {
        return $this->limiter->remaining($this->key, $this->perMinute);
    }

    /** Seconds until the budget refills. */
    public function availableIn(): int
    {
        return $this->limiter->availableIn($this->key);
    }

    /** Records that a guided turn was taken. */
    public function hit(): void
    {
        $this->limiter->hit($this->key);
    }
}
