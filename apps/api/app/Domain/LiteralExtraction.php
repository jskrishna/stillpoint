<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * What an answer is taken to mean, until a model exists.
 *
 * A real guide reads the answer and pulls out what happened, the memory and
 * the belief. This does nothing of the kind: it attaches the obvious mapping —
 * whatever the user said at a step is what that step was asking for — so the
 * loop can be run and tested before that model lands.
 *
 * It is a stand-in and it reads nothing. It is the port of
 * `packages/protocol/src/extraction.ts` and must agree with it; there is a
 * parity test over both.
 */
final class LiteralExtraction
{
    /**
     * The feeling ids in an answer to step 3, in the order they were given.
     *
     * @return list<FeelingId>
     */
    public static function feelingsIn(string $utterance): array
    {
        $found = [];
        foreach (preg_split('/[^a-z]+/', mb_strtolower($utterance)) ?: [] as $token) {
            $id = FeelingId::tryFrom($token);
            if ($id !== null && ! in_array($id, $found, true)) {
                $found[] = $id;
            }
            // Capped, which is what `MAX_CHOICES` was for: it was declared
            // here and used by nothing, so "Choose up to 3" was a rule only
            // the two grids kept. A turn naming all twelve recorded all
            // twelve — the journal listed twelve and insights counted twelve
            // for one session, which is a ranking of nothing. The first three
            // in the order given rather than a refusal, because at this step
            // the answer is a selection and dropping the fourth is what the
            // screen already does to the fourth tap.
            if (count($found) === FeelingId::MAX_CHOICES) {
                break;
            }
        }

        return $found;
    }

    /**
     * Whether an answer is substantial enough to move the step on.
     *
     * Prose is judged by length, which is crude and is meant to be. A selection
     * is not judged at all: one feeling named is an answer, and counting its
     * words would stall step 3 for anyone who did not happen to pick exactly
     * three.
     */
    public static function isSubstantiveAnswer(StepId $stepId, string $utterance): bool
    {
        if ($stepId->answerKind() === AnswerKind::Feelings) {
            return self::feelingsIn($utterance) !== [];
        }

        return count(array_filter(preg_split('/\s+/', trim($utterance)) ?: [])) >= 3;
    }

    /**
     * What a step's answer is taken to mean, with no interpretation at all.
     *
     * An empty array means nothing was recorded.
     *
     * @return array<string, mixed>
     */
    public static function for(StepId $stepId, string $utterance): array
    {
        $text = trim($utterance);
        if ($text === '') {
            return [];
        }

        return match ($stepId) {
            StepId::Notice => ['whatHappened' => $text, 'title' => mb_substr($text, 0, 60)],
            StepId::Feel => self::feelingsIn($text) === []
                ? []
                : ['feelings' => array_map(fn (FeelingId $f) => $f->value, self::feelingsIn($text))],
            StepId::Remember => ['memory' => ['description' => $text]],
            StepId::Inquire => self::inquire($text),
            // Steps 2 and 6 record nothing: the designs give them no field to
            // fill, and a guess would end up in the journal as if the user had
            // said it.
            default => [],
        };
    }

    /**
     * Phrases the forgiveness line for a belief, as the journal shows it:
     * "I'm not good enough." becomes "Forgive me for believing that I am not
     * good enough."
     *
     * Best-effort English phrasing from the user's own words — the guide may
     * capture its own wording instead, and null here simply means there is
     * nothing to phrase yet.
     */
    public static function forgivenessFor(?string $belief): ?string
    {
        if ($belief === null) {
            return null;
        }

        // The belief is quoted wherever it is displayed; store it unquoted.
        $trimmed = trim($belief);
        $trimmed = trim((string) preg_replace('/^["“”\']+|["“”\']+$/u', '', $trimmed));
        $trimmed = trim((string) preg_replace('/[.。]+$/u', '', $trimmed));

        if ($trimmed === '') {
            return null;
        }

        // "I'm" reads wrong inside "believing that ..."; expand it, straight or curly.
        $expanded = (string) preg_replace('/\bI[\'’]m\b/u', 'I am', $trimmed);

        return "Forgive me for believing that {$expanded}.";
    }

    /** @return array<string, mixed> */
    private static function inquire(string $text): array
    {
        $forgiveness = self::forgivenessFor($text);

        return $forgiveness === null
            ? ['belief' => $text]
            : ['belief' => $text, 'forgiveness' => $forgiveness];
    }
}
