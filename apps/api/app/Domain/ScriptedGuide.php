<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * A deterministic guide that reads the protocol and nothing else.
 *
 * It opens with the step's main question, falls back through the backups when
 * an answer is too thin, and gives up on a step once the version's turn limit
 * is reached rather than pressing someone who cannot answer.
 *
 * It interprets nothing. What it records is {@see LiteralExtraction}: the answer
 * taken at face value, which is the stand-in a real model replaces.
 */
final class ScriptedGuide implements Guide
{
    public function respond(Session $session, ProtocolVersion $version, string $utterance): GuideReply
    {
        $stepId = $session->stepId;
        if ($stepId === null) {
            return new GuideReply('', false);
        }

        $step = $version->step($stepId);

        // Opening the step: ask the main question, say nothing about an answer.
        if (trim($utterance) === '') {
            return new GuideReply($step->prompts->main ?? '', false);
        }

        if (LiteralExtraction::isSubstantiveAnswer($stepId, $utterance)) {
            return new GuideReply('', true, LiteralExtraction::for($stepId, $utterance));
        }

        $backup = $step->prompts->backups[$session->guideTurnsUsed] ?? null;
        if ($backup !== null) {
            return new GuideReply($backup, false);
        }

        // Out of backups, or out of turns. Moving on beats pressing someone who
        // is upset and cannot answer; the protocol's own limit says when.
        $limit = $step->maxGuideTurns;
        if ($limit !== null && $session->guideTurnsUsed + 1 >= $limit) {
            // Giving up on the step still records whatever was said: a thin
            // answer is the user's answer, and dropping it would lose it from
            // their journal.
            return new GuideReply('', true, LiteralExtraction::for($stepId, $utterance));
        }

        return new GuideReply($step->prompts->main ?? '', false);
    }
}
