<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\CalmerRating;
use App\Domain\EndReason;
use App\Domain\FeelingId;
use App\Domain\SafetyCategory;
use App\Domain\SafetyLevel;
use App\Domain\SessionKind;
use App\Domain\StepId;
use App\Models\GuidedSession;
use App\Models\JournalEntry;
use App\Models\SafetyFlag;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Sessions, journal entries and a safety flag, so the demo is worth looking at.
 *
 * **This is not `DemoSeeder` and must never be folded into it.** That one makes
 * accounts and a pairing and says why it makes nothing else: "a fixture that
 * already contains what a test is about is a test that passes whether or not
 * the code works." That reasoning is right and this seeder does not touch it —
 * `pnpm run demo` runs both, `pnpm run e2e` runs only the first, and no test
 * ever runs this one.
 *
 * ## Why it exists
 *
 * The first item in `LAUNCH.md` is a clinician reading the risk screen, and it
 * says the way to ask is `pnpm run demo`, "which brings up a seeded stack and
 * prints the four accounts and the five URLs, **including the console's safety
 * queue, where they can see what a reviewer would actually read**."
 *
 * That sentence was false. Walked in a real browser against the seeded stack:
 * the journal said "Nothing yet", insights said "Nothing to show yet", the
 * console's overview read 0 sessions and 0% at every step, the coach's two
 * clients were a row of em-dashes, and **the safety queue said "Nothing in the
 * queue"** — the one screen the whole request is about. `e2e/run.mjs` also
 * printed `you@stillpoint.test` as "an ordinary account, with a journal",
 * which it was not.
 *
 * ## What is in here, and what is deliberately not
 *
 * The content is ordinary upsets — a meeting, a sibling, a late reply — written
 * to be plainly fictional and plainly mundane. **Only the one safety flag
 * carries anything like a disclosure**, because an empty queue cannot show a
 * reviewer what a reviewer reads, and that is the thing being asked about. It
 * is one flag, at `medium`, and the excerpt is a sentence about not coping
 * rather than a statement of intent — enough to show the screen doing its job
 * without putting invented crisis language in a database somebody may later
 * screenshot.
 *
 * None of it is clinical material and none of it was reviewed by anybody: it is
 * demo furniture. `docs/clinical-review/RISK-SCREEN-REVIEW.md` is the generated
 * document with the real phrases in it, and that is what a reviewer judges.
 *
 * ## The dates are load-bearing
 *
 * `guided_sessions.started_at` is what the weekly allowance counts, so seeding
 * three **full** sessions into the current week would hand the demo user a home
 * screen saying they have none left — an unusable demo and a wrong impression
 * of the product. So the five full ones are all at least eight days old, inside
 * the insights window of thirty days, and this week's three are intact.
 *
 * That left the console's overview reading zero at everything, because its
 * figures are for the last seven days. The way out is that the allowance counts
 * `kind = full` only and the pricing page promises unlimited quick sessions, so
 * `RECENT` puts three **quick** sessions inside the week: the overview comes
 * alive and the home screen still reads 3 of 3.
 *
 * Re-running it is safe: it removes what it previously made for those accounts
 * before making it again, so `pnpm run demo` twice is not a journal of
 * duplicates.
 */
