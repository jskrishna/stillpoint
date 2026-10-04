# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What Stillpoint is

A voice guide that walks someone through the six-step **Choose Again** process
when they are upset: Notice → Responsibility → Feel → Remember → Inquire →
Forgive. Not therapy, not medical advice; the user can stop at any time.

Five designed surfaces share one protocol: mobile app, desktop app, marketing
website, admin console, coach portal.

**Canada is the first market and India is the second.** That is newer than most
of this file and newer than the design artifacts, which were drawn India-first
(₹ pricing, Tele-MANAS and 112); where something below still reads as
India-only, Canada is what it should say. The parts that have been moved
already: the helplines (`CA` and `IN`, with `CA` the default for a new
account), French in the risk screen, the prices, the locale (`LOCALE`, `en-CA`),
and the consent screens' crisis numbers.

**That list is the dangerous kind of sentence** and has already been wrong
once: it said the helplines had been moved, and they had — in the domain, while
three call sites kept `helplinesFor('IN')` written in, so the consent screen
told a Canadian to call 112. A rule being right in one place is not the same as
nothing else having its own copy of the answer. Grep for the old market's
values before believing this paragraph.

Two consequences are worth having at the top, because they are both safety
ones. **A market is a set of crisis numbers**: pricing in a currency implies
users in that country, and `helplinesFor()` returning an empty list for them
means a pause screen with nothing to call. And **a market is a set of
languages**: French is an official language of Canada, and a Latin-script
language the screen has no phrases for does not report itself as unreadable —
it reports nothing found, with confidence.

The design artifacts — not this repo — are the source of truth for product
behaviour. Read them before changing domain rules; do not infer product
decisions from the code alone.

## Safety rules are not preferences

The marketing site promises that a session stops when a user may be in danger.
In `packages/protocol/src/session.ts`:

- a `crisis` signal ends the session (`endReason: 'safety_stop'`);
- an ended session is terminal — only the summary rating may still land;
- `safetyLevel` only rises.

Never weaken these to make a flow more convenient, and never add a resume path
around a safety stop. They have tests; a change that breaks them is a bug, not a
failing test to update.

Helplines resolve by country and cover **Canada and India**. `helplinesFor()`
returns an empty list for anywhere else — leave it that way rather than
substituting a plausible-looking number. A wrong crisis number is worse than
none.

Canada is 9-8-8 (the national suicide crisis line, call or text, bilingual),
Québec's 1-866-APPELLE, and 911. **Québec is listed separately on purpose**: it
answers through its own line rather than 988, and somebody in Montréal
dialling the wrong one of those is the failure this screen exists to prevent.
India is Tele-MANAS 14416 and 112.

**And a screen that prints a crisis number has to ask whose.** The consent
screen on both surfaces called `helplinesFor('IN')` with the country written
in, so after Canada became the first market it told a Canadian "If you are in
danger, call 112 or Tele-MANAS 14416" — before anybody started, on the screen
that exists to say it. Both screens were already fetching `api.me()` and
throwing `profile.country` away. They read it now, falling back to
`DEFAULT_COUNTRY` rather than a literal, so the two cannot disagree with the
column. The marketing site's landing page has no account to ask and uses
`DEFAULT_COUNTRY` for the same reason. `e2e/flow.mjs` and `e2e/mobile.mjs`
assert the gate names 9-8-8 and 911 and does **not** name another market's
numbers; both were checked by reverting the screens and rebuilding. Note what
this was: the list above says the helplines "have been moved already", and they
had been — in the domain. Three call sites had their own copy of the answer.

**The numbers are compared across both languages now**, which they were not.
`helplinesFor()` and `Helpline::forCountry()` each had their own tests and
nothing checked they said the same thing — of everything here that could
drift, the one where drift means somebody in crisis dialling a number that
does not answer where they are. It got sharper rather than quieter when the
session screen started reading the TypeScript list itself on a turn that never
reached the server: a divergence would show one person two different sets of
numbers in the same minute, depending on whether their request arrived.
`parity/cases.json` carries every country, every field and the order, and the
unknown ones as cases rather than an afterthought. Checked by giving Canada
112: exactly the `CA` case goes red.

`'ca'` is in that fixture on purpose. Neither language lowercases, so a
country stored in the wrong case gets the empty list that is the right answer
for a country we do not serve — and a Canadian would be looking at a pause
screen with nothing on it. **Nothing writes `users.country` today**: no route
accepts one, the profile update whitelists three unrelated fields, and the
column default is the only value it ever has. The day a route does accept a
country it has to validate against `COUNTRIES` / `isCountryCode()`, and the
reason is that paragraph rather than tidiness.

`users.country` defaults to `CA`. It covered India only until Canada became the
first market — so a Canadian who said they were not safe had their session
stopped, saw the pause screen, and had nothing to call on it. The test that
pinned that behaviour used Canada as its example of a country we correctly know
nothing about, which is worth remembering the next time a market changes.
Adding a country means adding its numbers **and** checking what else assumed
the old one: the language the screen reads, the currency, the locale, and the
privacy law the consent screen names.

## The risk screen is a backstop, not the detector

`packages/protocol/src/risk.ts` is a small phrase screen. It exists so the
obvious cases cannot be missed while a real classifier is chosen and reviewed.
It cannot read tone, context, metaphor or irony.

**It knows English, French, Hinglish and Hindi, and it is thin in all four.**
It used to know English only, and that was worse than it sounded: `normalise()`
dropped every character outside `[a-z' ]`, so an utterance in Devanagari did not
go unmatched — it became an empty string and returned `none` before a rule ran.
Somebody typing "मुझे मरना है" got nothing at all.

**French was the same failure with the sharper edge, and it survived longer.**
French is Latin script, so `normalise()` did not empty the string — it deleted
only the accents, leaving "je suis fatigué" as "je suis fatigu", found no
phrase, and returned `none` with `unreadable: false`. A plain statement of
intent in an official language of the first market got a _confident_ clean
answer, which is worse than the Devanagari case where the screen at least now
admits it could not read. `normalise()` folds Latin diacritics (NFD, drop
U+0300–U+036F, NFC) in both languages, so "fatigué" and "fatigue" are one
phrase — which also means a keyboard without French accents still matches. The
fold leaves Devanagari alone: its vowel signs are U+0900–U+097F, and the
recompose puts back the few characters that decompose at all.

The normaliser keeps Devanagari now, and the Hinglish and Hindi phrases are
graded by the same rule as the English ones: only a statement of intent or of
an act is `high`, hopelessness stays `medium`. Matching literal substrings in
Devanagari is brittle — "हूँ" and "हूं" are one word and two strings — and
Hinglish has no settled spelling, so the common variants are all listed because
a missed spelling is a missed disclosure. India has many more languages than
two. None of this makes the screen adequate; it makes the most unambiguous
phrasings visible, and it is the clearest argument for the classifier being
multilingual rather than English translated.

**Never describe it as sufficient, and never let a clinical claim rest on it.**
Shipping needs a trained model and sign-off from someone qualified to judge it.
It is tuned for recall on purpose: a false flag costs a reviewer a minute, a
missed one costs something that cannot be undone. Grade an ambiguous phrase up.

It also now says when it could not read the text at all. `normalise()` keeps
Latin and Devanagari and deletes the rest, so an utterance in Bengali, Tamil,
Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi or Urdu became an empty
string and was graded `none` — the same answer as an ordinary bad day. So an
assessment carries `unreadable` / `$unreadable`, true when any letter was in a
script the screen has no phrases for.

Three things about it, all deliberate:

- **It is not a risk level.** Grading an unreadable utterance up would invent a
  signal out of an absence of evidence, and flagging every one would drown the
  queue and make the product unusable for whole languages.
- **A `high` match still stops the session** and can carry `unreadable: true`
  beside it. The screen read enough of that utterance to be sure, and not all
  of it. Nothing about being unreadable may suppress a stop; there is a test.
- **It describes the text, not the act**, so `false` is correct wherever no
  utterance reached the screen. A refused turn is not evidence about any
  language.

Adding a script to the readable list without adding phrases for it is the wrong
fix: it would make `unreadable` say no about text that still nobody reads.

**`unreadable` catches only one of the two gaps, and it is the less dangerous
one.** It is true when a letter is in a script the screen has no phrases for, so
Bengali or Tamil announces itself. A language written in **Latin** script that
the screen has no phrases for does not: it normalises cleanly, matches nothing,
and comes back `none` with `unreadable: false` — exactly what French got until
French was added. `quiero morirme` is "I want to kill myself" and this screen
reports nothing at all, with confidence. There is a test saying so, and it is
the thing the clinical review pack asks about most directly. Do not read a
`none` as evidence of safety in a language nobody has checked.

It is counted, in `guided_sessions.unreadable_turns`, and the console's
overview reports it. That is the whole intervention — a count, because a count
is what says whether the gap is worth closing and for whom, and because the
alternatives are both wrong. Nothing stores which script it was: that needs a
decision about whether a user's language is ours to keep, and knowing _whether_
this happens is enough to decide whether to ask.

