<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * A small phrase screen for the obvious cases.
 *
 * ## What this is, and what it is not
 *
 * A **backstop, not the detector.** It runs on every utterance so the obvious
 * cases cannot be missed while a real classifier is chosen and reviewed.
 *
 * It will miss things. It cannot read tone, context, metaphor, irony or code
 * switching, and it knows English phrasings only. **No one should ship this as
 * the only screen, and no clinical claim should rest on it.** A real deployment
 * needs a trained model and sign-off from someone qualified to judge it.
 *
 * Given that, it is tuned for recall over precision: a false flag costs a
 * reviewer a minute, a missed one costs something that cannot be undone. Where
 * a phrase is ambiguous it is graded up, not down.
 */
final class PhraseRiskScreen implements RiskScreen
{
    /** @var list<array{level: SafetyLevel, category: SafetyCategory, phrases: list<string>}> */
    private const RULES = [
        [
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::SelfHarm,
            'phrases' => [
                'better off without me', 'better off if i was gone', 'kill myself',
                'killing myself', 'end my life', 'ending my life', 'take my own life',
                'want to die', 'wish i was dead', 'wish i were dead', 'no reason to live',
                'nothing to live for', 'not want to be here', "don't want to be here",
                'do not want to be here', 'hurt myself', 'harm myself', 'cut myself',
                'suicide', 'suicidal',
            ],
        ],
        [
            'level' => SafetyLevel::High,
            'category' => SafetyCategory::HarmToOthers,
            'phrases' => ['kill him', 'kill her', 'kill them', 'want to hurt someone'],
        ],
        [
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::HarmToOthers,
            'phrases' => ['could hurt him', 'could hurt her', 'could hurt them', 'want to hit'],
        ],
        [
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::Medical,
            'phrases' => [
                'stopped my meds', 'stopped taking my meds', 'stopped my medication',
                'stopped taking my medication', 'off my meds',
            ],
        ],
        [
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::Trauma,
            'phrases' => ['abused me', 'he hit me', 'she hit me', 'they hit me', 'assaulted me'],
        ],
        [
            'level' => SafetyLevel::Low,
            'category' => SafetyCategory::Medical,
            'phrases' => ['not sleeping at all', "can't stop drinking", 'cannot stop drinking'],
        ],
    ];

    public function assess(string $utterance): RiskAssessment
    {
        $text = self::normalise($utterance);
        if ($text === '') {
            return RiskAssessment::none();
        }

        $best = null;

        foreach (self::RULES as $rule) {
            foreach ($rule['phrases'] as $phrase) {
                if (! str_contains($text, $phrase)) {
                    continue;
                }
                if ($best === null || $rule['level']->rank() > $best['level']->rank()) {
                    $best = ['level' => $rule['level'], 'category' => $rule['category'], 'matched' => $phrase];
                }
            }
        }

        return $best === null
            ? RiskAssessment::none()
            : new RiskAssessment($best['level'], $best['category'], $best['matched']);
    }

    /**
     * Normalises an utterance for matching.
     *
     * Curly apostrophes become straight so "don't" and "don’t" hit the same
     * rule, and punctuation and line breaks collapse so a phrase cannot hide
     * across a transcript's formatting.
     */
    private static function normalise(string $utterance): string
    {
        $text = mb_strtolower($utterance);
        $text = str_replace(['’', '‘', '`'], "'", $text);
        $text = preg_replace("/[^a-z' ]+/u", ' ', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }
}
