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

    /**
     * The bug this closes, stated as a test.
     *
     * Canada is the first market and French is one of its two official
     * languages. French is Latin script, so `normalise()` did not throw it
     * away the way it once threw away Devanagari — it threw away only the
     * accents, found no phrase, and returned None with unreadable false.
     *
     * That is worse than the Devanagari bug it resembles: there the screen now
     * at least admits it could not read the text, where this gave a plain
     * statement of intent a confident clean answer.
     */
    public function test_reads_a_french_statement_of_intent_as_high(): void
    {
        $screen = new PhraseRiskScreen;

        foreach ([
            'je veux mourir',
            'je veux me tuer',
            'j’ai envie de me suicider',
            'je veux en finir',
            'mettre fin à mes jours',
            'tout le monde serait mieux sans moi',
        ] as $said) {
            $this->assertSame(SafetyLevel::High, $screen->assess($said)->level, $said);
        }
    }

    /**
     * The ceiling rule, in French too. High ends the session, so if this
     * graded up, the French half of the screen would stop sessions the English
     * half would not.
     */
    public function test_keeps_french_hopelessness_at_medium(): void
    {
        $screen = new PhraseRiskScreen;

        foreach ([
            'je n’en peux plus',
            'je ne peux plus continuer',
            'je suis fatigué de vivre',
            'je ne veux plus vivre',
            'je suis un fardeau pour tout le monde',
        ] as $said) {
            $this->assertSame(SafetyLevel::Medium, $screen->assess($said)->level, $said);
        }
    }

    public function test_leaves_an_ordinary_french_bad_day_alone(): void
    {
        $screen = new PhraseRiskScreen;

        foreach ([
            'aujourd’hui mon patron m’a critiqué devant toute l’équipe',
            'je suis en colère',
            'je me sens seul',
        ] as $said) {
            $assessment = $screen->assess($said);
            $this->assertSame(SafetyLevel::None, $assessment->level, $said);
            $this->assertFalse($assessment->unreadable, $said);
        }
    }

    /**
     * Accents folded, so the same sentence matches typed either way — which a
     * phone keyboard without French accents makes ordinary, and which saves
     * listing every spelling twice. The three Unicode steps are the same here
     * and in `packages/protocol/src/risk.ts`, and the parity fixture pins it.
     */
    public function test_matches_french_with_or_without_the_accents(): void
    {
        $screen = new PhraseRiskScreen;

        $this->assertSame(SafetyLevel::Medium, $screen->assess('je suis fatigué de vivre')->level);
        $this->assertSame(SafetyLevel::Medium, $screen->assess('je suis fatigue de vivre')->level);
        $this->assertSame(SafetyLevel::High, $screen->assess('mettre fin à mes jours')->level);
        $this->assertSame(SafetyLevel::High, $screen->assess('mettre fin a mes jours')->level);
    }

    /** The folding must not disturb Devanagari, which decomposes differently. */
    public function test_still_reads_devanagari_after_the_folding(): void
    {
        $screen = new PhraseRiskScreen;

        $this->assertSame(SafetyLevel::High, $screen->assess('मुझे मरना है')->level);
        $this->assertSame(SafetyLevel::Medium, $screen->assess('मैं जीने से थक गया हूँ')->level);
        $this->assertSame(SafetyLevel::None, $screen->assess('मेरा दिन बहुत खराब था')->level);
    }

    /**
     * The limitation this leaves, stated so nobody has to rediscover it.
     *
     * `unreadable` is true only for a script the screen has no phrases for at
     * all. A language in Latin script that it has no phrases for normalises
     * cleanly, matches nothing, and comes back None with unreadable false —
     * the confident clean answer French used to get. French is covered because
     * Canada is the first market; Spanish is not, and does not announce
     * itself.
     */
    public function test_cannot_say_when_a_latin_script_language_is_not_covered(): void
    {
        $assessment = (new PhraseRiskScreen)->assess('quiero morirme');

        $this->assertSame(SafetyLevel::None, $assessment->level);
        $this->assertFalse($assessment->unreadable);
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