Grading up has a ceiling, though: `high` ends the session, so hopelessness and
burdensomeness ("I can't go on", "I feel like a burden", "nothing matters any
more") are `medium` and `low`. They are flagged for a reviewer, not stopped on —
an upset person says them on an ordinary bad day often enough that stopping
would make the product unusable. Only a statement of intent or of an act is
`high`. Past tense is in the screen because people speak that way, and it trips
on reported speech ("a film about someone who wanted to die"); that false
positive is deliberate, and `parity/cases.json` says so beside the case.

## Safety is screened before the guide speaks

`takeTurn()` assesses risk first and, on a high-risk utterance, ends the session
**without consulting the guide at all**. A model answering someone who has just
said they are not safe is the exact failure this ordering prevents. There is a
test asserting the guide is never called; treat a change that breaks it as a
bug, not a failing test to update.

Nothing may come before that screen, and that includes a rate limit. The turns
route carries **no `throttle` middleware**: middleware refuses a request before
anything has looked at what it said, and the request it can refuse is someone
saying they are not safe — and then the helplines never appear. The budget is
`App\Support\GuideBudget`, resolved in the controller and passed into the turn
as `guideAvailable`, so a spent budget withholds **the guide** and nothing else.
The screen still runs, a flag is still raised, a stop still stops. Only the
guide is charged for: `TurnResult::guideConsulted()` is false for a stop and for
a refusal, so neither spends the budget.

### A lost request is not a safe one

`takeTurn()` screening before the guide speaks covers every turn the server
receives. The case it cannot cover is the turn it never receives: somebody
types that they are going to kill themselves, the POST dies in a tunnel, and
the screen showed `describe(e)` — "Could not reach Stillpoint. Check your
connection and try again." — and nothing else. A connection error, to a person
who had just said that. Section 3c of `flow.mjs` already establishes that a
dropped request on mobile data is the ordinary case rather than an edge one.

So **on a failed turn, and only on a failed turn**, the browser's copy of the
phrase screen is allowed to put a crisis number on the screen:
`unsentCrisis` in `apps/web/src/app/session/SessionFlow.tsx` and
`apps/mobile/src/app/session.tsx`, in the same words on both.

Four things about it, and the first is the one that matters:

- **It is not the stop and must never become it.** The session stays open, no
  flag is raised, nothing is recorded, and the answer stays in the box. The
  retry goes through the server, which stops, flags and queues. The rule that
  the browser screen is "a convenience for instant feedback, never the
  enforcement" is intact — this adds an offer on a path where the server has no
  opinion because it was never asked.
- **`high` only**, matching the level the server stops on, so it cannot appear
  on an ordinary bad day. Hopelessness stays `medium` here as everywhere.
- **Its silence means nothing.** The phrase screen misses whole languages —
  `quiero morirme` normalises cleanly and matches nothing — so an empty list
  here is not evidence of safety, exactly as a `none` from that screen is not.
- **One rendering of a phone number per surface**, extracted to `HelplineLink`
  / `HelplineButton`, because two renderings is two places for one of them to
  stop being a `tel:` link.

`flow.mjs` and `mobile.mjs` abort the turns route, assert the number appears
with the account's own country, assert the session is **not** treated as
stopped, and then let the retry through and assert the server does the real
thing. Both were checked by reverting the screens and rebuilding.

### A number on the screen is only an offer to whoever can see the screen

The session screen had **no live region at all** and moved focus nowhere, which
is worse than it sounds on the one screen in the product where a change of
state is the point. Measured in a real browser, not inferred: the error
paragraph carried no `role`, the `unsentCrisis` block carried none, and after
the server ended a session for safety `document.activeElement` was `<body>` —
the button that had been pressed was gone, the whole screen had been replaced by
the pause, and focus had fallen to the top of the document.

So somebody using a screen reader typed that they wanted to kill themselves,
the POST died in a tunnel, three phone numbers appeared, and they were told
**none of it**. Then the retry went through, the server stopped the session, the
screen became the pause, and they were told none of that either.

It was the odd one out rather than an oversight nobody had thought about:
seventeen web screens and six on the phone already mark their error as an
alert, and the session screen was the one that did not.

Four things, and the ordering of the last two is the part worth keeping:

- **The crisis block is `role="alert"` on the whole block**, not on the sentence
  alone, so the sentence and the numbers are announced together — the only
  useful order for them. Assertive is right here and almost nowhere else: a
  crisis number is the one thing on this screen that should interrupt.
- **The pause and the summary take focus** on their own heading, with
  `tabIndex={-1}` so it stays out of the tab order. Taking focus is what says
  the screen changed, and it reads the title out as it lands.
- **An advance moves focus to the new question**, and a live region on the
  question would have been the other way to do it and is worse: the guide
  speaks its question aloud in voice mode, so the text would be said twice.
  Focus says it once and leaves the next Tab on the answer box, which is where
  a keyboard user was going anyway.
- **Arriving is not a change.** The first question is skipped deliberately —
  the person came here, they were not moved — so focus is only taken when the
  screen swaps something out from under them.

On the phone the live regions are the same and the focus move is not:
`setAccessibilityFocus` needs a host node and differs per platform, so the
pause calls `AccessibilityInfo.announceForAccessibility`. `e2e/mobile.mjs`
checks the live region, which React Native for web renders as `aria-live`.
**It cannot check the announcement**, because there is no screen reader here —
that is on `apps/mobile/README.md`'s list beside the `tel:` links, on the same
screen.

What the two checks assert is the ARIA and the focus, which is what is
assertable without a screen reader: the mechanics that decide whether anything
is announced, rather than the announcement. All five assertions were checked by
reverting the screens and rebuilding.

`e2e/a11y.mjs` runs axe-core over every route and would not have caught any of
this. Nothing here is a rule violation — a page with no live region is a valid
page. It is only wrong once you ask what this particular screen is for.

And the failure sentence changed with it. `describe()` returned "Something went
wrong. Please try again.", which tells somebody nothing they can act on, while
the comment at the top of that very file quoted the right wording and
`apps/mobile/src/describe.ts` already said it: "Could not reach Stillpoint.
Check your connection and try again." Two surfaces disagreeing about one
failure is the one thing that file's own note promises they do not.

### A lost response is not a lost turn

A turn names the step it answers (`step` in the request body,
`session.step?.id` on the client, `answering` in both domains). A client whose
POST succeeded but whose reply was dropped sends the same words again, and
without that field the second request is indistinguishable from a new turn: the
words are recorded against the **next** step, whose real question is then never
answered by anybody. Reproduced before it was fixed; on mobile data it is not
an edge case.

`answering` is read in the same place as `guideAvailable` — **after** the
screen, never before it — and for the same reason. So a stale answer still
raises its flag and a stale answer disclosing a crisis still stops the session
and still shows the helplines. Only an ordinary turn is refused, with a 409, and
the client asks the server where the session actually is.

It is therefore **not validated**. A rule on `step` would be a refusal in front
of the screen, exactly like a rate limit: the controller reads the field with
`StepId::tryFrom()` and treats anything it does not recognise — a typo, an
array, nothing at all — as the caller not having said, which is safe. What that
loses is catching a client's typo; what validating it would lose is someone
saying they are not safe. The client's third argument is required rather than
optional so no surface can quietly stop sending it.

### Length is a storage bound, not a refusal

The turns route validates `utterance` as `required|string` and **no `max`**. It
used to be `max:5000`, which made length a refusal in front of the screen — the
same objection as a rate limit, and not a theoretical one: a 5,222-character
outpouring ending in "I want to kill myself" answered 422 and was never
screened. Five thousand characters is about 800 words, which somebody typing at
2am reaches, and the longest thing a person writes is quite often the one that
matters most.

What is bounded is what gets written down, after the screen has read all of it:
`recordable()` / `Utterance::recordable()`, at 20,000 characters — roughly 3,300
words, far past any answer to one question, so in practice nobody is trimmed.
The bound exists because the journal decrypts rows one at a time and "export my
data" reads all of them, not because anybody should say less.

It counts **characters, not bytes**, and whole ones. Bytes would keep a third as
much Hindi as English, and a naive slice would leave half a surrogate pair as
the last thing somebody wrote. `parity/cases.json` carries the number and two
worked examples under `limits`, because the two languages trimming at different
lengths would mean the journal and the safety queue disagreeing about what was
said.

### `text` is 65,535 bytes, and Devanagari costs three of them a character

Every column holding encrypted personal text is `mediumText`, not `text`, and
that is load-bearing rather than generous. MySQL's `TEXT` is 65,535 **bytes**;
Devanagari is three bytes a character in UTF-8, and Laravel's `encrypted` cast
roughly doubles what it stores on top of that. Measured: one full session
answered in Hindi, at the 5,000-character ceiling the API used to enforce,
encrypts to **90,400 bytes** of `guided_sessions.data` and does not fit, while
the same session in English fits twice over. It failed for the language the
product is for and for nobody else.

Nothing here caught it, because the suite and the development container run on
sqlite where `text` is unbounded. On MySQL in strict mode the write errors and
the turn 500s; with strict mode off it would truncate, and a truncated
ciphertext does not decrypt — the session's whole content would be unreadable
rather than short. `tests/Feature/EncryptedColumnsAreWideEnoughTest.php` asserts
what can be asserted off MySQL: that the widening migration covers every column
an `encrypted` cast writes to, and the arithmetic that made `text` too small.

**A new `encrypted` cast needs a column wide enough for it**, and that test is
what says so.

### The guide asks the next question itself

`TurnResult.say` is what the guide says back, and on a turn that advances it is
**the new step's question**, through `openingLine()` rather than read off the
version. It used to be `reply.say`, which `ScriptedGuide` leaves empty when it
advances — acknowledgement copy is not in the designs and inventing it would be
inventing the guide's voice — so the guide fell silent after the first answer
and stayed silent for the rest of the session, on every surface. Five steps
where the client got an empty `say` and rendered "this step has no question
yet", whether or not the step had copy.

Three of the four reads already did this and one did not, which is how it
survived: `POST /sessions` and `GET /sessions/current` both pass the opening
line, `GET /sessions/{id}` passed nothing (so recovering from a 409 left the
screen blank) and the turn passed `''`. All four carry it now.

`flow.mjs` asserts a question at every one of the six steps and that they
differ. It did not before — it walked all six and only read the step counter,
which is exactly why five blank questions went unnoticed.

### The guide is a stand-in, and so is what it records

`scriptedGuide` / `ScriptedGuide` decide what to say by reading the protocol and
nothing else. What they _record_ is `literalExtraction` (TS) /
`LiteralExtraction` (PHP): the answer taken at face value — whatever was said at
a step is what that step was asking for. Both are stand-ins for a model, both
exist in both languages, and the parity fixture covers them.

Step 3 is not answered in prose. The designs give it a grid of the twelve
feelings and "Choose up to 3", so `answerKindOf('feel')` is `'feelings'` and the
client posts feeling **ids**, not labels. The guide's word-count heuristic is
only applied to prose: judging a selection by its length stalled step 3 for
anyone who did not happen to pick exactly three feelings. Answer kind belongs to
the step _id_, not to a protocol version — staff editing prompts in the admin
console must not be able to turn a selection into a sentence.

## Two requests at once

Every method in `SessionService` that changes a session re-reads its row
**inside** its transaction with `lockForUpdate()`, and works on that row rather
than on the one route-model binding resolved. `start()` locks the _user_ row,
because there is no session yet to lock and two concurrent starts would
otherwise both find nothing open.

This is not tidiness. The pair that matters is a safety stop and an ordinary
turn arriving together: the stop writes an ended session, and the turn — holding
the state from before it — writes over the parts `storeDomain()` always writes.
`end_reason` happens to survive, because Eloquent only writes attributes it sees
as dirty and on a stale model that one reads null-to-null. Nothing else does:
the row comes back ended, at step 2, with `safety_level` written back _down_ —
past an invariant the domain states plainly and the reducer enforces, because
the reducer was handed a snapshot of a moment that had passed.

`takeTurn()` therefore asks again under the lock and throws
`SessionAlreadyEnded`, which the controller answers as 409. The controller's own
check before the transaction is the fast path; the one under the lock is the one
that is true. `stop()` deliberately does _not_ refuse — stopping something
already stopped is what the user asked for either way — but it must not
relabel a safety stop, and the domain leaves an ended session alone.

`journal_entries.guided_session_id` is **unique**, so "one row per session" is
the database's rule rather than a check with a gap after it.

**`lockForUpdate()` does nothing on sqlite**, which the tests and the
development container run on. The lock is real on MySQL. What
`tests/Feature/ConcurrentTurnTest.php` can assert is the logic the lock
protects — it holds a model from before an end, which is exactly what a second
request would be holding, and insists that acting on it is refused. Removing
either the lock or the guard turns it red; both were checked.

The `e2e` job runs against a MySQL service for this reason among others, so the
lock itself is exercised somewhere by a real browser against a real server; see
`e2e/README.md`.

## One session at a time, and it survives the tab closing

`GET /sessions/current` is the first thing a client asks. Closing a tab used to
lose a session for good: it stayed open on the server, nothing could ever reach
it again, and on a free plan it had already spent one of three full sessions for
the week.

`POST /sessions` **ends whatever was open**, as `user_stopped`, because a person
is in one session at a time — it is a voice guide, not a set of tabs, and two
open sessions would both offer to be resumed with no way to tell which one an
answer was going into. It is not silent: the home screen offers to carry on
first, and says what starting fresh costs.

**Unless nothing has been said into it.** `Session::isUntouched()` /
`isUntouched()` is true for a session exactly as `start()` made it: step 1, no
guide turn spent, nothing gathered, no safety signal. Starting hands one of
those back instead of ending it and making another, because there is nothing to
carry on from — so it is the same session the caller asked for, and it costs
nothing.

That is a real cost rather than tidiness. Measured against the running API
before it was fixed: three identical `POST /sessions` took a free user from
three full sessions left to none, and the fourth told them they had used three
when they had had none of them. A reply dropped on the way back or a double tap
was enough.

A session is touched by anything at all — a thin answer spends a guide turn, an
accepted one moves the step, and a safety signal of any level rules it out, so
a session that raised a flag or stopped for safety is never handed back. The
kind has to match too: a full session that was started has already been
counted, and handing it back in place of the quick one somebody asked for would
give them something they did not ask for and could not undo.

`SessionResource` carries `untouched`, and both home screens show the ordinary
"Start talking" branch for one — no offer to carry on, and no warning about a
cost that is not real. **A screen must not work this out from `data`**: a thin
answer leaves `data` empty but has spent a guide turn, so a screen doing its own
arithmetic would call a used session empty and then charge the user for a
session it had told them was free.

A resumed session is the same session, so it spends no second allowance. An
ended one is never offered — including a safety stop, because there is never a
resume path around one.

The session screen shows a short recap of what the session already holds when
there is no local echo of a turn, built from what the server sent: a resumed
session has no history in the browser, and carrying on with no sign of what you
had already said was disorienting.

**And how long a session lasted is start to the last thing said into it**, not
to when it ended — `GuidedSession::activeMinutes()`, which the journal stores
and the console reads, one method because two would disagree about one session.
Ending is not something the person is necessarily present for: `POST /sessions`
ends whatever was open, so somebody who answered two questions on Monday and
came back on Friday had Monday's session journalled on Friday. Measured before
the fix: **5,760 minutes**, shown back to them in their own journal as "5760
min", on a product whose home screen says a session takes about 10 to 15
minutes.

Start to last turn still counts a pause between two answers, and that is
deliberate: excluding only the gaps that do not look like attention needs a
threshold for what does, which is a product decision rather than a column.
What it removes is the dead stretch between somebody's last word and whenever
the session got closed, which is where the absurd numbers came from. A session
nothing was said into has no last turn and reports the journal's floor of one
minute.

## A plan's allowance is a promise too

The pricing page says Free gets "3 full sessions a week" and "Unlimited quick
sessions". A promise the server does not keep is the same problem whichever way
it points, so it is enforced: `packages/protocol/src/plans.ts` and
`App\Domain\Plan`, with parity cases over every plan and count.

**A quick session is always allowed.** That is the point of the rule rather than
an exception to it — the limit exists to price the long session, and someone who
is upset should never be told to come back next week. A refused start answers
402 and says so, and the screen offers the quick session rather than being a
dead end.

The count comes from `guided_sessions.started_at`, not from journal rows, so a
session that stopped for safety — which never gets a row — still counts. It was
a full session; the allowance is about starting one, not finishing it.

Two things the designs state and this deliberately does **not** enforce:

- **"Up to 25 clients"** on the Coach plan. What a coach on some _other_ plan is
  allowed is not stated anywhere, so capping them would be a product decision
  made by a guess.
- **What a quick session actually is.** It runs the same six steps, because
  nothing says otherwise. The designs show quick sessions as shorter and label
  them in the journal, but not which steps are skipped — that is the PRD's to
  say, like the step copy.

## Do not invent product copy

The designs specify step 1's question, step 4 in full and step 5's question.
Everything else — steps 2, 3 and 6, and every step's completion criterion and
turn limit but step 4's — is `null` in `BASELINE` /
`ProtocolVersion::baseline()`, and `incompleteSteps()` reports it. **Do not fill
those in, in code.** A `null` there is an honest statement about the artifacts;
a guess in `steps.ts` silently becomes the product's voice and nobody can tell
afterwards which lines came from the designs.

**But `null` is not shippable either, and pretending otherwise was its own
mistake.** `ScriptedGuide` asks `main ?? ''`, so three of the six steps said
nothing at all — and the session screen's honest "this step has no question
yet" made that look like a documented gap rather than a product that stops
talking to someone who is upset.

So the copy lives where copy belongs: a **draft protocol version**, written by
`stillpoint:draft-step-copy`, which an admin reads at `/admin/protocol`, edits
and publishes. `publishProblems()` refuses anything still incomplete, so
publishing is a deliberate act by a person. The command fills only what is
empty and never touches copy somebody wrote; `DemoSeeder` publishes it so a
demo and the end-to-end checks have a guide that speaks, and production
publishes nothing by itself.

**That copy was written by Claude, not by a clinician and not from a PRD.** It
follows the voice of the three questions the designs do give and each step's
own summary from the marketing site, and it is rows in a table with an editor
in front of them precisely so the person who owns the product's voice can
replace it. Do not treat it as settled, and do not copy it into `steps.ts`.

Pricing is **set** now, and the rule above is why it took a market decision to
set it: the designs show `[PRICE]/mo` placeholders, so the figures could not
come from them. They are in `apps/web/src/app/plans.ts`, in CAD, with the
comparison that produced them written beside them. `priceLabel()` still returns
`[PRICE]/mo` for a `null`, because that is still the right answer for a plan
nobody has priced.

**A price is still not a way to pay, and a plan is now a grant.** There is no
billing at all — no provider, no checkout, no subscription — so nobody can
_buy_ anything, and that is in `DECISIONS.md`. But Plus and Coach are no longer
states nobody can reach: `PATCH /admin/users/{id}/plan` grants one from the
console, which is how a pilot account or a coach gets set up by hand. It is
deliberately not folded into the role route — that method carries the rules
guarding the safety queue, and a plan has nothing to do with them — and it is
guarded by the same argument one step down: **nobody sets their own plan**,
because an unlimited allowance one person can give themselves is a benefit
nobody else agreed to. Recorded in `plan_changes`, a separate trail from
`role_changes` because granting the ability to read somebody's crisis words and
granting an allowance are different decisions described by different columns.
`changed_by` is nullable for the change nobody makes by hand; nothing writes
one, and that is the field billing would use.

`plan` is no longer in `User`'s `#[Fillable]`, for the reason `role` never was.
Note what that is and is not worth: both routes that take a body from the
person it is about build their own array from validated fields, so naming a
plan was already ignored — checked by putting it back and watching the test
stay green. It is a second line for the next route that reaches for `fill()`,
and `GrantingAPlanTest` asserts the list itself because no request can tell the
difference today. The one place that writes the column assigns it directly.

And the locale is **one constant**, `LOCALE` in `packages/protocol/src/display.ts`,
exported and imported by the surfaces. It was `en-IN` written out in eleven
places, so changing market meant finding all eleven — which is the drift that
package exists to prevent, happening inside it. The guide's speech locale is
deliberately **separate** (`GUIDE_STYLE.lang` on web, `GUIDE_STYLE.language` on
the phone): the same string today, but Canada has two official languages, so a
French-speaking user is a reason for that one to become `fr-CA` while dates stay
as they are.

## The fonts are ours, not Google's

`apps/web` serves Newsreader and Hanken Grotesk from `public/fonts`, not from
Google's CDN. Linking the CDN meant every visitor's IP and user-agent reached a
third party on every page of a product about being upset — the session screen
included — which is not a thing to leave in place in a product that has to
answer for its own microphone under PIPEDA and Québec's Law 25. The phone app has always bundled its fonts; this
is the web matching it.

`apps/web/scripts/fetch-fonts.mjs` regenerates them and is run by hand, not by
the build: `next/font/google` would self-host too, but it downloads at build
time, and a build that needs fonts.googleapis.com can fail for a reason nothing
here controls. The files are variable faces, latin and latin-ext only — neither
family carries Devanagari — and the stylesheet keeps Google's own
`unicode-range` rules, so a browser fetches a face only when a glyph on the page
needs one. Both are OFL and the licences sit beside them.

There is a check worth keeping: load a few routes with a real browser and assert
that **no external origin is requested at all**. That was how this was found.

## Contrast is tested, not assumed

`packages/design-tokens/src/contrast.test.ts` asserts WCAG AA for every text
role against every surface, in both palettes. A colour change that drops a pair
below 4.5:1 fails the build.

Three of the designs' colours did not meet AA and the tokens deliberately differ
(`muted`, `accent`, plus a new `accentText` and `dangerInk`) — the README has
the table. **Use `accentText` when the accent is small text and `accent` when it
is a fill**; they are not interchangeable, which is the whole reason both exist.

Re-run the audit after UI work: `node e2e/a11y.mjs`, with the app built and both
servers up (see `e2e/README.md`). It covers every route in both palettes at 390
and 1440 — 76 combinations across 19 routes — and the last run was clean across
all of them. It
signs in as each role and resolves the client and invitation routes from real
rows rather than hard-coding an id.

## Stack

- TypeScript 6.0.x, ESM only (`"type": "module"`)
- Node >= 22 (`.nvmrc`), pnpm 10 workspace (`pnpm-workspace.yaml`)
- Vitest, ESLint flat config (type-aware), Prettier

TypeScript is pinned to the 6.0 line because `typescript-eslint` 8.x declares a
`typescript@>=4.8.4 <6.1.0` peer range. **Do not bump to 7.x** until
`typescript-eslint` supports it, or type-aware linting breaks.

## Layout

```
apps/api/                 Laravel 13 + MySQL — the backend, and the authority on the protocol
packages/protocol/        @stillpoint/protocol — the same domain in TypeScript (see below)
packages/design-tokens/   @stillpoint/design-tokens — Warm & Clear colour, type, space
packages/client/          @stillpoint/client — the typed API client, one per surface
apps/web/                 @stillpoint/web — Next.js: marketing site and web app
apps/mobile/              @stillpoint/mobile — Expo: the iOS and Android app
apps/desktop/             @stillpoint/desktop — Electron: a shell around the web app
parity/                   cases.json: the cross-language fixture both suites assert
                          against; refusals.json: how a refusal is worded, across both surfaces
e2e/                      a by-hand browser check of web against a running API
```

### The phone is a real surface, and it is not verified on a phone

`apps/mobile` is Expo (SDK 57) with expo-router, consuming all three packages.
It has the welcome and consent flow, the six-step session, the journal and an
entry, what the app has noticed, and settings. Its own README has the detail.

**What can be verified here is verified, and the rest is named.**
`expo export --platform web` is a real build — every module bundled, all
routes statically rendered — and it runs in the container alongside
`typecheck`. What has never run is the app on a phone: there is no simulator
here and no device on CI. The keychain, text-to-speech, `tel:` links on the
safety screen, the splash screen and safe-area insets on a notched device are
all unproven. Do not describe this app as tested on a device, and do not let a
green export stand in for that.

Two decisions in it are worth keeping:

- **The tab bar has labels and no icons.** The design set does not assign the
  tabs any iconography, and drawing four glyphs would be inventing product
  visuals the same way inventing step copy would be inventing the guide's
  voice.
- **The voice seam is the same shape as the web's** (`src/voice.ts` against
  `apps/web/src/lib/voice`), with `expo-speech` as the stand-in. Listening is
  still not built on either surface, and both say so in the same words rather
  than pretending. When the voice vendor is chosen, these two files are what
  gets replaced — and at that point the seam itself is worth moving into a
  package.

