<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\CalmerRating;
use App\Domain\CoachSharing;
use App\Domain\CoachView;
use App\Domain\FeelingId;
use App\Domain\Helpline;
use App\Domain\Insights;
use App\Domain\LiteralExtraction;
use App\Domain\PhraseRiskScreen;
use App\Domain\Plan;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Domain\Utterance;
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
    /** @return array<string, array{array<string, mixed>}> */
    public static function helplineCases(): array
    {
        $out = [];
        foreach (self::cases()['helplines']['forCountry'] as $case) {
            $where = $case['country'] === '' ? 'an empty country' : $case['country'];
            $out[$where] = [$case];
        }

        return $out;
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function insightsCases(): array
    {
        $out = [];
        foreach (self::cases()['insights'] as $case) {
            $out[$case['name']] = [$case];
        }

        return $out;
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function sharingCases(): array
    {
        $out = [];
        foreach (self::cases()['sharing'] as $case) {
            $with = $case['hasCoach'] ? 'with a coach' : 'without a coach';
            $out["{$case['setting']} {$with}"] = [$case];
        }

        return $out;
    }

    public static function coachCases(): array
    {
        $out = [];
        foreach (self::cases()['coach'] as $i => $case) {
            $out["coach {$i}: {$case['name']}"] = [$case];
        }

        return $out;
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function planCases(): array
    {
        $out = [];
        foreach (self::cases()['plans'] as $i => $case) {
            $out["plan {$i}: {$case['plan']} / {$case['kind']} after {$case['used']}"] = [$case];
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
            'unreadable' => $case['unreadable'],
        ], [
            'level' => $result->level->value,
            'category' => $result->category?->value,
            'matched' => $result->matched,
            'unreadable' => $result->unreadable,
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
    #[DataProvider('planCases')]
    public function test_a_plan_allowance_agrees(array $case): void
    {
        $plan = Plan::from($case['plan']);
        $decision = $plan->mayStart(SessionKind::from($case['kind']), $case['used']);

        $this->assertSame([
            'allowed' => $case['allowed'],
            'limit' => $case['limit'],
            'left' => $case['left'],
        ], [
            'allowed' => $decision['allowed'],
            'limit' => $decision['allowed'] ? null : ($decision['limit'] ?? null),
            'left' => $plan->fullSessionsLeft($case['used']),
        ], "Plan parity broke on: {$case['plan']} / {$case['kind']} after {$case['used']}");
    }

    /**
     * The crisis numbers themselves.
     *
     * Of everything in this repository that could drift between the two
     * languages, this is the one where drift means somebody in crisis dialling
     * a number that does not answer where they are. Each side had its own
     * tests and nothing compared them — and the session screen now reads the
     * TypeScript list itself when a turn never reaches the server, so a
     * divergence would show one person two different sets of numbers in the
     * same minute depending on whether their request arrived.
     */
    public function test_the_known_countries_agree(): void
    {
        $this->assertSame(self::cases()['helplines']['countries'], Helpline::COUNTRIES);
        $this->assertSame(self::cases()['helplines']['defaultCountry'], Helpline::DEFAULT_COUNTRY);
    }

    /** @param array<string, mixed> $case */
    #[DataProvider('helplineCases')]
    public function test_the_crisis_numbers_agree(array $case): void
    {
        $this->assertSame(
            $case['helplines'],
            array_map(fn (Helpline $h) => [
                'name' => $h->name,
                'number' => $h->number,
                'detail' => $h->detail,
                'country' => $h->country,
                'kind' => $h->kind,
            ], Helpline::forCountry($case['country'])),
            "Helpline parity broke on: {$case['country']}",
        );
    }

    /**
     * The user's own insights.
     *
     * The fixture had no insights section at all, and this is a rule with a
     * lot of surface: a feeling counted once per session however often it was
     * named, feelings ordered by count then by label, "felt calmer" counting
     * an explicit yes and not a hedge, the recurring-belief threshold of two,
     * its tie-break by recency, the wording kept being the most recent, and
     * the normaliser that makes a danda and a full stop the same thing.
     *
     * @param  array<string, mixed>  $case
     */
    #[DataProvider('insightsCases')]
    public function test_the_insights_agree(array $case): void
    {
        $entries = [];
        foreach ($case['entries'] as $entry) {
            $entries[] = [
                'feelings' => array_map(
                    fn (string $f) => FeelingId::from($f),
                    $entry['feelings'],
                ),
                'belief' => $entry['belief'],
                'calmerRating' => $entry['calmerRating'] === null
                    ? null
                    : CalmerRating::from($entry['calmerRating']),
                'reachedFinalStep' => $entry['reachedFinalStep'],
                'occurredAt' => new \DateTimeImmutable($entry['occurredAt']),
            ];
        }

        $now = (new \DateTimeImmutable('@'.(string) intdiv($case['nowMs'], 1000)));
        $result = Insights::from($entries, $now, $case['windowDays']);

        $this->assertSame([
            'sessions' => $case['sessions'],
            'feltCalmer' => $case['feltCalmer'],
            'reachedFinalStep' => $case['reachedFinalStep'],
            'feelings' => $case['feelings'],
            'recurringBelief' => $case['recurringBelief'],
        ], [
            'sessions' => $result->sessions,
            'feltCalmer' => $result->feltCalmer,
            'reachedFinalStep' => $result->reachedFinalStep,
            'feelings' => array_map(fn (array $f) => [
                'id' => $f['id']->value,
                'label' => $f['label'],
                'count' => $f['count'],
            ], $result->feelings),
            'recurringBelief' => $result->recurringBelief,
        ], "Insights parity broke on: {$case['name']}");
    }

    /** @param array<string, mixed> $case */
    #[DataProvider('sharingCases')]
    public function test_the_coach_sharing_setting_agrees(array $case): void
    {
        $setting = CoachSharing::from($case['setting']);

        $this->assertSame([
            'sharesNewEntry' => $case['sharesNewEntry'],
            'mayShareEntry' => $case['mayShareEntry'],
        ], [
            'sharesNewEntry' => $setting->sharesNewEntry($case['hasCoach']),
            'mayShareEntry' => $setting->mayShareEntry(),
        ], "Sharing parity broke on: {$case['setting']}");
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

    /**
     * The bound on what is recorded from one answer.
     *
     * A number in the fixture rather than a case, because a case would be a
     * 20,000-character utterance in a checked-in file nobody could then read.
     * It is there at all because the bound is a rule: the two languages
     * trimming an answer at different lengths would mean the journal and the
     * safety queue disagreeing about what somebody said.
     */
    public function test_the_recorded_utterance_bound_matches_the_shared_limits(): void
    {
        /** @var array{recordedUtterance: int, keptFromALongAnswer: int, keptFromAnEmojiAnswer: int} $limits */
        $limits = self::cases()['limits'];

        $this->assertSame($limits['recordedUtterance'], Utterance::RECORDED_LIMIT);

        // Characters, not bytes. A byte bound would keep a third as much Hindi
        // as English, in a product that is India-first.
        $this->assertSame(
            $limits['keptFromALongAnswer'],
            mb_strlen(Utterance::recordable(str_repeat('मुझे मरना है। ', 4000))),
        );

        // Whole characters, so the bound never lands inside one and leaves
        // half of it as the last thing somebody wrote.
        $this->assertSame(
            $limits['keptFromAnEmojiAnswer'],
            mb_strlen(Utterance::recordable(str_repeat('😢', Utterance::RECORDED_LIMIT + 10))),
        );
    }

    /** @return array{risk: list<array<string, mixed>>, extraction: list<array<string, mixed>>, plans: list<array<string, mixed>>, coach: list<array<string, mixed>>, limits: array<string, int>} */
    private static function cases(): array
    {
        $path = dirname(__DIR__, 4).'/parity/cases.json';
        $raw = file_get_contents($path);

        if ($raw === false) {
            throw new \RuntimeException("Parity fixture missing at {$path}. It is checked in; do not delete it.");
        }

        /** @var array{risk: list<array<string, mixed>>, extraction: list<array<string, mixed>>, plans: list<array<string, mixed>>, coach: list<array<string, mixed>>, limits: array<string, int>} $decoded */
        $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);

        return $decoded;
    }
}