final class DemoContentSeeder extends Seeder
{
    /**
     * One upset per entry: what happened, the belief under it, the feelings,
     * what forgiveness sounded like, and how it was rated afterwards.
     *
     * The belief repeats on purpose across two of them — "I am not taken
     * seriously" — because the recurring belief is a real rule with a threshold
     * of two, and a demo that never trips it does not show it.
     *
     * The feelings overlap for the same reason. One distinct set per session
     * gave twelve feelings each counted once, under a heading that reads
     * "feelings you chose most" — a ranking of nothing. `anxious` is in three,
     * `hurt` in two, and the rest are singletons, so the order on that screen
     * means something and the tail is short enough to read.
     */
    private const UPSETS = [
        [
            'days' => 8,
            'title' => 'Talked over in the planning meeting',
            'happened' => 'I was half-way through explaining the handover and Priya talked straight over me. Nobody said anything and we moved on.',
            'belief' => 'I am not taken seriously',
            'feelings' => [FeelingId::Angry, FeelingId::Humiliated, FeelingId::Anxious],
            'memory' => 'Being told to wait my turn at the dinner table and then never being asked.',
            'forgiveness' => 'She was trying to keep us to time. I can ask for the floor back without it being a fight.',
            'minutes' => 14,
            'rating' => CalmerRating::Yes,
            'completed' => true,
        ],
        [
            'days' => 12,
            'title' => 'My brother did not reply for a week',
            'happened' => 'I sent him a long message about Dad and got nothing back. I checked twice a day and said nothing about it.',
            'belief' => 'I am the only one who makes an effort',
            'feelings' => [FeelingId::Hurt, FeelingId::Lonely, FeelingId::Sad],
            'memory' => 'Waiting by the phone the summer he went away.',
            'forgiveness' => 'He is bad at messages and always has been. It is not a measure of what he thinks of me.',
            'minutes' => 17,
            'rating' => CalmerRating::ALittle,
            'completed' => true,
        ],
        [
            'days' => 17,
            'title' => 'Snapped at the delivery driver',
            'happened' => 'He was twenty minutes late and I was short with him, and then I felt wretched about it for the rest of the evening.',
            'belief' => 'I am becoming someone unkind',
            'feelings' => [FeelingId::Guilty, FeelingId::Ashamed, FeelingId::Anxious],
            'memory' => null,
            'forgiveness' => 'I was already at the end of a bad day. I can be sorry about it without deciding it is who I am.',
            'minutes' => 9,
            'rating' => CalmerRating::Yes,
            'completed' => true,
        ],
        [
            'days' => 21,
            'title' => 'Left off the invitation',
            'happened' => 'The whole team went for lunch and I found out from a photo. I do not think it was deliberate, which somehow made it worse.',
            'belief' => 'I am not taken seriously',
            'feelings' => [FeelingId::Rejected, FeelingId::Hurt],
            'memory' => 'Standing at the edge of the playground waiting to be picked.',
            'forgiveness' => null,
            'minutes' => 11,
            'rating' => CalmerRating::No,
            'completed' => false,
        ],
        [
            'days' => 26,
            'title' => 'Could not get started all morning',
            'happened' => 'I had one thing to do and I did everything else instead, and by lunchtime I was further behind and furious with myself.',
            'belief' => 'I waste my own time',
            'feelings' => [FeelingId::Overwhelmed, FeelingId::Anxious],
            'memory' => null,
            'forgiveness' => 'Being behind is a thing to fix in the afternoon, not a verdict on me.',
            'minutes' => 6,
            'rating' => CalmerRating::ALittle,
            'completed' => true,
        ],
    ];

    /**
     * Three more inside the console's last-seven-days window.
     *
     * The overview read 0 sessions, 0% at every step and 0% felt calmer,
     * because everything above is eight days or older and that screen's
     * figures are for the week. An empty dashboard is a poor answer to "how is
     * the protocol working", which is the question that screen exists for.
     *
     * These are all **quick** sessions, and that is the whole trick:
     * `SessionService` counts the weekly allowance with
     * `where('kind', SessionKind::Full)`, so a quick one inside the week costs
     * the demo user nothing and the home screen still reads 3 of 3. Under ten
     * minutes each, because `journal()` picks the kind from the duration.
     *
     * @var list<array<string, mixed>>
     */
    private const RECENT = [
        [
            'days' => 2,
            'title' => 'Short with my partner about the dishwasher',
            'happened' => 'It was not about the dishwasher. I had been holding something in all day and it came out at the nearest thing.',
            'belief' => 'I am not taken seriously',
            'feelings' => [FeelingId::Angry, FeelingId::Guilty],
            'memory' => null,
            'forgiveness' => 'I can say what it was actually about.',
            'minutes' => 7,
            'rating' => CalmerRating::Yes,
            'completed' => true,
        ],
        [
            'days' => 4,
            'title' => 'Dreading the review on Thursday',
            'happened' => 'Nothing has happened yet and I have already run the conversation twenty times.',
            'belief' => 'I will be found out',
            'feelings' => [FeelingId::Anxious, FeelingId::Afraid],
            'memory' => null,
            'forgiveness' => null,
            'minutes' => 5,
            'rating' => CalmerRating::ALittle,
            'completed' => false,
        ],
        [
            'days' => 6,
            'title' => 'Scrolled for an hour instead of sleeping',
            'happened' => 'I knew I was doing it while I was doing it, which is the annoying part.',
            'belief' => 'I waste my own time',
            'feelings' => [FeelingId::Anxious, FeelingId::Powerless],
            'memory' => null,
            'forgiveness' => 'Tired is a reason, not a character flaw.',
            'minutes' => 4,
            'rating' => CalmerRating::Yes,
            'completed' => true,
        ],
    ];