### The desktop app is a shell, and must stay one

`apps/desktop` is Electron around the web app's standalone build — the same
build the browser gets, in a window. Nothing about the product is implemented
there: no session screen, no safety rule, no API client. That is why the
designs call for Next.js on both, and it is the only reason a fifth surface
does not mean a fifth place for a crisis-stop rule to drift.

What it adds is what a window can do and a tab cannot: a remembered size and
position, a tray, a global shortcut
(<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) straight into a session,
and a menu that goes to the app's own screens. If a feature needs a screen, it
belongs in `apps/web` and the desktop app gets it for free.

The renderer is sandboxed with no Node and no preload, and navigation is pinned
to the app's own origin: the page in that window is signed in to somebody's
journal. The bundled server binds to `127.0.0.1` on the fixed port below.

**The pin was a string prefix, which is not an origin.** `src/navigation.ts`
holds it now and `src/navigation.test.ts` pins it. `url.startsWith(origin)`
with the origin `http://127.0.0.1:8735` allowed
`http://127.0.0.1:8735@evil.example/phish` — everything before an `@` is
userinfo, so that string starts with this app's own origin and resolves to
`evil.example`. Measured, not inferred. It would have navigated the window that
is signed in to somebody's journal, inside this app's frame, which is the one
thing the pin exists to prevent. A longer port (`:87351`) and a longer host
(`:8735.evil.example`) passed it too; those two do not parse as URLs, so
Chromium would most likely have refused them on its own — and "most likely" is
not the argument this guard is for.

