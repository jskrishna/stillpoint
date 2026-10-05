<?php

declare(strict_types=1);

namespace App\Domain;

use Normalizer;

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

                // French. Canada is the first market and French is one of its
                // two official languages — and French is Latin script, so
                // before this the screen graded "je veux mourir" as None with
                // unreadable false: a confident clean answer about a plain
                // statement of intent. That is the worst shape this screen can
                // fail in.
                //
                // Written without accents because `normalise()` folds them,
                // which also means somebody typing without them still matches.
                'je veux mourir', 'je veux me tuer',
                'je vais me tuer', 'me suicider',
                'je veux en finir', 'en finir avec la vie',
                'mettre fin a mes jours', 'me faire du mal',
                'mieux sans moi',
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

                // French, graded the same as their English counterparts
                // rather than up. "je n'en peux plus" is "I can't take any
                // more", the sentence the ceiling rule exists for: flagged,
                // not stopped on. And wanting not to live is not a statement
                // of intent in French either — or the French half of the
                // screen would stop sessions the English half would not.
                "je n'en peux plus", 'je ne peux plus continuer',
                'fatigue de vivre', 'je ne veux pas vivre',
                'je ne veux plus vivre', 'plus envie de vivre',
                "je n'ai plus d'espoir", "plus rien n'a de sens",
                'je suis un fardeau', 'un poids pour tout le monde',
            ],
        ],
        [
            'level' => SafetyLevel::Low,
            'category' => SafetyCategory::SelfHarm,
            'phrases' => [
                'nothing matters any more', 'nothing matters anymore',
                "what's the point any more", "what's the point anymore",

                // French. "a quoi bon" is broad — it is also how somebody
                // gives up on a spreadsheet — and Low is the level for a
                // signal worth a reviewer's glance and nothing more.
                'a quoi bon', 'plus rien ne compte',
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

    /**
     * Characters that belong to no one script, taken out before a script is
     * asked about.
     *
     * **`\p{Latin}` does not mean one thing.** PCRE2 matches a script's name
     * against Script_Extensions from 10.40 and against Script before it, and
     * which one this PHP has is a fact about how it was built. So the same
     * line of this file called an English sentence typed with U+02BC readable
     * on one machine and unreadable on another. That character is the
     * modifier apostrophe some keyboards type: Common script, used with
     * Latin, which is the difference between the two properties. The suite
     * passed on a Mac and the parity fixture went red in CI, on this class
     * and nothing else.
     *
     * So every character the two properties disagree about for Latin or
     * Devanagari is removed before either is consulted: the modifier letters,
     * the Vedic signs, one combining mark and the North Indic number forms.
     * Compared over every code point, with these gone the two agree. None of
     * them is evidence of a language. `SCRIPTLESS` in
     * `packages/protocol/src/risk.ts` is the same class.
     */
    private const SCRIPTLESS = '/[\x{02b0}-\x{02ff}\x{0951}\x{0952}\x{1cd0}-\x{1cff}\x{20f0}\x{a830}-\x{a839}]/u';

    public function assess(string $utterance): RiskAssessment
    {
        // From the utterance as it was said, not from the normalised text:
        // normalising is what throws the unreadable scripts away, so by then
        // the evidence is gone. That was the whole bug.
        $unreadable = ! self::readsEverything($utterance);

        // Two readings, strict first. A later match replaces an earlier one
        // only when it is more severe, so whatever the strict reading found is
        // still what is reported, and the forgiving one can only add to it.
        $readings = [
            [self::normalise($utterance), false],
            [self::normaliseForgivingly($utterance), true],
        ];

        $best = null;

        foreach ($readings as [$text, $forgiving]) {
            if ($text === '') {
                continue;
            }

            foreach (self::RULES as $rule) {
                foreach ($rule['phrases'] as $phrase) {
                    $spelt = $forgiving ? str_replace("'", '', $phrase) : $phrase;
                    if (! str_contains($text, $spelt)) {
                        continue;
                    }
                    if ($best === null || $rule['level']->rank() > $best['level']->rank()) {
                        // The phrase as it is listed, whichever reading found
                        // it: that is what a reviewer is shown.
                        $best = ['level' => $rule['level'], 'category' => $rule['category'], 'matched' => $phrase];
                    }
                }
            }
        }

        return $best === null
            ? RiskAssessment::none($unreadable)
            : new RiskAssessment($best['level'], $best['category'], $best['matched'], $unreadable);
    }

    /**
     * Whether every letter in the utterance is in a script the screen can
     * read.
     *
     * Latin covers English and Hinglish; Devanagari covers Hindi. Everything
     * else — Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia,
     * Gurmukhi, the Perso-Arabic of Urdu — it cannot read at all.
     *
     * Any single unreadable letter answers no. There is no threshold on
     * purpose: a threshold would be a guess about how much of a sentence has
     * to be missed before it matters, and this answer costs nothing when it is
     * over-eager — it flags nobody and changes nothing the user sees. It only
     * stops the screen claiming to have read something it did not.
     *
     * Combining marks are not `\p{L}`, so a Devanagari matra never counts as
     * an unreadable letter in its own right.
     *
     * The port of `readsEverything` in `packages/protocol/src/risk.ts`; the
     * parity fixture covers it.
     *
     * `SCRIPTLESS` comes out first, and that is what makes the line below
     * mean one thing on every server.
     */
    private static function readsEverything(string $utterance): bool
    {
        $letters = preg_replace(self::SCRIPTLESS, '', $utterance) ?? '';
        $letters = preg_replace('/[^\p{L}]+/u', '', $letters) ?? '';

        return (preg_replace('/[\p{Latin}\p{Devanagari}]+/u', '', $letters) ?? '') === '';
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
        // Latin diacritics folded, so "fatigué" matches `fatigue` and so does
        // "fatigue" typed without the accent. The filter below keeps `a-z` and
        // nothing else, so every accent used to become a space — "je suis
        // fatigué" normalised to "je suis fatigu" — while `readsEverything()`
        // called the text perfectly readable, because é is Latin script. The
        // two disagreed about what reading means, and French is an official
        // language of the first market.
        //
        // Decompose, drop the Latin combining marks, recompose. The range is
        // the Combining Diacritical Marks block, which is Latin and Greek: a
        // Devanagari vowel sign is U+0900-U+097F and is untouched, and the
        // recompose puts back the few Devanagari characters that decompose at
        // all. `normalise()` in `packages/protocol/src/risk.ts` does the same
        // three steps with the same range, and the parity fixture covers it.
        $decomposed = Normalizer::normalize($text, Normalizer::FORM_D);
        if (is_string($decomposed)) {
            $stripped = preg_replace('/[\x{0300}-\x{036f}]+/u', '', $decomposed) ?? $decomposed;
            $recomposed = Normalizer::normalize($stripped, Normalizer::FORM_C);
            $text = is_string($recomposed) ? $recomposed : $stripped;
        }
        // Danda, double danda, and the zero-width joiners a mobile keyboard
        // leaves inside a conjunct.
        $text = preg_replace('/[\x{0964}\x{0965}\x{200c}\x{200d}]/u', ' ', $text) ?? '';
        // Before the script is asked about: whether these count as
        // Devanagari depends on which PCRE2 this PHP has. See `SCRIPTLESS`.
        $text = preg_replace(self::SCRIPTLESS, ' ', $text) ?? '';
        // `\p{Devanagari}` rather than the code-point range: it says what it
        // means and covers the extended block too.
        $text = preg_replace("/[^a-z'\p{Devanagari} ]+/u", ' ', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }

    /**
     * A second, more forgiving reading of the same utterance.
     *
     * The port of `normaliseForgivingly` in `packages/protocol/src/risk.ts`,
     * which has the measurements. In short: `normalise()` reads text as it
     * was typed, and four ordinary things a phone does made a listed phrase
     * unrecognisable to it. An apostrophe left out ("dont", "cant", "jai")
     * sent all twelve phrases that contain one to `none`, one of them `high`.
     * A joiner inside a Devanagari conjunct, which `normalise()` turns into a
     * space, cut the word in half. A zero-width space or a soft hyphen inside
     * a word did the same to 131 of 155. And fullwidth letters matched
     * nothing while counting as readable, because they are Latin script.
     *
     * So this reading drops what the strict one keeps: apostrophes go,
     * invisible characters go, and the fold is the compatibility one (NFKD).
     * Lower-casing comes after the fold because a styled capital has no lower
     * case of its own until it has been folded to a plain one.
     *
     * **It is a second reading and not a changed rule.** `assess()` takes the
     * strict one first and a match in either counts, so nothing that matched
     * before can stop matching. It adds no phrase and no language, and the
     * parity fixture covers it.
     */
    private static function normaliseForgivingly(string $utterance): string
    {
        // What a keyboard types where an apostrophe goes: the curly pair, the
        // reversed one, the backtick, the acute accent, the modifier
        // apostrophe and the okina, the prime, and the fullwidth apostrophe.
        $text = preg_replace('/[\x{2018}\x{2019}\x{201b}`\x{00b4}\x{02bc}\x{02bb}\x{2032}\x{ff07}]/u', "'", $utterance) ?? '';

        $decomposed = Normalizer::normalize($text, Normalizer::FORM_KD);
        $text = mb_strtolower(is_string($decomposed) ? $decomposed : $text);
        $text = preg_replace('/[\x{0300}-\x{036f}]+/u', '', $text) ?? '';
        $recomposed = Normalizer::normalize($text, Normalizer::FORM_C);
        $text = is_string($recomposed) ? $recomposed : $text;

        // No width, and inside a word: the zero-width space and the two
        // joiners, the word joiner, the byte-order mark and the soft hyphen.
        $text = preg_replace('/[\x{200b}\x{200c}\x{200d}\x{2060}\x{feff}\x{00ad}]/u', '', $text) ?? '';
        $text = str_replace("'", '', $text);
        $text = preg_replace('/[\x{0964}\x{0965}]/u', ' ', $text) ?? '';
        $text = preg_replace(self::SCRIPTLESS, ' ', $text) ?? '';
        $text = preg_replace('/[^a-z\p{Devanagari} ]+/u', ' ', $text) ?? '';
        $text = preg_replace('/\s+/u', ' ', $text) ?? '';

        return trim($text);
    }
}