    /**
     * The coach's client, with his own three.
     *
     * Not a slice of `UPSETS`, which was the first attempt and could not show
     * the rule: the recurring belief is computed over the **shared** set only,
     * with a threshold of two, so the two he shares have to share a belief or
     * the coach's screen reads "—" for it. A belief said twice in private is
     * deliberately not a pattern a coach gets to see, and that is the rule this
     * demonstrates rather than works around.
     *
     * The third is private on purpose. The coach's other client,
     * `you@stillpoint.test`, shares nothing at all and so is a row of dashes —
     * which is also the right picture: the screen says "you only see sessions
     * your clients choose to share", and one client who has chosen not to is
     * what that sentence looks like.
     *
     * @var list<array<string, mixed>>
     */
    private const CLIENT_UPSETS = [
        [
            'days' => 5,
            'title' => 'Passed over for the lead again',
            'happened' => 'They gave it to someone who joined after me and told me it was about bandwidth.',
            'belief' => 'I am not good enough for the work I want',
            'feelings' => [FeelingId::Rejected, FeelingId::Unworthy],
            'memory' => 'Coming second in the trial and being told to try again next year.',
            'forgiveness' => 'There is a conversation to have about what bandwidth means.',
            'minutes' => 16,
            'rating' => CalmerRating::ALittle,
            'completed' => true,
        ],
        [
            'days' => 13,
            'title' => 'Froze in the stand-up',
            'happened' => 'I had the answer and could not get it out, and afterwards I could not stop going over it.',
            'belief' => 'I am not good enough for the work I want',
            'feelings' => [FeelingId::Ashamed, FeelingId::Anxious],
            'memory' => null,
            'forgiveness' => 'Nobody else remembers it. I can let it be a bad thirty seconds.',
            'minutes' => 12,
            'rating' => CalmerRating::Yes,
            'completed' => true,
        ],
        [
            'days' => 19,
            'title' => 'The argument with my landlord',
            'happened' => 'Kept private — this one is here so the coach has something he cannot see.',
            'belief' => 'Nobody will take my side',
            'feelings' => [FeelingId::Powerless, FeelingId::Angry],
            'memory' => null,
            'forgiveness' => null,
            'minutes' => 10,
            'rating' => CalmerRating::No,
            'completed' => false,
        ],
    ];

    public function run(): void
    {
        $user = User::query()->where('email', 'you@stillpoint.test')->first();
        $client = User::query()->where('email', 'client@stillpoint.test')->first();

        if ($user === null) {
            $this->command?->warn('No demo accounts — run DemoSeeder first.');

            return;
        }

        $this->clear($user);
        if ($client !== null) {
            $this->clear($client);
        }

        $this->journal($user, [...self::UPSETS, ...self::RECENT]);

        // The coach's client gets his own three, two of them shared, so the
        // portal shows a belief that comes back and a last session rather than
        // the row of em-dashes it showed. Sharing is the client's decision,
        // which is why the third is not.
        if ($client !== null) {
            $this->journal($client, self::CLIENT_UPSETS, shareFirst: 2);
        }

        $this->oneFlag($user);

        $this->command?->info(sprintf(
            '  %d journal entries for %s, %d for %s, and one open safety flag.',
            count(self::UPSETS) + count(self::RECENT),
            $user->email,
            $client === null ? 0 : 3,
            $client?->email ?? '—',
        ));
    }

