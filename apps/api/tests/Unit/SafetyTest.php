<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Helpline;
use App\Domain\NoRiskScreen;
use App\Domain\PhraseRiskScreen;
use App\Domain\RiskAssessment;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SafetyTest extends TestCase
{
    private function assess(string $text): RiskAssessment
    {
        return (new PhraseRiskScreen)->assess($text);
    }

    public function test_stops_only_on_the_highest_level(): void
    {
        $this->assertTrue(SafetyLevel::High->mustStop());
        $this->assertFalse(SafetyLevel::Medium->mustStop());
        $this->assertFalse(SafetyLevel::Low->mustStop());
        $this->assertFalse(SafetyLevel::None->mustStop());
    }

    public function test_flags_anything_above_none_without_interrupting(): void
    {
        $this->assertTrue(SafetyLevel::Low->mustFlag());
        $this->assertTrue(SafetyLevel::Medium->mustFlag());
        $this->assertTrue(SafetyLevel::High->mustFlag());
        $this->assertFalse(SafetyLevel::None->mustFlag());
    }

    public function test_maps_each_level_to_one_action(): void
    {
        $this->assertSame('continue', SafetyLevel::None->action());
        $this->assertSame('flag', SafetyLevel::Low->action());
        $this->assertSame('flag', SafetyLevel::Medium->action());
        $this->assertSame('stop', SafetyLevel::High->action());
    }

    public function test_takes_the_more_severe_of_two_levels_in_either_order(): void
    {
        $this->assertSame(SafetyLevel::Medium, SafetyLevel::None->atLeast(SafetyLevel::Medium));
        $this->assertSame(SafetyLevel::Medium, SafetyLevel::Medium->atLeast(SafetyLevel::None));
        $this->assertSame(SafetyLevel::High, SafetyLevel::High->atLeast(SafetyLevel::Low));
        $this->assertSame(SafetyLevel::Low, SafetyLevel::Low->atLeast(SafetyLevel::Low));
    }

    public function test_finds_nothing_in_ordinary_upset(): void
    {
        $this->assertSame(
            SafetyLevel::None,
            $this->assess('My manager called out my mistake in front of the whole team')->level,
        );
    }

    public function test_finds_nothing_in_a_blank_utterance(): void
    {
        $this->assertSame(SafetyLevel::None, $this->assess('')->level);
        $this->assertSame(SafetyLevel::None, $this->assess("  \n ")->level);
    }

    public function test_catches_the_phrasing_the_designs_themselves_use(): void
    {
        $r = $this->assess('I keep messing up. Sometimes I think everyone would be better off without me.');
        $this->assertSame(SafetyLevel::High, $r->level);
        $this->assertSame(SafetyCategory::SelfHarm, $r->category);
        $this->assertSame('better off without me', $r->matched);
    }

    /** @return list<array{string}> */
    public static function selfHarmPhrasings(): array
    {
        return [
            ['I want to die'],
            ['I have been thinking about ending my life'],
            ['sometimes I just want to hurt myself'],
            ['there is no reason to live'],
            ['I wish I was dead'],
        ];
    }

    #[DataProvider('selfHarmPhrasings')]
    public function test_catches_explicit_self_harm_phrasings(string $text): void
    {
        $this->assertSame(SafetyLevel::High, $this->assess($text)->level, $text);
    }

    public function test_is_not_fooled_by_a_curly_apostrophe(): void
    {
        $this->assertSame(SafetyLevel::High, $this->assess('I don’t want to be here any more')->level);
        $this->assertSame(SafetyLevel::High, $this->assess("I don't want to be here any more")->level);
    }

    public function test_is_not_fooled_by_case_or_punctuation(): void
    {
        $this->assertSame(SafetyLevel::High, $this->assess('KILL MYSELF.')->level);
        $this->assertSame(SafetyLevel::High, $this->assess('...kill   myself...')->level);
    }

    public function test_reads_across_a_line_break_from_a_transcript(): void
    {
        $this->assertSame(SafetyLevel::High, $this->assess("everyone would be\nbetter off without me")->level);
    }

    public function test_grades_harm_to_others(): void
    {
        $this->assertSame(SafetyLevel::Medium, $this->assess('I could hurt him')->level);
        $this->assertSame(SafetyLevel::High, $this->assess('I want to kill him')->level);
    }

    public function test_grades_the_medical_and_trauma_cases_the_queue_shows(): void
    {
        $this->assertSame(SafetyCategory::Medical, $this->assess('I stopped my meds last week')->category);
        $this->assertSame(SafetyLevel::Medium, $this->assess('I stopped my meds last week')->level);
        $this->assertSame(SafetyCategory::Trauma, $this->assess('he hit me when I was small')->category);
    }

    public function test_takes_the_most_severe_match_when_several_trip(): void
    {
        $r = $this->assess('I stopped my meds and I want to die');
        $this->assertSame(SafetyLevel::High, $r->level);
        $this->assertSame(SafetyCategory::SelfHarm, $r->category);
    }

    public function test_leaves_category_unset_when_nothing_matched(): void
    {
        $this->assertNull($this->assess('a normal day')->category);
    }

    public function test_the_no_op_screen_finds_nothing(): void
    {
        $this->assertSame(SafetyLevel::None, (new NoRiskScreen)->assess('I want to die')->level);
    }

    public function test_offers_tele_manas_and_emergency_for_india(): void
    {
        $this->assertSame(
            ['14416', '112'],
            array_map(fn (Helpline $h) => $h->number, Helpline::forCountry('IN')),
        );
    }

    public function test_returns_no_helplines_for_a_country_it_does_not_cover(): void
    {
        // A wrong crisis number is worse than none, so this stays empty rather
        // than substituting something plausible.
        //
        // This named Canada until Canada became the first market — which is
        // the thing worth noticing about it: the assertion was correct and the
        // behaviour it pinned meant a Canadian in crisis saw no number at all.
        $this->assertSame([], Helpline::forCountry('US'));
        $this->assertSame([], Helpline::forCountry('GB'));
        $this->assertSame([], Helpline::forCountry(''));
    }
}