**And `shell.openExternal` took whatever it was handed.** The renderer is
sandboxed, but the policy keeps `'unsafe-inline'` and `next.config.ts` is plain
that injected inline script still runs, so a payload could `window.open` a
`file:` URL or any scheme another application has registered and the main
process passed it to the OS. Four schemes go through now — `http:`, `https:`,
`mailto:`, `tel:` — and `tel:` is in that list because the safety screen's
helplines are `tel:` links and the system is what opens the dialler.

Both live in their own module rather than inline in `main.ts` because `main.ts`
imports `electron`, which does not resolve outside an Electron process, and
these two decisions are the part worth asserting. That module's tests are the
one app's tests `tsconfig.test.json` includes, and the reason is written there:
`apps/desktop/tsconfig.json` has to **exclude** tests because it emits to
`dist/` and a compiled test importing `vitest` has no business in a packaged
Electron app — excluded there and listed nowhere, the file belongs to no
project and ESLint refuses to parse it.

**The port is fixed (8735) on purpose, and it is the app's identity.** Asking
the operating system for a free port is the obvious thing and it is wrong here:
the port is part of the origin, the origin is what the browser keys storage by,
and the web app keeps its bearer token in `localStorage`. A new port each launch
is an empty store each launch — the desktop app signs everybody out every time
it starts, and nothing in the logs says why. If the port is taken the app says
so and stops, because moving to another one is that bug with an extra step. The
API's `CORS_ALLOWED_ORIGINS` carries that one origin.

**The app surface has no desktop layout.** `apps/web`'s `/app` caps its content
column at 430px with navigation along the bottom — the phone design, which is
the only one the artifacts give for those screens. So the window opens narrow:
that is the designed layout at its designed width, not a desktop one. The
console, the coach portal and the marketing site do have desktop layouts and
render as intended. A desktop layout for `/app` is a design decision, and it
belongs in `apps/web`; the shell will pick it up with no change.

It has been launched under Xvfb here, which proves the server starts, the app
renders and a session survives a relaunch. **It has never been packaged or run
on macOS or Windows**, and there is no installer, signing, notarisation or
auto-update — each of those costs a certificate or a server rather than a line
of config. Its README says so; do not let `pnpm run build` passing stand in for
it.

`apps/web` therefore has a second build: `pnpm --filter @stillpoint/web run
build:standalone`, which sets `NEXT_OUTPUT=standalone` and so turns on
`output: 'standalone'` with `outputFileTracingRoot` at the workspace root. Both
of those are load-bearing for the desktop app and for the Docker image, and
neither is visible from `apps/web` itself — the comment in `next.config.ts` is
the only warning anyone gets.

It is opt-in, and writes `.next-standalone` rather than `.next`, for two
reasons that are easy to rediscover the hard way. `next start` is **not
supported** alongside `output: 'standalone'` and Next says so at every boot —
and `next start` is what local development, the README and the end-to-end job
all use, so leaving it on meant every one of those ran a combination the
framework warns against. And two builds of one app into one `.next` means
whichever ran last decides what `next start` finds, which a root
`pnpm run build` does by itself: web, then the desktop shell.

### Display state lives in the protocol package

`packages/protocol/src/display.ts` holds `relativeDay`, `duration`, `greeting`
and `partOfDay` — the pure formatting both clients need. It is not the
presentation the package forbids: no colours, no copy of the guide's, no
framework. It is there so the web and the phone cannot end up disagreeing about
what "Yesterday" means, and the locale stays in one place — `LOCALE`, which is
`en-CA` now that Canada is the first market — because a weekday in the device's
locale would be the one thing on the screen in another language. This paragraph
said `en-IN` for a while after the constant did not, which is the drift the
constant exists to prevent happening in the file that describes it.

### One API client, not one per surface

`packages/client` holds every path, field name and paging rule the API answers
with. The web app, a phone and a desktop shell all consume it, because three
hand-written clients would be three sets of field names drifting apart — the
same failure the TypeScript and PHP protocols have a parity check to prevent,
and with the same cost: the surface that drifts is the one that stops showing
someone their helpline.

It is the one package that _is_ allowed I/O — that is what it is for. It is
still not allowed presentation: no colours, no copy, no framework imports.
What a surface supplies is the two things that genuinely differ, both as
arguments to `createClient()`:

- `baseUrl`, because an app bundle cannot read `NEXT_PUBLIC_*`;
- `tokens`, a `TokenStore`, because a browser has `localStorage` and a phone
  should use the keychain.

`TokenStore` is **synchronous on purpose**, and the reasoning is in
`tokens.ts`: every keychain API is asynchronous, but making the interface
asynchronous would make `hasToken()` a promise, and that is the one thing a
screen needs an answer to before it can decide between rendering and
redirecting. So the asynchronous medium gets wrapped (`cachedTokens`) instead
of the interface widened. Do not widen it.

`apps/web/src/lib/api.ts` is what a surface binding should look like: the base
URL, a `localStorage` store, and a re-export of everything so no screen has to
know which package a type came from.

**A refusal's wording is the server's.** `describe()` turns an `ApiError` into
a sentence, and the rule is that the API's own message wins — a generic line is
a fallback for when the framework answered instead of the application. A 429 is
where that matters: Laravel's throttle middleware answers the sign-in routes
with a bare "Too Many Requests", which is not something to show a person, but
the guide's budget running out mid-session is the API's own "That was a lot of
answers very quickly." Replacing both with "Too many attempts" told somebody
upset, part-way through being asked questions, that they had made too many
attempts at something.

**That rule lived on the phone and the web did not have it.** The file said
"Word for word the web app's", and across the two surfaces there were **three
separate local `describe()` functions** — one of them the phone's own session
screen, which did not use the phone's own rule — **six inline reimplementations
of part of it** (the field-error preference written out four times, the 429
branch once, an `e.message !== ''` guard twice) and **twenty places that
implemented none of it** and answered every failure with "Check your
connection." — about a request that had arrived perfectly well.

The sharpest was the protocol editor: `main` is capped at 500 characters,
and an admin pasting a longer step prompt — doing the one thing `LAUNCH.md`
item 4 asks them to do the hour a deployment is up — was told their network was
bad and lost the edit, while the API had answered "The main field must not be
greater than 500 characters." Measured against the running API, not inferred.

**And `e.message` can be empty, which is worse than wrong.** A bare
`abort(404)` — how `EnsureStaff` hides the console and `authorizePairing()`
hides whose clients are whose — sends `{"message": ""}`, so returning it handed
a screen an **empty string** as the explanation: a coach whose client ended the
pairing mid-note got a blank line where the reason should be. One call site had
noticed and worked around it locally with `e.message !== ''`, which is the shape
of a rule that needs to be in one place. An answer with no words gets
"Stillpoint would not do that. Reload to see where things stand." —
deliberately not the connection sentence, because the connection was fine and
the server declined to say why, which is itself the rule.

So the function is now **one function in both surfaces**,
`apps/web/src/lib/describe.ts` and `apps/mobile/src/describe.ts`, and every
screen on both goes through it. It is **not** in `packages/client`: that package
is allowed I/O and not copy, and a sentence shown to a person is the surface's.

`parity/refusals.json` is a checked-in table of refusals and the sentence each
gets, and `apps/web/src/lib/describe.test.ts` asserts every case **and** that
the phone's copy is byte-for-byte the same file. Both halves are needed: a
tested function with a drifted twin is exactly the situation this replaced, and
a promise in a comment is not a promise. The test lives on the web side because
`apps/mobile`'s tsconfig is Expo's and has no `node` types to read a file with.

Four wordings are deliberately **not** routed through it, and the distinction is
the one from "A screen must not report an absence it only failed to read": these
are statements about an absence, not refusals. The role and plan trails'
"Could not read…", the home screen's "Could not check whether you left a
session open", the invite screen's 404-and-410-only branching, and the static
"Could not load your journal" lines, which have no error object to describe.

### The backend is Laravel, and it owns the rules

`apps/api/app/Domain` is the authority. The PHP there is a port of
`packages/protocol`, and the TypeScript tests were the specification for it.

**While both exist, they must agree.** Two implementations of a crisis-stop
rule is the worst outcome available: they drift, and the one that drifts
decides whether someone gets a helpline. The port keeps the same names, the
same orderings and the same tests, and there is a parity check comparing the
risk screen's output across both.

The TypeScript protocol package is on its way to being types plus client-side
display state. Until that is finished, **a rule changed in one must be changed
in the other, in the same commit**.

That is enforced, not just asked for. `parity/cases.json` is a checked-in table
of utterances and step answers with the expected risk grade and the expected
capture. Both suites assert against that one file —
`packages/protocol/src/parity.test.ts` and `apps/api/tests/Unit/ParityTest.php` —
so a rule that moves in one language and not the other turns one of the two red,
in whichever CI job runs first.

The TypeScript side generates the file, because its tests were the port's
specification: `pnpm run parity:generate`. It writes through Prettier **with
this repository's own config** — `format()` given only a `filepath` uses
Prettier's defaults, whose `printWidth` is 80 against this repository's 100.
That had never mattered because no section of the fixture happened to format
differently under the two, and then one did, and regenerating started leaving
the tree failing the gate that formatting step exists to pass. Run that only after deliberately
changing both languages. **Regenerating to turn a red parity test green records
the divergence instead of fixing it**, which is the whole failure the file
exists to prevent.

**The reducer's invariants are in the fixture now too.** CLAUDE.md calls three
of them not preferences — a crisis ends the session, an ended session is
terminal apart from the rating, `safetyLevel` only rises — and
`furthestStepId` is a fourth of the same kind. All four were in both languages
with their own tests in each and nothing comparing them. Twelve sequences of
events now are, and one case carries three of the invariants at once: a crisis,
then a step satisfied, a guide turn, a user stop and a `none` signal, all of
which must do nothing, and then a rating, which must land. Each was checked by
breaking it in the PHP: a crisis that no longer stops turns three cases red, a
`SafetyLevel::atLeast()` that lets the level fall turns one, and a
`furthestStepId` that follows `stepId` down turns one.

**The step order, how each step is answered, and consent are in there too.**
Those were the last rules living in both languages with nothing comparing
them. Step 3's answer kind is the one that bites: it is a grid of twelve
feelings and "choose up to 3", so the client posts ids, and a language that
thought it was prose would judge a selection by its word count and stall the
step for anybody who did not pick exactly three. Consent points both ways — a
client needing fewer items walks somebody into a 403 three screens later, and
one needing more blocks a person who has already agreed to everything the
server asks. Checked by making step 3 prose (one case red) and by making "I am
18 or older" optional (five red, including the item list itself).

**And the generator can write a confident lie, which is worse than a
divergence.** `parity/generate.mjs` is plain JavaScript, so nothing
type-checks the fixture's own spellings. Written with `level: 'crisis'` —
which reads correctly, and is how the prose above describes the rule — the
reducer found no such level, silently did nothing, and the generator wrote
three cases stating that a crisis signal does not end a session. Both suites
would then have agreed with that. A red parity test is a question; a fixture
generated from a typo is an answer nobody asked for. It was caught by reading
the output, which is not a method, so `toEvent()` throws on an unknown
operation, level or rating, and the PHP side throws on an operation it cannot
dispatch — a case nobody dispatched would otherwise pass in silence.

