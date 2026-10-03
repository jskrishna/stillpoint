<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\StepId;
use App\Services\ProtocolVersionService;
use Illuminate\Console\Command;

/**
 * Fills the gaps in the protocol's step copy with a reviewable draft.
 *
 * ## Why this exists, and what it is not
 *
 * The designs specify step 1's question, step 4 in full and step 5's question,
 * and say nothing about steps 2, 3 and 6 or about when any step but 4 is done.
 * `ProtocolVersion::baseline()` keeps those `null`, which is honest about the
 * artifacts — and it meant the guide said **nothing at all** on three of the
 * six steps, because `ScriptedGuide` asks `main ?? ''`. Three blank screens is
 * not a more careful product than a draft somebody can read and change.
 *
 * So the baseline still says `null`, because the designs still say nothing, and
 * this writes a **draft** instead: a row an admin opens at `/admin/protocol`,
 * reads, edits and publishes, with the server refusing to publish anything
 * still incomplete. Nothing here reaches a user until a person presses that
 * button.
 *
 * **The copy below was written by Claude, not by a clinician and not from a
 * PRD.** It matches the voice of the three questions the designs do give —
 * short, second person, permission to take your time — and it follows each
 * step's own summary from the marketing site, which is the only statement of
 * intent there is. It is a starting point for the person who owns the
 * product's voice, and it should be read by somebody qualified before anyone
 * upset sees it. It is deliberately easy to change: it is rows in a table with
 * an editor in front of them.
 *
 * It never overwrites copy that is already there. A step somebody has written
 * is left exactly as it is, and the command says which ones it skipped.
 */
final class DraftStepCopy extends Command
{
    protected $signature = 'stillpoint:draft-step-copy';

    protected $description = 'Fill the protocol draft’s empty step copy with a reviewable starting point';

    /**
     * The draft copy, per step.
     *
     * `maxGuideTurns` is how many times the guide may re-ask before moving on
     * rather than pressing someone who is upset and cannot answer. Step 4's 4
     * is the designs'. The rest follow from how hard the step is: 3 where the
     * answer is a sentence about yourself, 2 where it is a selection or where
     * the wording does not matter.
     *
     * @var array<string, array{main: string, backups: list<string>, doneWhen: string, maxGuideTurns: int}>
     */
    private const COPY = [
        // Has its question from the designs; what was missing is the rest.
        'notice' => [
            'main' => 'You’re upset, and that’s okay. What happened?',
            'backups' => [
                'Take your time. Even a sentence is enough — what happened?',
                'Whatever comes first is fine. Who was there, and what was said?',
            ],
            'doneWhen' => 'The user says what happened, in their own words.',
            'maxGuideTurns' => 3,
        ],

        // Summary: "See that the hurt comes from how you see it." So the
        // question asks about their own reading of it, and says plainly that
        // this is not about fault — which is the one way this step can hurt
        // somebody if it is worded carelessly.
        'responsibility' => [
            'main' => 'This part isn’t about blame. What are you telling yourself about what happened?',
            'backups' => [
                'Take your time. What did it seem to say about you?',
                'Even a guess is fine. If a friend had been there, what would they say you were thinking?',
            ],
            'doneWhen' => 'The user names a thought of their own about it, not only what the other person did.',
            'maxGuideTurns' => 3,
        ],

        // Answered by picking from the twelve feelings, not in prose — the
        // designs give the grid and "Choose up to 3", so the question says so.
        'feel' => [
            'main' => 'What are you feeling right now? Choose up to three.',
            'backups' => [
                'Whatever is closest is fine. One is enough.',
            ],
            'doneWhen' => 'At least one feeling is chosen.',
            'maxGuideTurns' => 2,
        ],

        // Complete in the designs, including both backups and the turn limit.
        // Listed so this command's output accounts for all six steps, and
        // skipped like any other step that already has copy.
        'remember' => [
            'main' => 'When did you first feel this way as a child? Take your time.',
            'backups' => [
                'That’s okay. Maybe school, or home — a time someone saw you get something wrong?',
                'Even a small moment counts. Where were you, and who was there?',
            ],
            'doneWhen' => 'A specific memory, age under 12',
            'maxGuideTurns' => 4,
        ],

        'inquire' => [
            'main' => 'What did you believe about yourself then?',
            'backups' => [
                'Take your time. What did you decide about yourself, back then?',
                'Even a few words. “I’m not…” — how does that finish?',
            ],
            'doneWhen' => 'The user names a belief about themselves, in their own words.',
            'maxGuideTurns' => 3,
        ],

        // Summary: "Let that old belief go." The wording is the user's; the
        // backup says so, because being corrected on how you forgive yourself
        // would be the opposite of the point.
        'forgive' => [
            'main' => 'Last one. What do you forgive yourself for believing?',
            'backups' => [
                'There’s no right wording. “I forgive myself for believing that” is enough.',
            ],
            'doneWhen' => 'The user says something in their own words; the wording does not matter.',
            'maxGuideTurns' => 2,
        ],
    ];

    public function handle(ProtocolVersionService $versions): int
    {
        $draft = $versions->openDraft();
        $filled = [];
        $kept = [];

        foreach (StepId::ordered() as $id) {
            $step = $draft->step($id);
            $copy = self::COPY[$id->value];

            // Only the fields that are empty. A step somebody has written is
            // theirs, and a command that overwrites it is a command nobody can
            // run twice without checking first.
            $edit = [];
            if ($step->prompts->main === null || trim($step->prompts->main) === '') {
                $edit['main'] = $copy['main'];
            }
            if ($step->prompts->backups === []) {
                $edit['backups'] = $copy['backups'];
            }
            if ($step->doneWhen === null || trim($step->doneWhen) === '') {
                $edit['doneWhen'] = $copy['doneWhen'];
            }
            if ($step->maxGuideTurns === null) {
                $edit['maxGuideTurns'] = $copy['maxGuideTurns'];
            }

            if ($edit === []) {
                $kept[] = $id->value;

                continue;
            }

            $draft = $draft->withStepEdit($id, $edit);
            $filled[] = sprintf('%d %s — %s', $id->ordinal(), $id->value, implode(', ', array_keys($edit)));
        }

        $versions->store($draft);

        if ($filled === []) {
            $this->info('Nothing was empty. The draft already has copy for all six steps.');
        } else {
            $this->info('Filled in:');
            foreach ($filled as $line) {
                $this->line('  '.$line);
            }
        }

        if ($kept !== []) {
            $this->newLine();
            $this->line('Left alone, because they already had copy: '.implode(', ', $kept));
        }

        $this->newLine();
        $this->warn('This is a DRAFT, and the copy was not written by a clinician or from a PRD.');
        $this->line('Read it at /admin/protocol, change what you disagree with, and publish it there.');
        $this->line('Nothing above reaches anybody until an admin presses Publish.');

        return self::SUCCESS;
    }
}
