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
 * It understands nothing, deliberately: extraction is left to the caller, which
 * is exactly the seam a real model slots into.
 */
final class ScriptedGuide implements Guide
{
    public function respond(Session $session, ProtocolVersion $version, string $utterance): GuideReply
    {
        if ($session->stepId === null) {
            return new GuideReply('', false);
        }

        $step = $version->step($session->stepId);

        // Opening the step: ask the main question, say nothing about an answer.
        if (trim($utterance) === '') {
            return new GuideReply($step->prompts->main ?? '', false);
        }

        if (self::isSubstantive($utterance)) {
            return new GuideReply('', true);
        }

        $backup = $step->prompts->backups[$session->guideTurnsUsed] ?? null;
        if ($backup !== null) {
            return new GuideReply($backup, false);
        }

        // Out of backups, or out of turns. Moving on beats pressing someone who
        // is upset and cannot answer; the protocol's own limit says when.
        $limit = $step->maxGuideTurns;
        if ($limit !== null && $session->guideTurnsUsed + 1 >= $limit) {
            return new GuideReply('', true);
        }

        return new GuideReply($step->prompts->main ?? '', false);
    }

    private static function isSubstantive(string $utterance): bool
    {
        return count(array_filter(preg_split('/\s+/', trim($utterance)) ?: [])) >= 3;
    }
}
