<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\CoachView;
use App\Domain\LiteralExtraction;
use App\Domain\PhraseRiskScreen;
use App\Domain\StepId;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The PHP half of the cross-language parity check.
 *
 * This Domain is the authority on the protocol and is a port of
 * `packages/protocol`. Two implementations of a crisis-stop rule is the worst
 * outcome available: they drift, and the one that drifts decides whether
 * someone gets a helpline.
 *
 * So both sides assert against one checked-in file, `parity/cases.json`. This
 * test is the PHP half; `packages/protocol/src/parity.test.ts` is the other. A
 * rule changed in one language and not the other fails one of them.
 *
 * When a change is deliberate, change both languages and regenerate with
 * `pnpm run parity:generate`. Regenerating to turn a red test green records the
 * divergence instead of fixing it.
 */
final class ParityTest extends TestCase
{
    /** @return array<string, array{array<string, mixed>}> */
    public static function riskCases(): array
    {
        $out = [];
        foreach (self::cases()['risk'] as $i => $case) {
            $out["risk {$i}: {$case['utterance']}"] = [$case];
        }

        return $out;
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function extractionCases(): array
    {
        $out = [];
        foreach (self::cases()['extraction'] as $i => $case) {
            $out["extraction {$i}: {$case['stepId']} / {$case['utterance']}"] = [$case];
        }

        return $out;
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function coachCases(): array
    {
        $out = [];
        foreach (self::cases()['coach'] as $i => $case) {
            $out["coach {$i}: {$case['name']}"] = [$case];
        }

        return $out;
    }

    public function test_there_are_cases_to_check(): void
    {
        // A missing or emptied fixture must fail loudly rather than pass by
        // having nothing to disagree with.
        $this->assertGreaterThan(10, count(self::cases()['risk']));
        $this->assertGreaterThan(10, count(self::cases()['extraction']));
    }

    /** @param array<string, mixed> $case */
    #[DataProvider('riskCases')]
    public function test_the_risk_screen_agrees(array $case): void
    {
        $result = (new PhraseRiskScreen)->assess($case['utterance']);

        $this->assertSame([
            'level' => $case['level'],
            'category' => $case['category'],
            'matched' => $case['matched'],
        ], [
            'level' => $result->level->value,
            'category' => $result->category?->value,
            'matched' => $result->matched,
        ], "Risk parity broke on: {$case['utterance']}");
    }

    /** @param array<string, mixed> $case */
    #[DataProvider('extractionCases')]
    public function test_extraction_agrees(array $case): void
    {
        $stepId = StepId::from($case['stepId']);

        $this->assertSame(
            $case['substantive'],
            LiteralExtraction::isSubstantiveAnswer($stepId, $case['utterance']),
            "Substantive-answer parity broke on: {$case['stepId']} / {$case['utterance']}"
        );

        $capture = LiteralExtraction::for($stepId, $case['utterance']);
        $expected = $case['capture'] ?? [];

        $this->assertEquals(
            $expected,
            $capture,
            "Extraction parity broke on: {$case['stepId']} / {$case['utterance']}"
        );
    }

    /** @param array<string, mixed> $case */
    #[DataProvider('coachCases')]
    public function test_a_coachs_view_agrees(array $case): void
    {
        $entries = [];
        foreach ($case['entries'] as $entry) {
            $entries[] = [
                'sharedWithCoach' => $entry['shared'],
                'occurredAt' => new \DateTimeImmutable($entry['occurredAt']),
                'belief' => $entry['belief'],
            ];
        }

        $this->assertEquals([
            'sharedCount' => $case['sharedCount'],
            'lastSharedAtMs' => $case['lastSharedAtMs'],
            'recurringBelief' => $case['recurringBelief'],
        ], CoachView::summarise($entries), "Coach parity broke on: {$case['name']}");
    }

    /** @return array{risk: list<array<string, mixed>>, extraction: list<array<string, mixed>>, coach: list<array<string, mixed>>} */
    private static function cases(): array
    {
        $path = dirname(__DIR__, 4).'/parity/cases.json';
        $raw = file_get_contents($path);

        if ($raw === false) {
            throw new \RuntimeException("Parity fixture missing at {$path}. It is checked in; do not delete it.");
        }

        /** @var array{risk: list<array<string, mixed>>, extraction: list<array<string, mixed>>, coach: list<array<string, mixed>>} $decoded */
        $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);

        return $decoded;
    }
}
