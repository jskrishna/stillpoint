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
                // Past tense, because people say it that way: "I wanted to
                // die". This also trips on reported speech ("a film about
                // someone who wanted to die"), which is the error this screen
                // is meant to make.
                'wanted to die', 'wanted to kill myself', 'tried to kill myself',
                'tried to end my life',

                // Hinglish, in the Roman script most people actually type on a
                // phone. Spelling is unsettled, so the common variants are all
                // listed — a missed spelling is a missed disclosure.
                'khudkushi', 'khudkhushi', 'khud kushi', 'atmahatya', 'aatmahatya',
                'mujhe marna hai', 'mujhe mar jana hai',
                'marna chahta hu', 'marna chahti hu',
                'marna chahta hoon', 'marna chahti hoon',
                'jaan de dunga', 'jaan de dungi', 'jaan dene ka',
                'nas kaat', 'khud ko khatam',

                // The same, in Devanagari.
                'खुदकुशी', 'आत्महत्या', 'मुझे मरना है',
                'मरना चाहता', 'मरना चाहती',
                'जान दे दूंगा', 'जान दे दूँगा', 'जान दे दूंगी', 'जान दे दूँगी',
                'जान देने का', 'नस काट', 'खुद को खत्म',
            ],
        ],
        [
            // Hopelessness and perceived burdensomeness: among the best-attested
            // warning signs, and nothing like a statement of intent. Medium flags
            // them for a reviewer without ending a session, which is the right
            // trade — an upset person saying "I can't go on" is having an ordinary
            // bad day often enough that stopping on it would make the product
            // unusable.
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::SelfHarm,
            'phrases' => [
                'feel like a burden', 'burden to everyone', 'burden to my family',
                'burden on everyone', "can't go on", 'cannot go on', "can't keep going",
                'tired of living', "don't want to live", 'do not want to live',
                'no point in living', "better off if i wasn't here",
                'better off if i was not here',

                // Hinglish. Graded the same as their English counterparts
                // rather than up: "jeene ka mann nahi" is "I don't want to
                // live", which is medium, and an upset person says it on an
                // ordinary bad day.
                'jeene ka mann nahi', 'jeena nahi chahta', 'jeena nahi chahti',
                'jeene ki iccha nahi', 'sabke liye bojh', 'sab ke liye bojh',
                'bojh ban gaya hu', 'bojh ban gayi hu', 'bojh hu sabpe',
                'jeene se thak', 'thak gaya hu jeene', 'thak gayi hu jeene',

                // The same, in Devanagari.
                'जीने का मन नहीं', 'जीना नहीं चाहता', 'जीना नहीं चाहती',
                'जीने की इच्छा नहीं', 'सबके लिए बोझ', 'बोझ बन गया', 'बोझ बन गई',
                'जीने से थक',
            ],
        ],
        [
            'level' => SafetyLevel::Low,
            'category' => SafetyCategory::SelfHarm,
            'phrases' => [
                'nothing matters any more', 'nothing matters anymore',
                "what's the point any more", "what's the point anymore",
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
                // Disordered eating, stated as a thing the person is doing to
                // themselves.
                "haven't eaten in", 'have not eaten in', 'stopped eating',
                'starve myself', 'starving myself', 'make myself sick',
                'making myself sick',
                // Drinking or using to blunt feeling, which is what a session is for.
                'drank a whole bottle', 'drinking every day', 'drink to forget',
                'relapsed',
            ],
        ],
        [
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::Trauma,
            'phrases' => [
                'abused me', 'he hit me', 'she hit me', 'they hit me', 'hits me',
                'beats me', 'assaulted me', 'raped me', 'molested me',
                // Threats and fear of a specific person: a disclosure, not a feeling.
                'threatens me', 'threatened me', 'threatens to kill',
                'threatened to kill', 'forced me', 'afraid of him', 'afraid of her',
                'scared of him', 'scared of her',
            ],
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
     *
     * Devanagari is kept. It used to be stripped along with everything else
     * outside `[a-z' ]`, which turned a sentence written in Hindi into an empty
     * string and graded it `none` without a rule ever running. Lower-casing is
     * a no-op for the script, and its own punctuation — the danda and the
     * double danda — is removed with the rest.
     */
    private static function normalise(string $utterance): string
    {
        $text = mb_strtolower($utterance);
        $text = str_replace(['’', '‘', '`'], "'", $text);
        // Danda, double danda, and the zero-width joiners a mobile keyboard
        // leaves inside a conjunct.
        $text = preg_replace('/[\x{0964}\x{0965}\x{200c}\x{200d}]/u', ' ', $text) ?? '';
        // `\p{Devanagari}` rather than the code-point range: it says what it
        // means and covers the extended block too.
        $text = preg_replace("/[^a-z'\p{Devanagari} ]+/u", ' ', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }
}