    /** So running the demo twice is not a journal of duplicates. */
    private function clear(User $who): void
    {
        SafetyFlag::query()->where('user_id', $who->id)->delete();
        JournalEntry::query()->where('user_id', $who->id)->delete();
        GuidedSession::query()->where('user_id', $who->id)->delete();
    }

    /**
     * @param  list<array<string, mixed>>  $upsets
     */
    private function journal(User $who, array $upsets, int $shareFirst = 0): void
    {
        foreach ($upsets as $i => $upset) {
            /** @var int $days */
            $days = $upset['days'];
            $started = Carbon::now()->subDays($days)->setTime(20, 14);
            /** @var int $minutes */
            $minutes = $upset['minutes'];
            $last = $started->copy()->addMinutes($minutes);
            /** @var bool $completed */
            $completed = $upset['completed'];
            /** @var list<FeelingId> $feelings */
            $feelings = $upset['feelings'];

            $session = GuidedSession::query()->create([
                'user_id' => $who->id,
                'kind' => $minutes < 10 ? SessionKind::Quick : SessionKind::Full,
                'step_id' => null,
                // The high-water mark the console's reach chart reads. An
                // unfinished one stopped where it stopped.
                'furthest_step_id' => $completed ? StepId::Forgive : StepId::Remember,
                'guide_turns_used' => $completed ? 6 : 4,
                'end_reason' => $completed ? EndReason::Completed : EndReason::UserStopped,
                'safety_level' => SafetyLevel::None,
                'protocol_version' => '0.1',
                'data' => [
                    'title' => $upset['title'],
                    'whatHappened' => $upset['happened'],
                    'belief' => $upset['belief'],
                    'feelings' => array_map(fn (FeelingId $f) => $f->value, $feelings),
                    'memory' => $upset['memory'],
                    'forgiveness' => $upset['forgiveness'],
                    'calmerRating' => $upset['rating'] instanceof CalmerRating
                        ? $upset['rating']->value
                        : null,
                ],
                'started_at' => $started,
                'ended_at' => $last,
                'last_turn_at' => $last,
            ]);

            JournalEntry::query()->create([
                'user_id' => $who->id,
                'guided_session_id' => $session->id,
                'title' => $upset['title'],
                'what_happened' => $upset['happened'],
                'belief' => $upset['belief'],
                'forgiveness' => $upset['forgiveness'],
                'memory' => $upset['memory'],
                'feelings' => array_map(fn (FeelingId $f) => $f->value, $feelings),
                'kind' => $session->kind,
                'duration_minutes' => $minutes,
                'reached_final_step' => $completed,
                'calmer_rating' => $upset['rating'],
                'shared_with_coach' => $i < $shareFirst,
                'occurred_at' => $started,
            ]);
        }
    }

    /**
     * One open flag, so the queue shows a reviewer what a reviewer reads.
     *
     * `medium`, and the excerpt is about not coping rather than a statement of
     * intent — which is also the grading the screen gives that phrasing, so the
     * row is consistent with the rule it came from. A `high` one would have
     * ended its session, and seeding an invented crisis disclosure to make a
     * screenshot look dramatic is not a thing to put in anybody's database.
     *
     * Raised eleven days ago and still open on purpose: the queue shows each
     * flag's age and the overview shows the longest wait, and neither can show
     * anything from a flag raised a second ago.
     */
    private function oneFlag(User $who): void
    {
        $session = GuidedSession::query()
            ->where('user_id', $who->id)
            ->orderBy('started_at')
            ->first();

        SafetyFlag::query()->create([
            'user_id' => $who->id,
            'guided_session_id' => $session?->id,
            'level' => SafetyLevel::Medium,
            'category' => SafetyCategory::SelfHarm,
            'excerpt' => 'honestly some days I do not think I can keep going like this',
            // The wording `SessionService` writes for this case: a `medium`
            // match is flagged and the session carries on, which is the whole
            // reason hopelessness is not graded `high`.
            'outcome' => 'Flagged for review. Session continued.',
            'status' => 'open',
            'raised_at' => Carbon::now()->subDays(11)->setTime(23, 2),
        ]);
    }

    /** Never seeded into a test database. See the note at the top. */
    public static function isForDemosOnly(): bool
    {
        return true;
    }
}