**A fixture with no case for a hazard does not cover it, however well the
hazard is written down.** `STEP_CASES` carried a note saying that a journal
title is cut to 60 and that JavaScript counts UTF-16 units where PHP's
`mb_substr` counts characters — and then pinned Devanagari, which agrees
because it is entirely in the BMP, while admitting in the same breath that this
"is a fact about the script rather than a guarantee either implementation
makes". The case that disagrees was never added, and the two languages did
disagree: an answer of 40 emoji became a 30-character title in TypeScript and a
40-character one in PHP, and the shorter one ended in half of a character,
which a journal renders as a replacement glyph. On a phone an emoji is not an
unusual thing to type.

**The same gap had been open on insights, and closing it needed the two
contracts to agree first.** `parity/cases.json` had no insights section at
all, so nothing compared a rule with a lot of surface: a feeling counted once
per session however often it was named, feelings ordered by count and then by
label, "felt calmer" counting an explicit `yes` and not a hedge, the
recurring-belief threshold of two, its tie-break by recency, the wording kept
being the most recent one, and the normaliser that makes a danda and a full
stop the same thing.

Writing the cases turned up the asymmetry that had made them awkward to write:
`insights()` in TypeScript always narrowed to the window itself, and
`Insights::from()` recorded `windowDays` as a label and trusted its caller.
`InsightsService` does scope, in SQL, so nothing was wrong — but the second
caller to forget would have had a window that lied, silently, and a fixture
case with an out-of-window entry could not exist while the two disagreed about
whose job it was. `Insights::from()` takes `$now` and narrows now, the SQL
`whereBetween` stays because it is what keeps the set small enough to reduce in
PHP, and the fixture has the case. Checked by taking the filter back out: the
two window cases go red, and nothing else does.

Both sides count characters now — `firstCharacters()` in
`packages/protocol/src/utterance.ts`, which `recordable()` also uses, against
`mb_substr` — and the fixture has the astral cases. Note what catching it looks
like: PHP fails on `json_decode` with "single unpaired UTF-16 surrogate",
because a divergent fixture is not valid UTF-8 rather than merely unequal. That
is loud but says nothing about titles, so recognise it.

Note `pnpm-workspace.yaml` lists `apps/web` and not `apps/*`: Laravel ships a
`package.json` for Vite scaffolding this API does not use, and globbing pulled
those dependencies in. `apps/api` is also excluded from Prettier and ESLint —
it has Pint and its own CI job.

`packages/protocol` must stay free of I/O **and of presentation**: no network,
no storage, no speech, no framework imports, no colours. Feeling ids and labels
are domain and live there; feeling colours are presentation and live in
`design-tokens`. Every surface depends on both, so anything environment-specific
belongs in the surface instead.

The design direction is **Warm & Clear** (cream `#FBF4EC`, terracotta accent
`#E4572E`, Newsreader + Hanken Grotesk), taken from the newest and only complete
artifact. The earlier "Dusk to Light" exploration is not current; do not mix its
palette in. Only its feeling colours survive, because nothing else assigns the
twelve feelings colours at all.

## Commands

```bash
# Web and packages
pnpm run check   # build:packages, then format:check + lint + typecheck + test
pnpm run build   # every workspace project, packages first

pnpm run verify:clean  # all of that from nothing built — before a push

# API (from apps/api)
./vendor/bin/phpunit     # the domain tests
./vendor/bin/pint --test # formatting, as CI runs it
```

`e2e/` holds six checks against a running API — `pnpm run e2e` runs all of
them, building what is missing, reseeding, starting the three servers and
tearing them down; `pnpm run e2e flow admin` runs a subset and `--no-build`
skips the builds and the reseed. See `e2e/README.md`. One of
them, `mobile.mjs`, is the only thing that executes `apps/mobile` at all: it
drives the Expo web export in a browser at a phone's width. It does not touch
anything native, and `apps/mobile/README.md` lists what that leaves.
`flow.mjs` is the web app's: register, consent, a full session, a reply lost on
the way back, journal, insights, settings, the safety stop and sign-out. It
needs three servers, so it is not part of `check` — but it **is** in CI, as the
`e2e` job, along with the other five. Run it by hand too after changing the
session flow, `packages/client` or anything in `apps/api/app/Domain`; it is
faster than waiting for a push.

Two of its sections are the ones that matter, and both show something only a
real browser against a real server can. The safety stop: it types crisis
language into the page and asserts the **server** ended the session, refuses
another turn on it (409), shows 9-8-8, Québec's line and 911 — Canada's, since
a new account is assumed to be in the first market — and wrote no journal row.
It also aborts the turn on the way out first, and asserts that an answer which
never reached the server still gets a crisis number without the session being
treated as stopped.
And section 3c: it lets a turn reach the server and then drops the response —
what a train tunnel does — and asserts the retry advanced exactly one step for
one answer, rather than being recorded as the next step's.

CI runs four jobs: the PHP suite, the JavaScript gates, the end-to-end checks,
and the Docker images. PHP here is 8.3; Laravel 13 needs ^8.3, and Pest 5 needs
8.4, so the API uses PHPUnit — which is what the skeleton ships anyway.

**There is no MySQL server in the development container**, and apt cannot
install one. The suite runs on in-memory sqlite, so locally the schema is only
verified against sqlite's grammar. CI closes that gap with a MySQL 8.4 service
that runs the migrations up and back down. If you change a migration, assume
sqlite passing proves nothing about MySQL until CI says so.

`check` builds the packages first on purpose: `apps/web` resolves
`@stillpoint/*` through `node_modules` to their built output, exactly as an
outside consumer would, so lint and typecheck need that output to exist. CI runs
the same steps in the same order.

**Verify on a clean tree before pushing: `pnpm run verify:clean`.** It deletes
`node_modules` and every build directory, reinstalls with `--frozen-lockfile`,
and runs the gates in CI's order plus the full `build`, Pint and PHPUnit.

It was six manual steps ending in a 1.3GB delete, and the paragraph that asked
for them said in the same breath that **a leftover `dist/` has twice made a
broken commit look green locally**. Twice is not bad luck — it is a ritual
people skip, which is the argument that produced `e2e/run.mjs` as well.

What it is for, precisely: `apps/web` resolves `@stillpoint/*` through
`node_modules` to their **built** output, so a package export that was deleted,
renamed or never emitted still resolves against the `dist/` from before the
change, and lint, typecheck and the web build all pass over a tree that would
not build on a fresh clone. `tsBuildInfoFile` points inside `dist/`, so
deleting `dist/` without its `.tsbuildinfo` makes `tsc --build` report success
and emit nothing — the other half of the same trap, and why it deletes whole
directories rather than being clever.

It is **not** part of `check` and must not become part of it: `check` is what
you run many times an hour, this is what you run before a push. `apps/api/vendor`
is left alone unless `--composer` is passed, and that asymmetry is deliberate:
PHP here has no build step, so nothing is emitted for a later change to
contradict and the failure this exists for has no PHP equivalent. It says at the
end what it does **not** cover — the end-to-end checks, and the MySQL migration
run only CI has a MySQL for.

## Running it somewhere

`docker-compose.yml` and `deploy/` bring the whole thing up: MySQL, PHP-FPM,
nginx, Laravel's scheduler, and the Next.js app. `deploy/README.md` is the
detail. Two things from it that matter wherever this is discussed:

**`APP_KEY` is the whole journal.** Every entry, every session's content and
every safety flag's excerpt is encrypted with it, there is no second copy, and
there is no recovery path — change it or lose it and that content is gone, not
locked out. This is also the reason password reset is safe to offer: the key is
not derived from anyone's password.

Rotating it is a migration, and `stillpoint:rotate-key` is it: old key into
`APP_PREVIOUS_KEYS`, new one into `APP_KEY`, run it, and only then drop the old
key. Its `--dry-run` reads every encrypted row and writes nothing, which makes
it the check for "can this deployment still read what it holds". Two rules in
there are not conveniences: a row that decrypts under no configured key is
**left byte-for-byte as it is**, because the ciphertext is the only copy and a
guess would turn a recoverable mistake into the other kind; and the command
refuses outright if a model declares an encrypted column its own list does not
cover, because that column would keep the old key and step two would then
destroy it. Add the column to `RotateEncryptionKey::COLUMNS` in the same commit
as the cast.

**`MAIL_MAILER=log` means nobody can reset a password.** No mail provider has
been chosen, so the reset link is written to the log instead of sent. It is the
one thing in the deployment that is deliberately unfinished, and it needs a
decision rather than a configuration change.

**And it is given the web origin, which is what makes it see CORS.** Plain
`fetch` with no `Origin` header is not a browser and is never subject to CORS
or to a content policy, so everything that script checks can pass against a
stack nobody can use. Measured: with `CORS_ALLOWED_ORIGINS` naming a different
deployment entirely, the API still answered 401, the web app still answered
200, and a whole session still ran. With the origin it checks the two things
fixed at build or boot — which API the web app was built to call (from the
`connect-src` in the served policy, which `next.config.ts` builds from the same
`NEXT_PUBLIC_API_URL` the client reads, so there is no bundle to parse) and
whether a preflight from that origin is allowed — and each failure names its
own fix. Both were checked by breaking them one at a time.

The CI `docker` job builds all three images, brings the stack up, and then runs
`deploy/smoke.mjs` against it — register, consent, a session, a turn, and a
crisis utterance that must stop the session and return helplines, through nginx
and PHP-FPM against the MySQL the compose file starts, then erasing the account
again. Building proves the images exist and starting proves they run; neither
was a session, and until that script ran nothing here proved the deployment
could serve one. It is plain HTTP, so it is also the check to run against a
real deployment from a laptop. Nothing has run against real traffic, nobody has
restored a backup, and TLS terminates somewhere that does not exist yet. A green
build means "this will start", not "this is ready".

`NEXT_PUBLIC_API_URL` is fixed when the web image is built, because the browser
is what calls the API. Pointing a built image at a different API is not
possible; rebuild it.

## Personal content is encrypted at rest

The session data, the journal's title, what happened, belief, forgiveness,
memory and note, and a safety flag's excerpt all use Laravel's `encrypted`
casts. This is the most personal text the product holds, and a flag's excerpt
is the single most sensitive column in the schema.

**And the log is not a second copy of it.** Encrypting a column and then
logging its value is not encryption at rest, and the leak that would do it is
one line: a `Log::error('turn failed', ['utterance' => $utterance])` added
while chasing something and never taken out. `NoPersonalTextInLogsTest` makes a
turn throw and asserts the utterance is nowhere in what got logged; it was
checked by adding exactly that line. It is **not** a check on stack traces —
PHP renders a string argument as `'...'` in `getTraceAsString()` however
`zend.exception_ignore_args` is set, and that is what Laravel's formatter uses.
`deploy/php.ini` pins that setting anyway, for anything that reads the
structured trace instead, which is how an error reporter would start carrying
those values.

Encrypted columns cannot be queried or indexed, which is deliberate and has a
cost: aggregates over beliefs (the "belief that comes back") are computed in PHP
over a user's own window, not with `GROUP BY`. Do not drop the encryption to
make a query easier.

A user can erase their own account, and it has to actually take everything:
`AccountDeletionService`. Most of the removal is the schema's — sessions,
journal, flags and pairings cascade from `users` — and what is in the service is
everything a foreign key does not reach, which is the pattern to check for
whenever a table is added:

- **Sanctum tokens**, which have no foreign key, so nothing would remove them.
- **The role-change trail**, which must outlive the account but must not keep
  its address.
