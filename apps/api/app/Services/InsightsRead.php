<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\Insights;

/**
 * What `InsightsService` read, and whether it read all of it.
 *
 * `partial` is deliberately **not** on `App\Domain\Insights`. It is a fact
 * about the read rather than about the journal: the domain summarises whatever
 * entries it is handed and `packages/protocol/src/insights.ts` does the same,
 * so putting a storage decision inside it would give the two ports different
 * shapes for one rule — which is the asymmetry `Insights::from()` taking
 * `$now` was added to remove.
 */
final readonly class InsightsRead
{
    public function __construct(
        public Insights $insights,
        /**
         * True when the window held more entries than the service will read,
         * so the numbers are of the most recent `MAX_ROWS` rather than of
         * everything. See `InsightsService::MAX_ROWS` for why there is a
         * ceiling at all and why no real account reaches it.
         */
        public bool $partial,
    ) {}
}
