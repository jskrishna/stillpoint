<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Whoever decides what to say next and whether a step is done.
 *
 * In the product this is a language model. It is an interface so the turn loop
 * can run and be tested before that model exists, and so the model can be
 * swapped in without the session knowing. Everything a guide may do is in
 * GuideReply; it cannot reach into the session itself.
 */
interface Guide
{
    public function respond(Session $session, ProtocolVersion $version, string $utterance): GuideReply;
}