- **Invitations sent _to_ the address.** `coach_invites.email` is a string and
  not a key, deliberately — a coach can invite an address with no account — so
  only the ones a coach _sent_ cascade. This used to be written down as
  "invitations cascade", and the row carrying the erased person's email stayed,
  on their coach's screen. Compared lowercased, because `CoachInvite::open()`
  stores it that way and sqlite's `=` is case-sensitive where MySQL's collation
  is not.
- **A pending password reset**, whose table is keyed by the address and has no
  foreign key either — a live reset token for an account that no longer exists.
  Removed through the broker, so the row is found by whatever key the broker
  writes.
- **Web session rows**, which carry `user_id`, an IP and a user-agent, and whose
  `user_id` is a plain indexed column with no `constrained()`. Nothing writes
  one today, because auth is bearer tokens; the sweep is there for the day
  cookie mode lands, which is the documented right answer for the web client.

Two tests cover the three, and both were checked by taking the fix out. It is guarded by the
account's own password and a typed confirmation, because it is not reversible
and should not be something a stray tap on an unlocked phone can do.

**Open question for someone qualified:** "Export everything" does not include
a safety flag's excerpt, and that excerpt is sometimes the only copy of what
somebody said. A safety-stopped session is never journalled, so the words from
the turn that stopped it live in `safety_flags.excerpt` and nowhere the person
can reach — the export is `account` plus the whole journal, and the journal has
no row for that session. The copy beneath the button says "Every session you
have finished", which a stopped one is not, so the sentence is accurate and the
button's own label is "Export everything".

Two defensible answers and they point opposite ways. A subject access request
under PIPEDA or DPDP plainly covers it, and it is their own sentence. And
handing somebody a file containing their own crisis disclosure, with no
context, unprompted, months later, is not obviously a kindness. Which is why
this is written down rather than implemented: it is the same kind of decision
as whether an anonymised flag should outlive an erasure, and it belongs to
whoever owns safeguarding rather than to whoever is reading this file.

**Open question for someone qualified:** a safety flag is deleted with the
account, because that is what erasure means and it is what the schema already
did. But it also means that if a person said they were in danger and then
deleted their account, a reviewer cannot follow it up. Whether an anonymised
flag should outlive an erasure, and for how long, is a safeguarding and
privacy-law decision — PIPEDA and Law 25 first, DPDP behind them — not a refactor. Deleting is the answer that needs no sign-off; keeping
someone's words against their wish is the one that does.

The journal table is also the rule, not just a store: **a session that ended for
safety never gets a row.** `JournalEntry::fromSession()` returns null for it,
and the absence of the row is how that is kept.

**And deleting an entry takes the words out of the session too.** The entry is a
copy: `guided_sessions.data` holds the same answers, and `GET /sessions/{id}`
serves that row to the owner's token — so deleting an entry used to leave every
word of it readable through the API, while the product said "It is removed for
good … This cannot be undone" and "we cannot get it back for you". That is the
plan-allowance problem again: a promise the server does not keep is the same
problem whichever way it points.

The **row** stays and only its content goes, which is the other half of the
rule. The weekly allowance counts `guided_sessions.started_at`, so deleting the
row would refund a full session and turn "3 full sessions a week" into "3 you
have not deleted"; the console's percentages are of sessions started and would
quietly start flattering themselves. Neither needs the user's words.

It is a `deleted` hook on `JournalEntry`, not controller code, for the reason
`SafetyFlag` keeps `severity` in step there: a rule that asks every caller to
remember it has a gap behind the next caller. A safety flag's excerpt is
deliberately untouched — that is the queue's, and a safety-stopped session never
had an entry to delete.

## A screen must not report an absence it only failed to read

This is a class rather than one bug, and it was found by one: the console's
role trail printed "No role has been changed yet." when the request that
answers that had failed. Audited across both client surfaces afterwards, and
the distinction that came out of it is the one to apply to the next screen.

**A false sentence is the bug. Missing information is not.** Three screens made
a definite statement out of a failed request, and all three are fixed:

- **"Nobody. A coach can only read a session after you have shared it with
  them."** — the phone's settings screen set the coach list to empty when
  `GET /me/coaches` failed. This is the screen that answers "who can read my
  sessions". Measured against the running app with the demo client, who is
  paired: with the request answering it listed Meera and offered "Stop
  sharing"; with it failing it said nobody could see anything, and the only
  control for revoking it was gone with the list. A sharing rule the sharer
  cannot inspect is a promise about somebody else's behaviour; one that answers
  wrongly, in the reassuring direction, is worse than one that admits it does
  not know. The web's settings screen was already right, by accident of
  structure — the coach read shares a `Promise.all` with the profile, so it
  fails closed and the screen blanks.
- **The home screen's "Start talking" with no warning**, on _both_ surfaces,
  when `GET /sessions/current` failed. `null` is that screen's word for
  "nothing is open", and `POST /sessions` ends whatever is, as `user_stopped` —
  so a dropped request turned the next tap into the session they were part-way
  through closed, and on a free plan one of three spent to do it, with nothing
  having said so. The same line and the same bug in both files, which is what
  the one-client rule exists to prevent and did not; the replacement wording is
  identical in both for that reason. It is never withheld: somebody who is
  upset is not told to come back because the network is poor, so the start
  buttons stay and the cost is stated instead of assumed away.
- **"We don't recognise this link. Ask your coach to send you a new
  invitation."** — the invite screen said that for every failure, not only for
  "there is no such invitation". Only 404 and 410 mean that now; anything else
  says it could not check. That route is in the `guessable` rate limiter, so a
  429 was a real way to reach it, and whoever holds the link has no account and
  no other way in. Note the ordering trap, which cost a run: the catch leaves
  `invitation` undefined because `null` means "unrecognised", so the new branch
  has to sit **above** the loading branch or the screen says "Loading…" for
  ever.

**Left alone, deliberately:** the admin nav's open-flag badge (hidden rather
than shown as `0`), the coach's waiting-to-be-accepted list (renders nothing),
the home screens' allowance line, and the session screen falling back to a
typed session when the voice preference cannot be read. None of them asserts
anything; they show less. Fixing those would mean inventing a visual the design
set does not have, which is the same mistake as inventing step copy.

`e2e/flow.mjs`, `e2e/mobile.mjs`, `e2e/coach.mjs` and `e2e/admin.mjs` each
block the one request and assert the screen says it could not tell — and, in
the same place, that it does not say the reassuring thing. All four were
checked by taking the fix out and rebuilding.

## A forgotten password is not a lost journal

`auth/forgot-password` and `auth/reset-password` use Laravel's password broker.
Two things about them are deliberate and should not be "simplified":

- **The answer is the same whether or not the address has an account.**
  `forgotPassword()` throws the broker's result away on purpose. It
  distinguishes "sent" from "no such user", and that distinction is the leak:
  this product's user list is people who went looking for help with being
  upset, and confirming membership is not something an unauthenticated caller
  should be able to do. A bad or expired token gets one message for both
  reasons, for the same reason.
- **A reset revokes every token**, this browser's included, so the new password
  has to be used to get back in. A reset is what you do when you think someone
  else may have your account.

The journal survives a reset because the `encrypted` casts use the
application's `APP_KEY`, not anything derived from the password. That is the
only reason a reset is safe to offer at all — key the encryption to the
password and this route becomes a shredder. If per-user keys are ever
introduced, this flow has to be rethought before they land, not after.

Mail is `MAIL_MAILER=log` in development: the link is written to
`storage/logs/laravel.log` rather than sent. The link points at
`config('app.frontend_url')` (`APP_FRONTEND_URL`), because the token is spent
on a web screen, not on an API route.

## Signing in

Two defaults were Laravel's and are not any more, both set once rather than at
each call site:

- **A password is at least twelve characters**, set with `Password::defaults()`
  in `AppServiceProvider`. Length and nothing else: composition rules push
  people towards a short password with a digit on the end. `uncompromised()` is
  deliberately absent — it would put a third-party request in the middle of
  registration, in a product that will not link a font from someone else, and
  it fails open when that request fails.
- **A token expires after thirty days** (`SANCTUM_TOKEN_MINUTES`). Laravel's
  default is never. Thirty rather than something shorter because there is no
  refresh flow, and a phone that asks for a password every week is a phone
  someone stops opening when they are upset. The real answer is cookie mode
  with a refresh, which is a change to how every surface authenticates.

Both have tests, and both tests were checked by removing the setting. The
expiry one needs `forgetGuards()` after travelling: the guard caches the user it
resolved, and without that the test passes with the expiry removed.

## Roles, and who reads what

A user has one of three roles, and nobody is staff by registering: `role` is not
in `User`'s `#[Fillable]`, so no request can set it. The model and the column
both default to `user`, and `isStaff()` reads a missing role as `user` — if the
role cannot be determined, the answer to "may this person read the safety queue"
is no.

**A coach is not an admin.** A coach reads the sessions a client chose to share.
An admin reads the safety queue, which holds the user's own words at the moment
they said they were not safe. Those are not the same trust, and `EnsureStaff`
admits only `admin`. It answers **404, not 403**, so the console's routes do not
confirm their own existence to someone who may not use them.

The console never names anyone. Both the queue and the overview's recent-session
list print `UserHandle::for()` — a short salted hash of the id, stable per user
so two rows read as one person without saying who. It is one function in the
domain because two would drift, and then one screen's handle would be a
different person from the other's. It is not a security boundary; it keeps a
name and an email off a screen that does not need them.

**Twelve hex characters, where the designs' example shows four** — a deliberate
departure, like the colour tokens over AA contrast, because the shown value is
wrong for what the thing has to do. Four is 65,536 handles: measured, a
thousand sequential ids already produce five collisions and twenty thousand
produce 2,761. A collision leaks nothing; it **merges two people** on the one
screen where that matters most, so two people each in crisis read as one person
in crisis twice and a reviewer's judgement about escalation rests on an identity
that is not real. Eight characters is not enough either (about a 69% chance of
a collision somewhere at 100,000 users); twelve is about one chance in 55,000.
If a short handle is ever needed again, the answer is a stored column with a
unique index — impossible rather than improbable — which is a migration, where
this is a constant and nothing stores a handle.

### A coach sees only what a client shared

`App\Domain\CoachView` is the rule, and every read in `CoachService` goes
through it. `sharedWith()` and `summarise()` both take a **whole** journal and
share it down themselves, so a caller cannot summarise private entries by
passing the wrong list. The tempting alternative is a `where('shared_with_coach')`
in each query; the reason not to is that a forgotten `where` is silent, and what
it leaks is somebody's private session. The recurring belief is computed over
the shared set only — a belief said twice in private is not a pattern a coach
gets to see. `packages/protocol/src/coach.ts` is the TypeScript half, and the
parity fixture covers both.

**The setting that decides it was decoration.** Both settings screens have
offered "Ask each time", "Never share" and "Share every session" since the
beginning, `users.coach_sharing` was stored, validated and printed back in the
profile — and nothing in either language read the column.
`JournalEntry::fromSession()` wrote `shared_with_coach => false` for everybody,
so "Share every session" shared nothing; the per-entry toggle took whatever it
was sent, so "Never share" blocked nothing. A promise the server does not keep
is the same problem whichever way it points, and this one pointed both ways at
once.

`App\Domain\CoachSharing` and `sharesNewEntry()` / `mayShareEntry()` in
`packages/protocol/src/coach.ts` are the rule, with parity cases over all three
settings against both states:

- **`always` shares a new entry, but only when somebody is paired.** "Share
  every session" is sharing it _with somebody_, and flagging entries while
  nobody is paired would mean accepting a coach later hands them a backlog the
  user chose the setting before ever seeing one.
- **`never` refuses turning sharing on**, which is what makes it a third
  choice rather than a second label for `ask_each_time`. It is a lock the
  person it protects can unlock, by changing the setting — the only kind of
  sharing rule worth having, since one the sharer cannot inspect or reverse is
  a promise about somebody else. Refused by the **server** with a 409 naming
  the setting; a screen that merely hides the control is a rule a client can
  skip.
- **Turning sharing off is always allowed**, whatever the setting. Somebody who
  has just chosen "Never share" is the last person to be told they cannot
  unshare something.
- **It never rewrites entries already shared.** Ending a pairing does not
  either — `shared_with_coach` is a decision the user made about one session and
  it stays where they put it — and a setting that silently rewrote the past
  would be the same surprise in the other direction. Whether choosing "Never
  share" should _offer_ to unshare what is already out there is in
  `DECISIONS.md`.

Both entry screens read the setting and say "Sharing is off in settings"
instead of offering a control the server will refuse. The web's toggle also
used to answer a refusal with "Could not change sharing. Check your
connection." — told to somebody whose own setting had refused it, which is both
wrong and unfixable by anything they would then try; it shows the server's
sentence now, as `apps/mobile/src/describe.ts` already required.

Two gates, both needed: `EnsureCoach` says this person is a coach at all, and
`CoachController::authorizePairing()` says they are _this client's_ coach.
Neither implies the other, and a route with only the first would let any coach
read any client.

**A pairing row means an accepted pairing.** `ClientStatus` has one case, and
the `clients()` and `coaches()` relations filter on it, so a row that says
anything else grants nothing — including to `/me/coaches`, which answers "who
can read my sessions" and must not list someone who cannot. There used to be an
`invited` case, from before invitations had a table; nothing wrote it, and what
it described is a pairing the client never agreed to, which a coach would then
read shared entries through — sharing is a property of the journal entry, not
of the pairing, so "they have not accepted yet" would not have saved it. An
unaccepted invitation is a `coach_invites` row, which is where the coach's
screen already lists them.

**The client creates the pairing, and the client ends it.** A coach can open an
invitation to an email address; they cannot attach themselves to an account.
Accepting is what pairs them, only the address it was sent to may accept, and
`/me/coaches` lets the client see who can read their shared sessions and end it
immediately. A sharing rule the sharer cannot inspect or revoke is a promise
about someone else's behaviour, not a rule.

Ending a pairing does **not** unshare the entries: `shared_with_coach` is a
separate decision and stays where the user put it. What ends is anyone being
able to read them, because reading goes through the pairing.

**Open question for someone qualified:** a `coach_invites` row holds the
address it was sent to, and nothing deletes it. The address is not a user's —
that is the point of the table, a coach can invite somebody who has no account —
so this product stores an email address indefinitely because a third party typed
it, for an invitation that expired or was withdrawn and can never be accepted
again. Erasure covers the case where the invitee does have an account
(`AccountDeletionService` sweeps by address); it cannot cover the case where
they never signed up and never agreed to anything.

Any fix is a retention period, and picking one is a privacy-law and product
decision rather than a refactor — the coach's screen is also the only record that they
invited somebody, which is a reason to keep it for a while and not a reason to
keep it forever. Expired reset tokens are the contrast worth noting: those have
a non-arbitrary answer, because a token past `config('auth.passwords')`'s
`expire` is dead by definition, so `auth:clear-resets` runs hourly on the
scheduler and no policy had to be invented.

A withdrawn invitation does not undo an accepted pairing, and the API refuses
rather than implying it might. There is no mail driver yet, so an invitation's
link comes back to the coach to pass on; the screen says so rather than implying
an email went out, and `CoachInviteController::forCoach()` stops returning the
token when mail is wired.

A coach learns that a session stopped for safety through `CoachAttention` —
that it happened, and when. Never what was said: a safety-stopped session is
never journalled, so it cannot be shared, and the words are the safety queue's.
A coach is not a reviewer.

That read **selects two timestamp columns**, not the row. `guided_sessions.data`
is the most personal column in the schema, and a coach's request does not ask
for it at all rather than asking and not using it. The encrypted cast is lazy,
so nothing was being decrypted either way — this is the difference between a
rule and a habit. It is asserted on the SQL, because there is nothing in the
response to see it by: adding a field to `CoachAttention` and reaching for
`$session->data` would otherwise break no test.

Both `openDraft()` and `publishDraft()` lock `protocol_versions` in id order
inside their transaction — the same lock in the same order, so they cannot
deadlock against each other. Publishing is the one where it prevents a bad
state: read outside the lock, two admins can each archive what was live before
either stores its replacement, and the product is left with two live versions.
Opening is the one where it only prevents a bad _answer_: the table is unique
on (major, minor) and `nextDraft()` is a pure function of the live version, so
two drafts were never possible, but `updateOrCreate` reads and then inserts, so
whoever lost the race got a constraint violation and a 500 from a button whose
contract is "or returns the one already open".

Publishing a protocol version is gated by the **server**, not by the editor:
`ProtocolVersion::publishProblems()` decides, the API refuses with 422 and that
list, and the screen renders what it is told. A disabled Publish button is a
courtesy; the refusal that matters is the one a screen cannot skip. There is one
draft at a time, a published version is never edited in place (editing opens the
next draft), and publishing archives the previous live row in the same
transaction — two live versions would mean two sets of questions in flight.

Which is also why a session is pinned to the version it started on: publishing
must not change the questions under someone part-way through.

Roles are set in the console (`/admin/users`), which is the only way — it used
to take a shell on the server. It is also the console's most consequential
screen, because granting `admin` grants the safety queue. Three guards and a
trail:

- **nobody changes their own role.** Not only against typos: an escalation one
  person can perform on themselves alone is one nobody else had to agree to.
- **the last admin cannot be demoted**, because the alternative is a product
  nobody can administer and a queue nobody can read. The count is taken
  **inside** the transaction, under a lock on the admin set in id order: two
  admins demoting each other at the same moment each saw two admins, each
  passed a check made before either wrote, and the product was left with none.
  That branch is reachable only under contention — sequentially, an admin
  cannot demote themselves, so the target can only be the last admin if the
  actor has stopped being one — and it therefore has no test. The lock is the
  fix; a sequential test of it would be the self-demotion rule wearing its
  name.
- **every change is recorded** in `role_changes`, with who did it, keeping both
  addresses as they were — an account can be renamed or deleted and the trail
  should still read. There is no route that edits or deletes a row there,
  because a trail that can be tidied is not one.

A no-op (setting the role it already has) records nothing: a trail of no-ops is
a trail nobody reads.

**And a trail that could not be read is not an empty trail.** `refreshTrail()`
swallowed a failed `GET /admin/role-changes` so that failing to show the record
could not stop anybody administering an account — which is right — and the
screen then printed "No role has been changed yet." over it, which is not.
Those are opposite facts on the one screen anyone would look at: one says
nobody has been granted the safety queue, the other says this screen does not
know who has. It is the same shape as the risk screen reporting `none` for text
it could not read, and it was found the same way — by a check believing it.
`e2e/admin.mjs` reported the role change as never recorded through two CI runs
while the change had in fact been made and only the trail could not be read, so
it now asserts the server's record and the screen's **separately**: which half
failed is the whole diagnosis. It also asserts the trail row for its own
account rather than `User → Coach` anywhere on the page, which an earlier run
left there — measured, 1 round in 10 passed with nothing recorded.

`AdminOverviewService` reads only plain columns — kind, the furthest step, end
reason, rating, the count of turns the safety screen could not read, and when
the longest-waiting open flag was raised.

**"Only plain columns" was a claim before it was true.** The reach chart asked
how far each session got, and the only column that could answer was `step_id` —
so the service built every session's domain object to read it, which reads
`data`, the encrypted one. Every load of that screen decrypted every session in
the window, for a row that shows a step number and a rating. And it got the
answer wrong anyway: ending a session sets `step_id` to null, the code read
`step_id ?? the last step`, and so a safety stop at step 1 reported **100%
reach at all six steps** while `reachedFinalStepPct` beside it, which comes from
the journal, said 0%. A chart about where sessions stop cannot be built from a
column that is cleared when they stop.

So the furthest step is its own plain column, kept by the reducer as a
high-water mark that only rises — `furthestStepId` / `$furthestStepId`, like
`safetyLevel` and for the same kind of reason. `end()` destroys `stepId` and
deliberately leaves it alone, which is the whole point. The chart is now one
`GROUP BY` over that column with no row hydrated, and `recentSessions` names
its columns. The backfill in the migration is best-effort and says so: a row
that had already ended early cannot be recovered, because the step it stopped
on was overwritten with null, so those read as step 1 — under-reporting rather
than over-reporting, which shows a drop-off instead of hiding one.

`OverviewReadsPlainColumnsTest` asserts both halves, the second one on the
SQL, because there is nothing in the response to see it by: the version that
decrypted every session printed exactly the same numbers. That last one is deliberately **not**
limited to the window: a flag raised three weeks ago and still open is exactly
what it is for, and a count alone cannot show it — four open flags reads as a
manageable afternoon until you learn the oldest has been waiting six days. The
queue itself shows each flag's age for the same reason; it used to show none.
`raisedAt` was in the API response all along and no screen printed it. It touches none of the encrypted text: the console answers "how is the
protocol working", and the one place staff read someone's words is the queue.
Its percentages are of **sessions started**, so a session that stopped for
safety (and therefore has no journal row) stays in the denominator rather than
flattering the numbers.

## The API pages, and is bounded

Five endpoints are paged, and they are the only ones with an envelope:
`GET /journal`, `GET /admin/safety-flags`, `GET /admin/users`,
`GET /admin/role-changes` and `GET /admin/plan-changes`. Everything else is a
bare resource or a bare array. This paragraph said four for as long as the plan
trail existed, which is the drift it is itself a list to prevent.

```json
{ "items": [...], "nextCursor": "..." | null, "total": 42 }
```

Cursor, not offset: these lists grow while they are being read, and an offset
page silently repeats or skips a row when something is inserted between two
requests. For the queue that would mean a reviewer never seeing a flag.

A cursor is built from the ordering columns, so **every one of those orderings
ends in `id`** — `occurred_at`, `raised_at`, a name and `created_at` are none of
them unique, and a tie with no tiebreaker makes a page repeat a row. Check that
when adding a paged list; it is the whole reason the rule is written down.

**And it is asserted on all five now, which it was not.** The journal and the
queue had tie tests; the accounts list, the role trail and the plan trail did
not, and `name` is the least unique column of the four — two people called Asha
Verma is a Tuesday, not a contrived case. Measured by taking each tiebreaker
out one at a time: an admin paging accounts one at a time sees **2 of 5** and
the paging stops, and the role trail shows **1 of 4** grants. On the trail of
who was given the safety queue, three grants simply invisible.

The plan trail is the one worth noting, because it had a test and the test did
not cover it. It read two pages and asserted the second did not repeat the
first, under a comment saying that a tie with no tiebreaker makes a page repeat
a row — and it **passed with the tiebreaker removed**. Two pages of two out of
five rows is not where an unstable sort shows itself; walking to exhaustion and
counting is. All five walk to exhaustion and assert the count and the
uniqueness, because a repeat and an omission are the same bug. A comment is not
a case. The
queue's severity is a stored `severity` column for the same reason: it used to
be a `CASE level ...` expression, which sorts correctly
but is not a column a cursor can read, and two pages overlapped. The rank itself
is still the domain's (`SafetyLevel::rank()`); the model keeps the column in
step on write.

Page sizes are bounded and a nonsense one falls back to the default. These rows
are decrypted one at a time, so an unbounded page is a way to make the server do
unbounded work.

## The API's shape

Resource responses carry **no `data` envelope**: `JsonResource::withoutWrapping()`
is called in `AppServiceProvider`. Assert `step.ordinal`, not
`data.step.ordinal`, and a collection comes back as a bare JSON array.

It is stated there because the default was already being defeated by accident —
Laravel skips its wrapper when the payload has its own `data` key, and
`SessionResource` has one. So sessions came back unwrapped while the journal came
back wrapped, and renaming that key would have silently reshaped every session
response.

**This API has no web routes, and so starts no sessions.** That is a privacy
property, not tidiness: a web route runs the `web` middleware group, that group
starts a session, and `SESSION_DRIVER=database` makes a session a row holding
the caller's **IP address and user-agent**. The skeleton's `GET /` returned
Laravel's `welcome` view, so every request to the API's root stored those — for
a page it does not serve and a session nothing reads, `user_id` being always
null with authentication by bearer token. Sanctum's `sanctum/csrf-cookie` was
the same thing and is off (`'routes' => false`); **turn it back on in the same
change that adopts cookie mode**, which cannot work without it.
`tests/Feature/NoWebSessionsTest.php` asserts there are no `web`-group routes at
all, because adding one is easy and the session it starts is invisible.

An unauthenticated request answers **401**, with or without an `Accept` header.
Laravel's default sends a guest to `route('login')`, which this API does not
have, and the auth middleware resolves that before the exception handler decides
on JSON — so a bare request used to get a 500. `bootstrap/app.php` sets
`redirectGuestsTo` to null; there is a test for it.

CORS is a list, never `*`: `CORS_ALLOWED_ORIGINS`, defaulting to the two local
spellings of the dev server. This API carries personal health content behind
bearer tokens.

The limit on the guessable routes — sign-in, registration, password recovery,
opening an invitation — is keyed by **the account being guessed**, not by the
address asking. `AppServiceProvider`'s `guessable` limiter does it. India
is where the reason was first obvious and it is not specific to India: a mobile
carrier puts tens of thousands of subscribers behind one public IP, in Canada
as well, so a per-IP budget is one a whole network
shares, and the people it locks out are strangers to each other — one of whom
cannot reach their journal. A per-IP ceiling stays as a second line against one
machine spraying many accounts, set where only a script reaches it. Do not
replace this with `throttle:N,1`, which is per IP and was what it replaced.

**Three buckets, because two of them were one.** The tight limit was keyed on
the account **alone**, which is a way to lock somebody out of their own journal
with six requests a minute. An address is not a secret — a coach types their
client's into an invitation — so anybody holding it can keep a person out of
the product indefinitely by renewing the burst, and the person it happens to
went looking for help with being upset and cannot reach what they wrote. It is
the same innocent-lockout failure the per-IP limit was replaced for, arriving
from the other direction.

What makes keying it by address as well a fix rather than a trade is
`Password::min(12)`. Online guessing is not what a tight per-account limit
defends against: thirty attempts a minute is 43,200 a day, nothing against
twelve characters. The real threat is credential stuffing — a password already
known from somebody else's breach — and that needs one attempt, which no rate
limit stops. So the tight bucket bought very little and cost a trivial denial
of service against one person.

So: tight by account **and** address, which is the shape of a password guess
and cannot lock anybody else out; looser by account across every address, so a
distributed attempt is still capped; and the per-IP ceiling unchanged.
`GuessableRoutesAreLimitedTest` asserts each of the three, that a request with
neither an email nor a token does not land in one global bucket, and that one
address exhausting its budget leaves another able to sign in — which is the
half that was broken, and the only one of the five that goes red when the key
is put back.

**A rate limiter writes, and on sqlite that write is a 500.** The
`throttle:120,1` on the authenticated routes stores a counter in the cache on
every request, and `CACHE_STORE=database` puts that write in the same database
as the data the request is about. On MySQL it is fine. On sqlite — which is the
development container and the documented end-to-end stack — it is not:
measured at 8 server workers, **33 of 60** concurrent reads of
`/admin/role-changes` answered 500 `database is locked`, from the limiter
rather than from anything the request asked for. It reads as a flaky console
and it is configuration. `CACHE_STORE=file` whenever `DB_CONNECTION=sqlite`;
`.env.example` and `e2e/README.md` both say so beside the line that needs it.

The web client keeps its token in `localStorage`, which an XSS can read. The
right answer is Sanctum's cookie mode; the shortcut is documented at the top of
`apps/web/src/lib/api.ts` and is not an opinion that it is fine.

What stands in for it meanwhile is the Content-Security-Policy in
`apps/web/next.config.ts`: `connect-src` names this origin and the API's and
nothing else, so a token that is read cannot be sent anywhere, and `img-src`,
`form-action` and `base-uri` close the other ways out. The API's origin comes
from the same `NEXT_PUBLIC_API_URL` the client reads, so the policy cannot name
a different API from the one the app calls. `script-src` keeps `'unsafe-inline'`
on purpose — the alternative is a per-request nonce, and every route here is
statically prerendered, so the middleware minting it would make all of them
dynamic. Be plain about what that leaves: injected inline script still runs.

A strict policy is only available because the app loads nothing from anywhere
else — no analytics, no tag manager, no webfont CDN. `e2e/privacy.mjs` keeps
both halves honest: it asserts no screen trips the policy, and then, from
inside a real page, it does what a payload would do — pulls in a script from
another origin and tries to `fetch` the token out — and asserts the browser
refuses both. `Permissions-Policy` denies the microphone, which is true only
while `UserEar` is unbound; binding a listener means changing that line.

## Conventions

- In `packages/*`, use `.js` extensions in relative import specifiers, even for
  TypeScript sources — required by `NodeNext` resolution. In `apps/web` do
  **not**: it resolves with `Bundler`, and Turbopack will not rewrite `.js` to
  `.ts`.
- Type-only imports as `import type { ... }` (lint-enforced).
- Tests co-located as `*.test.ts` next to the module.
- The session reducer is pure: `apply()` must never mutate its input.
- Prefer fixing types over casting. `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are on.

## tsconfig layout

- `tsconfig.base.json` — shared compiler options, extended by each package.
- `tsconfig.json` — solution file; `references` only.
- `packages/*/tsconfig.json` — the package build (emits `dist/`, `composite`,
  excludes tests).
- `tsconfig.test.json` — no-emit, spans every package's `src` plus root
  `*.config.ts`; backs `typecheck` and ESLint's `parserOptions.project`.

If a new file reports "not found in any of the provided project(s)" from ESLint,
it is missing from `tsconfig.test.json`'s `include`.

## Gotchas

- `tsc --noEmit` cannot target a `composite` project, hence `tsconfig.test.json`.
- `exclude` is inherited by extending configs even when `include` is overridden.
- `pnpm/action-setup` must run **before** `actions/setup-node` in CI, since
  `cache: pnpm` needs the pnpm binary to exist.
- `tsBuildInfoFile` points inside `dist/`. Left at its default, deleting `dist/`
  without the `.tsbuildinfo` makes `tsc --build` report success and emit
  nothing.
- `noPropertyAccessFromIndexSignature` is off in `apps/web` only: CSS Modules
  type as an index signature, so every `styles.foo` would need `styles['foo']`.

## Decisions not taken

`LAUNCH.md` is the ordered one: what stands between the code as it is and a
stranger finishing a session safely, with what each item needs and which of
them cannot be done without a person, an account or a certificate. It is the
page to update when one of those is closed, and the one to read before
describing this product as ready.

`DECISIONS.md` is the consolidated list, for the person deciding rather than
the person reading code. Every item on it is also written down at the place the
code waits for it, which is where it belongs — the page is an index, not the
source of truth, and the rule about not inventing product copy applies to all
of it.

## Decisions taken

- **Design direction: Warm & Clear.** Settled; see above.
- **Client stack: Expo for mobile, Next.js for web and desktop**, all three
  consuming `packages/*`. Scaffolded and built; see the sections above for what
  is verified on each and what is not.
- **Step prompt copy stays `null` in code** until the PRD supplies it, and the
  shippable copy lives in a draft protocol version that an admin publishes —
  see "Do not invent product copy" above. Do not move the draft's text into
  `steps.ts`.
- **Listening is not in v1.** The guide speaks; answers are typed. Every
  listener available today sends the user's audio to somebody, and the setup
  screen's "Your voice is never saved" is true only while none is bound. That
  sentence is the constraint, not a slogan: binding a hosted listener means
  rewriting it and adding a consent flow under PIPEDA and Law 25 — and DPDP
  for the second market — which is a product and legal change rather than a
  refactor. `UserEar` stays the seam.
- **Pricing stays unset** — the designs show `[PRICE]/mo` placeholders. What a
  plan _allows_ is settled, though: see below.

- **Backend: Laravel 13 + MySQL**, owning the session, the protocol and safety.
  Chosen over a TypeScript backend so the safety rules exist exactly once;
  MySQL was never the hard part of that decision.

Still unchosen: the voice stack (speech-to-text, text-to-speech, turn-taking).
PHP is a poor fit for long-lived audio streaming, so expect a separate small
gateway for the voice loop with Laravel owning everything around it.

The interface it stays behind is `apps/web/src/lib/voice/`, in the surface and
not in `packages/protocol`, which must stay free of speech. Two halves, kept
apart on purpose:

- **`GuideVoice` — the guide speaking.** Bound, and working. `speak()` is only
  ever handed `session.say`, which is the protocol's own copy and is already on
  the screen, so saying it aloud discloses nothing new. It is **never** the
  user's words. `SpeechEngine` is the narrow seam a vendor binds behind; the Web
  Speech API lives in `browser-engine.ts` and nowhere else, so the browser's
  accident of design does not become the requirement.
- **`UserEar` — hearing the user.** Deliberately unbound, and it says so. Every
  option today sends the user's audio somewhere: Chrome's `SpeechRecognition`
  uploads it to Google, every hosted service uploads it by definition, and an
  on-device model is real work. The setup screen says **"Your voice is never
  saved"**, and Canada-first puts PIPEDA and Québec's Law 25 in the frame,
  with DPDP behind them for the second market. So `noEar` reports
  itself unavailable with a reason the screen shows, and every session is typed.
  **Binding a listener is a product and legal decision, not a refactor.**

So "hands free" today means a guide that speaks and answers that are typed. The
setup screen says that rather than implying the whole mode works.

## Safety screening is server-side now

`POST /api/sessions/{id}/turns` is the **only** way to advance a session, and it
screens before the guide is consulted. A client cannot skip it by not calling
it, because there is no other path. `RiskScreen` is bound in
`DomainServiceProvider`, which is where a real classifier replaces the phrase
screen.

The browser copy in `packages/protocol` is now a convenience for instant
feedback, never the enforcement. Do not let it become the only check again.

**A classifier that cannot answer falls back to the phrase screen.** That is
what "a backstop behind it" means, and it is written at the seam
(`App\Domain\RiskScreen`) because it is a decision rather than an
implementation detail, and because the other two options are worse than the
problem: throwing turns a disclosure into a 500 that screens and records
nothing, and returning `none` quietly stops screening for as long as the model
is unreachable while every screen says everything is fine. It is not
implemented, deliberately — a decorator wrapping the phrase screen with the
phrase screen is machinery for a dependency that does not exist. And it is not
`unreadable`: that field is a fact about the text, where a model being down is
a fact about the deployment, which a user's turn should not have to carry.

**The client is told as little as possible.** `SessionResource` never returns
the risk level, the category or the matched phrase: a user mid-crisis has no use
for "you tripped the self-harm rule", and a client that knows the rule can be
built to dodge it. There is a test asserting the response contains neither.

API resources are **not** wrapped in a `data` envelope in this Laravel version —
assert on `step.ordinal`, not `data.step.ordinal`.
