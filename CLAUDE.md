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
the old one: the language the screen reads, the currency and the locale.

That list used to end "and the privacy law the consent screen names", and **no
screen names a privacy law at all** — grepped across both client surfaces,
both packages, the API and the migrations: three mentions, in **two** files,
and both of them doc comments. `apps/web/src/lib/voice/user-ear.ts` names all
three, explaining why no listener is bound, and
`packages/protocol/src/onboarding.ts` names Law 25, explaining that nothing
reads the "improve the app" consent item. Not one of the three is a string a
person can see. That sentence said "once each, in a comment in `user-ear.ts`"
until the second file was written, which is the risk in citing a grep: the
claim it supports stayed true and the count stopped being.

So the claim is a **test** now and the count is nobody's to maintain.
`apps/web/src/lib/no-privacy-law-in-copy.test.ts` reads every TypeScript and
PHP file under both client surfaces, both copy-holding packages, and the API —
found with `git ls-files`, so a file written tomorrow is covered the day it is
written — and asserts a law's name appears on **comment lines only**. It is
deliberately not a ban: those three comments are where the reasoning for an
unbound listener and an unread consent item lives, so a second case asserts
they are still there. Checked both ways — a `PIPEDA` in the consent screen's
heading goes red naming the file and the line, and removing the names from the
two comments turns the other case red.

**It excludes test files, because the first version read itself.** The line
holding the pattern is not a comment, so the check matched its own source — and
it passed anyway while the file was untracked, since `git ls-files` does not
list those, then went red the moment it was committed. `verify:clean` is what
caught it, on a clean tree, which is the failure that command exists for
arriving in a check written two commits earlier. Nothing in a test is shown to
anybody, so excluding them costs the rule nothing. Whether the consent screen should name the law is a legal
and product decision and so is not something to invent here, which is the rule
about product copy applying to the one kind of copy where guessing is worst. It
is in `DECISIONS.md`; what is fixed here is the sentence that implied it was
already done.

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

**Which answer somebody gets depends on their keyboard, not on them.** That is
the sharpest way to say the gap above, and it is measured rather than argued —
the same sentence, the same language, typed two ways:

| said                                                       | in its own script     | typed in Latin letters         |
| ---------------------------------------------------------- | --------------------- | ------------------------------ |
| Hindi "मुझे मरना है" / "mujhe marna hai"                   | stops the session     | stops the session              |
| Punjabi "ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ" / "main marna chahunda han" | not read, and says so | **nothing found**, confidently |
| Mandarin "我想死" / "wo xiang si"                          | not read, and says so | **nothing found**, confidently |
| Russian "я хочу умереть" / "ya hochu umeret"               | not read, and says so | **nothing found**, confidently |

So `unreadable` bounds the gap for somebody whose keyboard is not Latin, and
not for the same person on a transliterating one — which on a phone is most of
them. Punjabi, Mandarin, Cantonese, Arabic and Tagalog all have large
communities in Canada, the first market.

Hindi is the row that is not a problem, and it is the one that prices the fix:
it is graded both ways only because the Hinglish spellings were written out by
hand. Every other language needs that same work, a missed spelling is a missed
disclosure, and somebody has to judge whether a phrase in a language they do
not speak means what the list says — which is why this is the classifier's job
and not a longer list here. **Do not add phrases for a language nobody
qualified has reviewed.**

There is a test, and it goes red in **both** directions, which is what makes it
worth having: adding one Punjabi phrase turns it red, so closing the gap
announces itself rather than passing silently; and adding Gurmukhi to
`READABLE_SCRIPTS` without phrases turns it red too, which is the wrong fix
this file already warns about, now caught rather than described. Both were
checked. The review pack prints the same table from the same function, so the
document a clinician reads cannot drift from the screen.

And the pack is written **through Prettier with this repository's own config**
now, which is the lesson `parity/generate.mjs` already carried and this
generator never had. `RISK-SCREEN-REVIEW.md` is checked in and `format:check`
runs over it, so a regeneration Prettier would rewrite leaves the tree failing
that gate. It had passed by luck: nothing the generator wrote happened to
exceed the print width, and then that two-script table did, and regenerating
turned `check` red in a file nobody had edited by hand.

It is counted, in `guided_sessions.unreadable_turns`, and the console's
overview reports it. That is the whole intervention — a count, because a count
is what says whether the gap is worth closing and for whom, and because the
alternatives are both wrong. Nothing stores which script it was: that needs a
decision about whether a user's language is ours to keep, and knowing _whether_
this happens is enough to decide whether to ask.

**And the review pack now says what happens after a stop**, which it did not.
A reviewer judging a crisis screen needs three facts that are not about the
screen at all, and all three are measured rather than described: the person can
start a new session **immediately**, at step 1, with no cooldown and nothing
asked of them; **nobody is on call** for the flag queue — no alert, no email,
no response time, which is the reason the overview reports the age of the
longest-waiting open flag; and a stopped session is never journalled, so its
words are the one thing the person typed that they cannot read back. Each is
defensible, none is ours to settle, and a reviewer who is not told them is
answering about a different product. They are questions 5, 6 and 7, and the
count in the pack's opening paragraph is derived from the list — it said "four"
for a while after there were seven, in the first thing the reader reads.

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
saying they are not safe — and then the helplines never appear.

**That sentence was false for as long as it has been written down, and it is
the best example in this file of why the warning at the top exists.** The route
comment said it was "deliberately not given a `throttle` middleware", which was
true of the line and false of the route: it sat inside the group carrying
`throttle:120,1`, and a group's middleware is the route's. Measured — 120
ordinary reads of `GET /me`, then "I want to kill myself" as the next turn:
**429, no flag raised, the session still open.** The screen never ran. The
exact failure this ordering exists to prevent, arriving through the shared
allowance instead of through this route's own middleware, while both the code
comment and this file said it could not happen.

Two details make it worse than a theoretical ceiling. The budget is **shared
with every other authenticated route**, so a client paging a long journal
spends the allowance a disclosure then needs; and `ThrottleRequests` keys on
the **user id**, not the token, so the web app, the phone and the desktop shell
share one 120-a-minute budget between them. The route comment said "per token",
which was wrong too.

The turn is declared outside that group now, with `auth:sanctum` and nothing
else, and `NoRateLimitBeforeTheScreenTest` has both halves: the behaviour (spend
the allowance, then assert a crisis turn still stops, still flags, still returns
helplines) and the structure (the route's gathered middleware contains no
throttle). The second is the one that matters for next time — nobody added a
`throttle` to that line, they added the line to a throttled group, so a test
reading only the line would not have caught it. Both go red with the throttle
restored.

Be plain about what that leaves: the turns route now has **no request limit at
all**. What bounds it is `GuideBudget`, after the screen, which withholds the
expensive call. A spent budget still screens, still flags and still stops; the
remaining cost of a refused-guide turn is a regex and a row, and that is the
trade this rule is choosing on purpose. The budget is
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

### And outside a session there was nowhere on the web to find a number

The phone's settings screen renders `helplinesFor(profile.country)` under a
group headed **"If you need someone now"**, and has since it was written. The
web's settings screen rendered nothing — grepped, the only matches for
"danger" on it were the colour token on its two delete buttons. So on the web
and in the desktop shell the crisis numbers existed on exactly two screens: the
consent gate, before anybody starts, and the safety pause, after the server has
stopped a session. A person who wanted a number at any other moment had
nowhere to look.

**The desktop app made that worse than a gap.** Its Help menu has one item,
labelled with that same phrase — "If you need someone now" — and it navigates
to `/app/settings`. So somebody who clicked it arrived at voice preferences,
coach sharing, "Delete my journal" and "Delete my account". The label was
written against the phone's section; the screen it points at is the web's,
which did not have one.

The web's settings screen has it now, same heading, same
`helplinesFor(profile.country)` with `DEFAULT_COUNTRY` as the fallback rather
than a literal — the rule the consent screens were fixed to follow. An unserved
country gets the empty list and the section is not drawn, because a heading
with nothing under it is the same mistake as a wrong number.

**`HelplineLink` is a shared component now, which the rule already said it
was.** "One rendering of a phone number per surface" was true of one _file_:
the component lived inside `session/SessionFlow.tsx` with its CSS in that
screen's module, so the settings screen could not have used it even if somebody
had wanted to. It is in `apps/web/src/components/` with its own module, and the
pause, the unsent-crisis block and settings are the same `tel:` link — three of
them on a Canadian account, which is what `flow.mjs` counts.

Note what the phone does differently and is left alone: its settings section
renders the numbers as **text**, not as a pressable. That is a real difference
and not this change's to make — `apps/mobile/README.md` already lists `tel:`
links among the things only a device can prove.

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
fifteen files on the web and six on the phone mark an error as an alert, and
the session screen was the one that did not. Those two counts are current and
checkable rather than a measurement from the day this was written, which is the
only kind of number worth putting in a file like this one:

    grep -rl 'role="alert"' apps/web/src --include=*.tsx
    grep -rlE 'accessibilityLiveRegion|accessibilityRole="alert"' apps/mobile/src --include=*.tsx

The phone's command needs **both** attributes. Written with
`accessibilityLiveRegion` alone it returns one file rather than six, which is
how this paragraph was briefly wrong about the number it had just been
corrected to — a command that does not reproduce the count is not a check.

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

### The same question, asked of every screen that changes under a press

The session screen was the sharpest case and not the only one. Measured the
same way — `document.activeElement` and the live regions in a real browser,
before and after a press:

- **Publish, on `/admin/protocol`.** Focus fell to `<body>` and there was no
  live region on the page. An admin published the product's voice to everybody
  and the screen said nothing — on the most consequential button in the
  console after a role grant.
- **"Mark as reviewed", on `/admin/safety`.** Focus fell to `<body>`, no live
  region. A reviewer marked somebody's crisis disclosure as handled and was
  told neither that it worked nor where they now were.
- **Three autosaves** — the step prompts, a journal note, a coach's private
  notes — showed `· saving…` appended to their field's label, in no live
  region, and **never said "saved" at all**. The only confirmation an edit had
  been written was a word disappearing, and measured against a local API the
  word is on screen for less than the 400ms the sampling used: even sighted, on
  a fast connection, there was nothing to see.

Two decisions, and the first is the one worth reusing:

- **`aria-disabled`, not `disabled`, on a button whose press settles it.** A
  `disabled` button leaves the tab order, so the focus that was on it has
  nowhere to go and lands at the top of the document. Focusable, the button
  stays exactly where the user left it and its own accessible name changes
  from "Mark as reviewed" to "Reviewed" — which is the announcement, with
  nothing added to the screen. The `onClick` handler is what refuses a press
  **once the state has settled**, and `admin.module.css` styles both spellings
  so it looks identical. This is why no new focus target or wording had to be
  invented here, unlike the session screen's pause, where the whole screen is
  replaced.
- **One live region per screen, holding what that screen is about.** The
  editor's version line is the region, so an autosave and a publish announce
  from one place and after publishing it reads exactly the news: "Live version
  1.3". `apps/web/src/components/SaveStatus.tsx` is the shared one for a
  field's status — polite, because a save must not interrupt somebody
  mid-sentence, which is the exact opposite of the crisis block's
  `role="alert"`. A failure stays in its own `role="alert"` through
  `describe()`, and a failed save goes back to **idle** rather than "saved":
  a status that lies is worse than no status.

**A press is not refused while it is in flight, and that sentence used to say
it was.** Both handlers guarded on the state the response changes —
`selected.status === 'reviewed'` on the queue, `readOnly || !publishable` in
the editor — and neither changes until the response lands, so the window
between the press and the answer was wide open. Measured: three rapid clicks,
three POSTs. Checked the other way first, because the obvious suspect was the
switch from `disabled` to `aria-disabled` above — with `disabled` restored it
also sent three, so this was never that change's doing and had been true the
whole time.

On the queue a second review is a wasted round trip and nothing worse. On
Publish it is not: the statuses came back **`[200, 422, 422]`**, the live
version advanced, and the screen was left reading **"There is no draft to
publish."** — a refusal rendered over the publish that had just worked, which
is the false-sentence class two sections down with the request succeeding
rather than failing. The server's id-ordered lock on `protocol_versions` is why
the damage stops there: two live versions were never reachable, so what was
reachable was only the wrong sentence.

So both carry an in-flight guard — `reviewing` and `publishing` — which is also
the label while the request is out ("Marking…", "Publishing…"). `e2e/admin.mjs`
clicks each three times and asserts **one** request, plus that the editor is
not left claiming there was no draft. Note the trap in writing that check: the
label changes under it, so a `getByRole('button', { name: 'Publish' })`
locator stops resolving after the first click and the second never gets sent —
the check passes having measured nothing. It holds an element handle across all
three. All three assertions go red with the guards removed.

**The same window is open on five more controls, and the API was words-ing
its own 404s.** Swept every mutating call on both surfaces — the welcome and
auth flow all guards on a `busy` flag already, and the session screen's `send`
does too, which is the one that matters most. Five did not: the journal's
share toggle and delete, and settings' "Delete my journal", "End coaching"
and "Delete my account" (which set a flag without refusing on it, so the
`disabled` attribute React had not applied yet was the only guard).

The journal delete is the worst of them because the handler is a **loop** —
one request per entry, each authorised on its own — guarded on the entry count,
which does not change until every request has come back. Measured against a
seeded account of eight entries: three taps, **ten deletes**, the extra two
answering 404. Eight for eight after the fix.

And the 404 is the half that reaches a person. Laravel's model-binding message
is `No query results for model [App\Models\JournalEntry] 01m43t…`, and
`APP_DEBUG=false` does **not** change it — a `NotFoundHttpException` is an
`HttpExceptionInterface`, so the framework keeps its own wording in production.
`describe()` prefers the API's own message, rightly, so the fix is that the API
stops saying that: `bootstrap/app.php` answers a framework 404 with no words,
which is what `EnsureStaff` and `authorizePairing()` already do and what
`describe()` has its "Stillpoint would not do that. Reload to see where things
stand." for. Writing the test found the second one — a path matching no route
answers "The route api/admin/users/01m43t…/role could not be found.", which is
how a shipped phone app meeting a renamed route would explain itself. Both are
told apart from an `abort(404, 'words')` without matching on the framework's
sentences: the router throws before a route is resolved, so `$request->route()`
is null for its 404.

Two things the sweep deliberately left alone. The phone's `endCoaching` goes
through `Alert.alert`, which dismisses on the first tap, so it cannot
double-fire the way the web's can. And `flow.mjs`'s two wording assertions are
guards rather than demonstrations: reverted, the request count goes red and
those two stayed green, because the duplicate's 404 set the failure line and
the surviving loop's success path cleared it. Which loop finishes last decides
it, so the count is what to trust and
`tests/Feature/NotFoundSaysNothingTest.php` is where the wording is pinned.

**And the session screen — which that first bullet calls the sharpest case —
never got the rule.** `aria-disabled` was applied to Publish, to "Mark as
reviewed" and to the journal's "Load older", and the session screen's Continue
kept `disabled={!canContinue || busy}`. Measured in a real browser with the
turn held open: pressing Continue made `document.activeElement` **`<body>`**
while the request was out, and on a **failed** turn it stayed there — because
there is no advance to put it back. So somebody on a keyboard or a screen
reader presses Continue, the turn fails, and they are at the top of the
document with an error on screen and their answer still in a box they can no
longer find.

It was twelve controls, not one, and that is the part worth keeping: the
auth flow's six buttons (sign-in, consent, voice setup's two, forgot, reset),
the invitation's Accept, the coach's "Create invitation", settings' "Export my
data" and "Delete my account", and the console's **two** "Load more" buttons —
the same control the journal's was fixed as, in the place the fix did not
reach. A one-place rule applied in one place is the finding this file keeps
making about itself.

Every one of those handlers already refused the press on its own state, except
two: `AcceptInvite`'s and settings' `exportData`, which went straight to
`setBusy(true)`. They guard now, because `aria-disabled` is advisory and the
handler is the refusal.

`flow.mjs` asserts the focus where it is worst, and the assertion reads the
**element** rather than a selector, because the button's name changing under
the focus is the whole mechanism: it prints `button:Sending…` during the turn
and `button:Continue` after it fails. Two more beside it — the failure is on
screen, and what was typed is still in the box — stay green when the attribute
is restored, which is the right independence. The two focus ones go red naming
`body`.

**And it turned section 6b of `flow.mjs` red, which was the more useful half.**
That section spends the guide budget and then asserts a crisis turn is still
screened, stopped and given helplines — and it had been passing on **leftovers**.
The budget is 30 a minute keyed on the account; the section opened one quick
session and sent up to forty thin answers into it, and one session's turns are
bounded: once a step's guide turns are used the session moves on, and once it
is finished every further turn is a 409 rather than a 429. So whether the
budget ran out inside that session depended entirely on how much of it earlier
sections had spent in the same minute.

Adding a section above it cost about twenty-five seconds of wall clock, that
window rolled over, and 6b started with a full budget it could not spend: zero
refusals, and a check reporting "the budget was never spent" about a budget
that was working perfectly. Passing for a reason other than the one it names is
the failure this file keeps finding, and the only reason it surfaced is that
something unrelated changed the timing.

A 409 opens another quick session now rather than ending the loop — quick
sessions are unlimited by design, so it costs the account nothing — and the
assertion prints what it took: **2 refusals after 33 turns across 2 sessions**,
which is the measurement that says one session could never have done it.

**Three controls keep the native attribute, and the reasons are not
symmetry.** Settings' "Delete my journal" is unavailable at rest, when there is
nothing to delete, so no press ever moves focus off it. And the console's two
`<select>`s are form controls rather than buttons: `aria-disabled` reports a
state without preventing the control being opened and changed, and what a
second change would send there is a _different_ role or plan for the same
account while the first is in flight — worth refusing in the browser and not
only in the handler.

**The journal's "Load older" was the same bug in the ordinary part of the
app.** The console's buttons were audited; this one was not, and it is the same
two failures at once. Measured with the page request held open: focus was on
"Load older", the press made `document.activeElement` **`<body>`**, and it
stayed there — and when the **last** page lands the button is removed
altogether (`cursor === null`), so a keyboard user is returned to the top of a
list that has just got eighteen entries longer, with nothing saying so.

The screen even had the sentence and threw it away. The subtitle carries
"Showing 20 of 38." and suppresses itself once everything is loaded, which is
right on a first load — "Showing 8 of 8." is noise — and exactly backwards
after a press: the one sentence that would confirm the entries arrived is the
one that disappears when they do.

So `aria-disabled` rather than `disabled`, which keeps focus on the button
while the page is in flight; a `role="status"` of its own, silent until there
is news and then holding the same words the subtitle uses; and focus moved to
that line when the button is removed, because the thing that was pressed is
gone — the session screen's pause answer, for the same reason. Polite, not an
alert: more of somebody's own journal arriving is not something to interrupt
them with. Re-measured: focus stays on "Loading…", then lands on
`p[role="status"]` reading "Showing 38 of 38.".

**The phone was half right, and the half it got wrong went unnoticed for as
long as this paragraph did.** Its button uses
`accessibilityState={{ disabled, busy }}`, and this said that React Native for
web "renders as `aria-disabled` and `aria-busy` rather than the DOM attribute".
Measured in the running export with a request held open: `aria-disabled="true"`
yes, **`aria-busy` absent entirely** — the same gap as
`accessibilityState={{ selected }}` on the radios, one key over. It carries
`aria-busy` explicitly now. What was right is that the label carries the count
itself ("Load more (20 of 38)"), so its accessible name is the announcement,
where the web hand-rolled `disabled` and got neither.

**This one is measured by hand and is not asserted**, which is the honest part.
A check needs a second page, so twenty-one journal entries, so twenty-one
sessions driven through the API; and raising `DemoContentSeeder` past twenty
would fill a reviewer's demo journal with filler, against the one thing that
seeder is for. An assertion that silently skips when the button is absent is
worse than none, because it reads as coverage. The probe is a browser, the page
request held open, and `document.activeElement` before and after — which is how
every finding in this section was made.

**And the status must not become the field's name.** Both note fields are
labels, so a status inside the label folds into the control's accessible name
and the name then changes every time a save runs. `aria-labelledby` points at
a span holding the words alone. Measured through Chromium's accessibility
tree: `"My private notes"`, with the status beside it rather than in it.

On the phone the journal note is an explicit "Save the note" button that
**disappears** once saved, so the vanishing control is a sighted user's
confirmation and a screen reader's nothing. It announces, like the session
screen's pause and for the same reason — `setAccessibilityFocus` needs a host
node and differs per platform. Whether a screen reader speaks it is unproven
here, with the `tel:` links and the keychain.

`e2e/admin.mjs` and `e2e/coach.mjs` assert the focus and the regions, which is
what is assertable without a screen reader. All five were checked by reverting
the three files and rebuilding; all five go red, by name rather than by
timeout — the region is counted before it is read, because a throw out of
`innerText` is a red run that names a timeout instead of the thing that broke.

### And the same question again, about what is _selected_ rather than what changed

The section above is "a press changed the screen and nobody said so". Its
sibling is "a press chose something and nobody said which", and sweeping the web surface for it — every control whose class changes with its
own state — turned up **seven**. Counted with
`grep -rn 'styles\.\w*On\b\|isActive\|aria-current' apps/web/src --include=*.tsx`,
which is nine lines across six files and seven distinct controls, because two
of those files carry both halves of one. Four were already right and three were
not:

- **The calmer rating, on the session summary.** Measured through Chromium's
  accessibility tree before and after pressing "A little": three buttons,
  `pressed` absent on all three in both snapshots. The chosen rating was a
  background colour and nothing else, so somebody on a screen reader answered
  the one question this screen asks and was told nothing about their own
  answer. It was a **drift**, not a decision nobody made, which is what made it
  findable: the feeling chips one step earlier carry `aria-pressed`, and the
  phone's rating carries `accessibilityState={{ selected }}` — so the two
  surfaces agreed about the chips and disagreed about this, with the web holding
  the wrong half. The same shape as the phone's hardcoded `'#FFFFFF'` and its
  Android-only autofill hint, with the surfaces swapped.
- **The protocol editor's six step tabs.** No `pressed`, `checked`, `selected`
  or `current` on any of them, so an admin editing the product's voice with a
  screen reader could not tell which of the six they were in.
- **The coach portal's sidebar link**, which is styled as the current item and
  said nothing, where the console's nav answers `page`. One link, so this is
  consistency rather than a defect anybody hit.

The four already right, and worth knowing why: `AdminNav` and `BottomNav` both
carry `aria-current="page"`, the session screen's feeling chips carry
`aria-pressed`, and voice setup's choices are **real `<input type="radio">`**
inside their labels — so that last one's checked state is the platform's rather
than an attribute somebody had to remember, which is the only one of the seven
that could not have had this bug.

Two decisions:

- **`aria-pressed` on the rating, not a `radiogroup`.** A radio group would say
  more — that the three are exclusive — and ARIA's own pattern for one asks for
  roving tabindex and arrow-key navigation, which is more surface than the bug,
  and it would make this control a different shape from the chips beside it and
  from the phone's. One rule per surface, as with `HelplineLink`.
- **`aria-current` on the step tabs, not `aria-pressed`.** They are not
  toggles; they select one of a set, which is the thing the two navs here
  already say. A `tablist` of `tab`s would be the fuller answer and brings the
  same keyboard obligations as the radio group — plus a `tabpanel` to point at,
  and `role="tab"` without one announces "tab 1 of 6" and then no panel, which
  is worse than the plain button.

  Be honest about the weak part of that choice: `aria-current` is announced
  most reliably on a **link**, which is where the two navs use it, and support
  on a `<button>` varies by screen reader. `aria-pressed` would reach more of
  them and would say these are independent toggles, which they are not. The
  judgement is that a precise state some readers skip beats a wrong state they
  all announce — the opposite of the risk screen's "grade an ambiguous phrase
  up", because here a false signal is the harm and there a missed one is.

**And `aria-current` cannot be checked through the accessibility tree**, which
is the measurement worth keeping. Chromium's
`Accessibility.getFullAXTree` does not report it at all — measured: absent from
the property dump for these buttons **and** for the console's own nav link,
which has carried `aria-current="page"` since it was written. So an AX-tree
assertion here could not tell the fix from the bug. It is asserted on the DOM
attribute instead, which is what the browser hands its accessibility layer and
the same reason `mobile.mjs` reads `autoComplete` off the DOM.

`flow.mjs`, `admin.mjs` and `coach.mjs` assert the three, and two of them
assert both halves rather than one: all three rating buttons, because a check
on the pressed one alone would pass against a version that marked every button
pressed; and exactly one step tab carrying `aria-current`, following the
selection, for the same reason. Checked by reverting each.

**`admin.mjs` publishes now, and it does it first.** Nothing in the suite
asserted a _successful_ publish — the editor section proved the 422 for an
incomplete draft and stopped there. It runs before the checks that edit copy,
deliberately: those stamp a timestamp into step 3 so a reload can be seen to
have round-tripped, and publishing afterwards would promote
"Which of these are you feeling? (1791…)" to the live version every other
check then reads. Published first, the draft is the live copy unchanged.

The coach check's note is **unique per run** for a related reason: filling the
same text twice is not an edit — the save effect returns early when the field
matches what was loaded — so on a second run against the same database nothing
saved and the status region was legitimately empty. Both scripts were run twice
in a row against one database to prove they do not need a fresh one.

**All seven have been now, and the method is worth keeping rather than the
result.** `pnpm run e2e` and then `pnpm run e2e --no-build` — the second skips
the builds _and_ the reseed, so it runs against whatever the first left behind.
Both passed 7 of 7.

The reason to do it is section 6b, one section down: it spent the guide budget
and asserted a crisis turn is still screened, and it was passing on **leftovers
from earlier sections in the same minute**. That is the class this catches — a
check whose setup depends on state it does not establish itself — and it stayed
green for as long as nothing changed the timing. A green suite says the product
works; a green suite run twice against one database says the suite is measuring
the product rather than the order its own sections happen to run in.

Be plain about what it does not prove: independence from **one** prior run, not
from many, and nothing about a database an older version of the schema wrote.

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

**And there is one limit on a turn the application cannot see**, which is the
proxy's. nginx answers 413 for a body over `client_max_body_size`, before
Laravel and so before the screen — the same refusal as `max:5000`, one layer
further out, where no test reaches. It is **12m** in `deploy/nginx.conf`, about
2,400 times the length that was actually the problem, so it is not one today;
what makes it one again is somebody tightening it to a number that sounds
tidy. The comment beside it used to say "a request body never needs to be large
at all", which is an argument for exactly that, and now says not to.
`deploy/php.ini`'s `post_max_size` is the same number and the two move
together.

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

Step 3 is not answered in prose. The designs give it a grid of twelve feelings
and "Choose up to 3", so `answerKindOf('feel')` is `'feelings'` and the client
posts feeling **ids**, not labels.

**There are thirteen of them, and the grid is twelve.** `FEELINGS` has
thirteen entries; `humiliated` is the only one with `primary: false`, so it
sits behind "See more feelings" and the grid shows the other twelve. Counted,
because this file said twelve in five places and the number of _colours_ is
thirteen too — `FEELING_COLOR` and `FEELING_SWATCHES` both. Where it matters
is below: "a turn naming all of them" is thirteen ids, not twelve, and a
fixture case that listed twelve would be one short of the set.

**And "up to 3" was a rule only the two grids kept.** `toggleFeeling` refuses
the fourth tap and `FeelingId::MAX_CHOICES` was declared and used by nothing,
so `feelingsIn()` took every recognised token: a turn naming all thirteen
recorded all thirteen, the journal's "What you felt" listed thirteen, and
insights counted thirteen for one session — which makes "Feelings you chose
most" a ranking of thirteen things at one apiece. No shipped client can send that, and
that is the point rather than the excuse: a rule only the client keeps is one
the next client does not, which is the same reason the risk screen's browser
copy is a convenience and the server is the enforcement.

It is the first three in the order given, not a refusal. At this step the
answer is a selection, and dropping the fourth is exactly what the screen does
to the fourth tap, so the journal and the insights end up agreeing with what
the person was told they could choose. Three fixture cases pin it — four
feelings, all thirteen (checked: the case lists `humiliated` too, so it is the
whole set rather than the grid), and a different order — because the order is
where the two languages could disagree without a count noticing. Checked by taking the
cap back out of the PHP: all three go red. The guide's word-count heuristic is
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

**And that can be done here now, which matters while CI is held.** The API
takes its connection from the environment and `e2e/run.mjs` passes the
environment through, so the whole suite points at MySQL with env vars alone —
`e2e/README.md` has the command. Measured: **7 of 7, 462 assertions, 0
failures** on MariaDB 10.11, with the locks actually taken rather than
silently skipped.

Two things about reading that result, and the second is the one to copy.

It shows the locks are **issued against a server that honours them** and that
nothing in seven browser scripts breaks when they are, which is strictly more
than a sqlite run where those statements do nothing. The suite is not a
concurrency harness — though it is not wholly sequential either, since
`admin.mjs` triple-clicks Publish and the journal delete sends one request per
entry — and it does not reproduce the pair the locks exist for, a safety stop
and an ordinary turn arriving together. No single browser can drive that.

And **a connection that silently fell back to sqlite would produce an
identical green run**, so the rows are the measurement: afterwards
`stillpoint_e2e` held 18 tables, 15 users, 14 guided sessions, 6 journal
entries and 2 safety flags, while `database.sqlite`'s mtime was from before
the run started. Checking that the run used the thing it names is the same
habit as asserting axe considered `target-size` at all.

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

**And `Plan` decides exactly one thing, which is less than the pricing page
ticks.** `plan` decides something in exactly one place — the session allowance
in `SessionController` — so full sessions a week is the only rule it carries.
The column is _read_ in three: that one, the profile response, and the grant
route, which reads the old value to record it in `plan_changes`. Neither of
those two asks it to decide anything. Four of the nine feature lines on `/pricing` name something else:
`Insights` has no plan check and a Free account has them, `Better voices` is
not gated and both voices are offered to everyone, `Up to 25 clients` is the
item above, and `Shared sessions and notes` is backwards — the portal is gated
by `role`, so the Coach plan grants nothing and the `coach` role grants the
whole portal on Free. Two of the three buttons offer a trial that exists in no
form.

Nobody can be charged, so nothing is mis-sold; it becomes a refund and a
complaint the day billing lands. It is written down rather than fixed because
both ways of fixing it are product decisions — gating Insights takes something
away from everybody who has it today, and changing the copy changes what Plus
is for. `LAUNCH.md` item 7 has the line-by-line, `DECISIONS.md` has the
decision, and the comment above `PLANS` in `apps/web/src/app/plans.ts` says it
beside the data. **Do not read a tick on that page as a rule the server
keeps.** `Plan` is where the rules are, and `LAUNCH.md` item 7 said that page
"says true things" until this was read against the code.

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

**And the safety pause's own words were not on that screen.** The whole chain
existed except the one link a person uses: the route
(`PATCH /admin/protocol-versions/draft/safety`), its validation, a feature test
asserting it can be edited and not emptied, `api.editProtocolSafety()` in
`packages/client`, and `pauseTitle` / `pauseBody` on `ApiProtocolVersion`. The
editor had fields for `main`, two backups, `doneWhen` and `maxGuideTurns`, and
none for those two — so `editProtocolSafety` was a client method **nothing
called**, and the one piece of copy on the crisis screen that an admin is meant
to own could only be changed with a hand-written PATCH.

Which is the mirror image of the classes this file already names: not a setting
the server ignores, but a server capability no screen reaches. The sharp detail
is that `publishProblems()` refuses a draft whose title or body is empty, so
the editor could already **report** a problem with that copy in its problems
list and offered no way to fix it.

Two fields now, outside the step editor because the wording belongs to the
version rather than to whichever step tab is selected, on the same autosave
timer and the same `role="status"` line so one region still covers everything
this screen does. Emptying the title is **refused by the server** and the
screen shows its sentence — "The pause title field must have a value." —
rather than the field being hidden or the empty value silently dropped: this is
the one field here where clearing it is not a saveable state, and an admin who
clears it should be told instead of left thinking it saved.

`e2e/admin.mjs` asserts the fields exist, that an edit round-trips through a
reload, and that an emptied title comes back refused in the server's own words,
then puts the wording back so the draft stays publishable. Checked by removing
the fields: red, naming "0 fields".

Note what the pause screens were already doing right, which is why this is a
missing control rather than a broken one: both read `safety.title` and
`safety.body` from the response, which `SessionResource` fills from the version
the session is **pinned** to. Grepped before writing any of this, because the
likelier bug would have been a screen hardcoding its own copy.

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

**And both settings screens got the plan's name wrong, differently.** The web
read `plan === 'plus' ? 'Plus plan' : 'Free plan'` — three plans, two branches
— so an account granted **Coach** from the console was told it was on **Free**.
The phone read `plan === 'free' ? 'Free plan' : plan` and showed the database's
own `plus` or `coach` to the person. Both on the one screen that reports which
plan somebody has, and both written before `PATCH /admin/users/{id}/plan` made
the other two reachable at all, which is why neither had ever been looked at
with a non-free account in front of it.

`PLAN_LABEL` is in `packages/protocol/src/plans.ts` with the ids, for the
reason feeling labels are there and feeling colours are not: a name is domain,
and two surfaces holding their own copy is how they end up disagreeing. No copy
was invented — they are the names `apps/web/src/app/plans.ts` has always shown
on `/pricing`, and `plans.test.ts` there asserts the two agree so that file
cannot drift from this one.

Left alone: the web's row is labelled "Upgrade to Plus" whatever plan you are
on, so somebody on Plus is offered an upgrade to it. That is copy on a row that
links to the marketing page, which is `LAUNCH.md` item 7's territory and a
product decision rather than a wrong statement about the account. The wrong
statement was the value, and that is what changed.

**The same lens over the session's kind found two more, and one of them is the
journal.** `SessionKind` is two-valued, so a two-branch ternary cannot be wrong
about a value — what it can be wrong about is the word. The console's overview
printed **"Deep · 1 min"** for a `full` session, measured in a browser, and
"Deep" appears nowhere else in this repository: the API's enum is `full`, the
pricing page sells "3 full sessions a week", the home screen warns that
starting something new "uses another full session", and the session screen
refuses with "That is this week's full sessions". An admin reading the overview
to answer a question about somebody's allowance had a fifth word for the thing
the allowance is counted in.

And the web's journal labelled **neither** kind, on the list or the entry,
while the phone's labelled quick on both. That is the surface that matters:
Free gets three full sessions a week, the session screen says "No full sessions
left this week" when they run out, and the journal is the only record of what
they were spent on — so the one screen that could answer "which three" did not
say. The designs label a quick session and leave a full one as the ordinary
case, which is the phone's behaviour and now the web's.

`SESSION_KIND_LABEL` is in `packages/protocol/src/session.ts` beside the type,
and the protocol test asserts something narrower than "every kind has a label":
each label, lowercased, **is** the kind's own name. That is the rule the
console broke, stated as a rule, and it goes red on exactly the word — checked.
The journals compose from `SESSION_KIND_LABEL.quick` rather than indexing by
the entry's kind, because labelling only one of the two is deliberate there.

`flow.mjs` asserts it in both directions, which is the half worth copying: that
every quick row is labelled **and** that the full one is not. The second
assertion stays green when the label is missing altogether — correctly, since
that is the other check's job — and goes red when a label is applied to every
kind. Both were checked by breaking them one at a time; without the second, a
label on everything would have passed.

**And the rating had the same shape with an answer missing.** The web's entry
screen read `calmerRating === 'yes' ? ' · FELT CALMER' : ''`, so a session
rated **"a little"** said nothing there at all — while the phone's entry screen
said "A little calmer" about the same row. Measured on a demo entry rated
`a_little`: "THURSDAY · 5 MIN · QUICK SESSION", with the answer the person gave
nowhere on the screen. The summary offers the three side by side a moment
earlier, so the one that is neither yes nor no is the one a screen is most
likely to drop.

Two maps, not one, and that is the part to keep. `CALMER_ANSWER_LABEL` is
Yes / A little / No — answers to "Do you feel a bit calmer?", which both
session screens had their own identical copy of, caught before they drifted
rather than after. `CALMER_JOURNAL_LABEL` is "Felt calmer" / "A little calmer"
/ `null`, which is a statement about a session somebody reads back weeks later.
`no` is `null` because there is nothing to say: an entry with no tag is a
session that did not help, and "Did not feel calmer" is a judgement on
somebody's own journal the designs do not make. A protocol case asserts the two
maps never agree on a rating, because a screen reaching for whichever it
imported first is how they would collapse into one.

`calmerJournalLabel()` takes `string | null`, because that is what the API
resource is typed as, and reads an unrecognised value the same as `no` — a word
this version does not have is not one to invent on somebody's journal.

Left as it is: both journal **lists** and both home previews show only
`yes`, and the two surfaces agree on that. A list row is a glance and the
designs tag only the one; changing it is a design decision, not a false
statement. The console's `RESULT_LABEL` is left too — "No change" is a result
rather than an answer, and that column also carries `safety` and `unrated`,
which are not ratings at all.

**And then the screen that grants a plan was found still naming them itself.**
`apps/web/src/app/admin/users/Accounts.tsx` had its own `PLANS` list and its
own `PLAN_LABEL` — written the same day the protocol's was added, and missed
when the two settings screens were moved onto it. Nothing was wrong on screen,
because the values agreed; what was wrong is that the console is where a plan
is _granted_, so it is the screen a disagreement would start on. It reads
`PLAN_IDS` and `PLAN_LABEL` now.

So the rule is enforced rather than remembered:
`apps/web/src/lib/one-name-per-domain-value.test.ts` reads every file in both
surfaces and asserts that the only `*_LABEL` maps declared outside
`packages/protocol` are the two the console needs, each with its reason in the
test — a role, which the protocol has no notion of (`EnsureStaff` and
`isStaff()` are the API's, and no other surface shows one), and the overview's
result column, which is not a rating at all: it carries `safety` and `unrated`
beside the three answers. It is `RotateEncryptionKey::COLUMNS` with the same
shape, refusing what it does not cover so the next one has to be argued for.
Its third case asserts the protocol still exports the five maps, because a
green sweep would otherwise mean just as much if they had been deleted as if
they had been consumed. Checked by declaring one more in the console: red,
naming the file and the constant.

### The last `slice` on a person's own words was on the safety queue

`parity/cases.json` records that a journal title cut with `slice` ended in half
a character — `slice` counts UTF-16 code units — and `firstCharacters()` in
`packages/protocol/src/utterance.ts` is the fix, used by `recordable()` and the
title. **The console's queue was still doing it.** Its row preview was
`text.slice(0, 48)`, and that is the screen where somebody reads what a person
said at the moment they said they were not safe.

Measured in a browser, with a flag raised on an emoji-led utterance: the row
read `“I😢…😢\ud83d…”` — a lone high surrogate, which a browser draws as a
replacement glyph. And the second symptom is the one a reviewer would actually
notice: 48 code units is twenty-four emoji, so the preview held **no words at
all**. A reviewer's first read of a disclosure is that preview.

It was the only one left. Swept both surfaces: every other cut on a person's
text is `firstCharacters()` or, on the PHP side, `mb_substr` — the one other
`slice` is `level.slice(1)` capitalising an enum value.

Three things about the check, and the second is the lesson:

- **The fixture's single leading `I` is load-bearing.** It is what puts the
  48th code unit inside the 24th surrogate pair. Written without it, an even
  number of units precedes the emoji run, `slice` cuts cleanly between two of
  them, and the broken-character assertions pass against the bug — checked,
  they did, and only the "reaches the words" one went red.
- **There is no assertion about U+FFFD**, and there was one. The replacement
  glyph is how Chromium _draws_ a lone surrogate; `innerText` hands the
  unpaired unit over as it is, so a glyph assertion stays green against the
  bug. The surrogate is the measurement; the glyph would have been a check
  that cannot fail.
- **"Still previews what was said" is a control**, green against the bug on
  purpose: a cut returning nothing would pass the surrogate assertion and show
  a reviewer no excerpt at all.

Writing the detector went wrong first in a way worth keeping: "strip the valid
pairs, then look for a leftover" with a `/gu` regex **cannot work**, because in
unicode mode a character class will not match half a code point, so the replace
matched nothing and every preview read as broken. It failed loudly against the
fix rather than passing against the bug, which is the better of the two ways
for a check to be wrong. It iterates by code point now — the string iterator
yields an unpaired surrogate as a one-unit string.

The preview also means 48 **characters** now, so an excerpt full of emoji shows
as much text as one without, which is what the number always meant.

### And the web origin still named its framework

`X-Powered-By` is written down above as the API's trap — `header_remove()`
rather than `$response->headers->remove()`, with `expose_php=Off` in
`deploy/php.ini` and an HTTP assertion in `deploy/smoke.mjs` because only one
of the two travels with the code. **That rule reached one of the two origins.**
Measured with the app running: `GET /app/journal` answered
`X-Powered-By: Next.js` while the API answered nothing — and the web origin is
the one a visitor's browser talks to on every page.

`poweredByHeader: false` in `apps/web/next.config.ts` is the whole fix, and it
is the same argument made for the API rather than a new one: not a
vulnerability on its own, free reconnaissance, one line to stop giving. What
makes it worth writing down is the shape — a one-place rule applied in one
place, which is this file's most repeated finding.

Asserted twice for the reason the API's four are: `e2e/privacy.mjs` on the
origin a browser loads, and `deploy/smoke.mjs` over HTTP, because what neither
a unit test nor a browser check can see is a proxy or a CDN putting a header
back. Checked by taking the line out: red, quoting `x-powered-by: Next.js`.

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

**And the console scrolled sideways on a phone, which axe does not check.**
Measured on every route at both widths: at 390 the three console table screens
and the coach portal dragged the **document** — `/admin` by 26px,
`/admin/safety` by 34px, `/coach` by 44px and `/admin/users` by **284px**,
which takes the heading and the navigation off the side with it. The tables are
`width: 100%`, which cannot shrink below their content's minimum.

The audit was clean on all of them, and that is the point rather than a
complaint about axe: a page that scrolls horizontally is a valid page, the same
way a screen with no live region is. It is only wrong once you ask what the
screen is for, and somebody checking the safety queue from a phone is what
this one is for — the overview reporting how long the oldest open flag has
waited implies it is checked with some urgency.

`apps/web/src/components/TableScroll.tsx` is the wrapper, one component for
six tables because the `overflow-x` is not the subtle part and the ARIA is: a
box that scrolls has to be **focusable** or a keyboard user cannot reach the
right-hand end of the table, so it carries `tabIndex={0}`, `role="region"` and
a name. Measured after: at 390 the region takes focus and ArrowRight scrolls it
from 0 to 304 with the page staying put; at 1440 it is not scrollable at all,
so the desktop layout is untouched. It is **not** a responsive redesign —
stacking a table into cards is a design decision and the artifacts give no
narrow layout for these screens.

`a11y.mjs` asserts it now, and the way that went wrong is worth more than the
check. It was added calling `bad()` and nothing else — and `a11y.mjs` is the
one browser script that does not end with `report.mjs`'s `finish()`, because
it counts route-and-palette combinations rather than named assertions. So it
keeps its own tally, and a run printed **six FAIL lines, then "CLEAN", and
exited 0**: a check that could not fail, which is worse than no check. Caught
only by reverting the fix to watch the assertion go red. Every `bad()` in that
script now counts toward one number, and the note beside the summary says so.

**And the audit ran `wcag21aa`, which leaves out the one criterion a
phone-first product should be measured against.** WCAG 2.2's 2.5.8 Target Size
(Minimum) asks for a control at least 24 by 24 CSS pixels, or spaced far enough
from its neighbours to stand in for it, and nothing here checked it — the
`/app` screens have only a phone layout, so it is the criterion with the most
surface. The tags go up to `wcag22aa` now.

Nothing was wrong, and the measurement is the point rather than a fix:
**sixteen controls across six routes are under 24px at 390 and axe exempts
every one of them.** The consent and voice checkboxes are 22 by 22 — and they
sit inside their own `<label>`, so the target a finger lands on is the label's
padded box, which is why measuring the `<input>` reports a failure nobody can
experience. The rest clear the spacing exemption, by 6px at the tightest:
`/welcome`'s two text buttons are 22px tall with 30px between their centres.
Six pixels is what a padding change spends without noticing.

**`target-size` is `enabled: false` in axe's own defaults**, which is the trap
in adding it. Naming `wcag22aa` in `runOnly` turns out to be enough on its own
— measured in 4.13, where axe runs a disabled rule a tag selects — but that is
observed behaviour rather than a promise, so the rule is enabled explicitly as
well. Neither of those is evidence: the script asserts that axe **considered**
the rule on at least one combination, because a rule that never ran reports no
violations and reads exactly like a clean page. That is the same shape as the
sideways check that could not fail, one paragraph up, which is where the
assertion came from.

Re-run the audit after UI work: `node e2e/a11y.mjs`, with the app built and both
servers up (see `e2e/README.md`). It covers every route in both palettes at 390
and 1440, plus **320 for reflow alone**, and the last run was clean across all
of them. It signs in as each role and resolves the client, invitation and
journal-entry routes from real rows rather than hard-coding an id.

**320 is the width WCAG names and the one that was missing.** SC 1.4.10 Reflow
asks for no two-dimensional scrolling at 320 CSS pixels — 1280 at 400% zoom,
and also a real phone — and this script measured 390 and 1440, so the
criterion's own width had never been looked at. The sideways check above is
what covers 1.4.10, because axe cannot: reflow is a layout question rather than
a rule about markup, which is the same reason the audit was clean on four
console screens that dragged the document at 390.

**Two routes dragged the document at 320, and the second one is the lesson.**

The first is the **marketing landing page**, by 57px: its header's wordmark and
four nav items need 377px and did not wrap. It wraps now — two lines of CSS,
not a layout, because that page is slated for a design rebuild (`LAUNCH.md`
item 7) and a rebuild is not a reason to let it scroll sideways on a 320px
phone in the meantime.

The second is **`/app/settings`**, by 30px, and a hand-written probe said that
screen was clean. The probe signed in as the demo account and the audit
registers its own: `you@stillpoint.test` is 19 characters and fits, while
`a11y+1759…@example.com` is 28 and does not. Measured with a 31-character
address: the `settingValue` span holding it was 278px wide with its right edge
357px into a 320px viewport — on the screen that also carries "Delete my
account". An address is one long token with nowhere to break, in a flex row
that will not shrink below its content, so the fix is `overflow-wrap: anywhere`
**and** `min-width: 0` — that second half is the one people leave out, because
a flex item's default `min-width: auto` refuses to shrink however it is allowed
to wrap.

So **a probe is not the check**, and the reason it missed this is the reason
`DemoSeeder` makes nothing: a fixture that happens to fit is a measurement that
passes whether or not the layout works. The audit found it because it registers
a real account rather than borrowing a tidy one.

And the summary line had to be reworded, which is the same class one turn
later. It read `every route reflows at 320 (20)` and printed **directly beside**
the `/app/settings` FAIL: the number counts coverage, not passes, so the
sentence claimed something it had not checked — in the summary of the script
whose whole subject is screens that state things they do not know. It says
"was measured" now.

**And one of the two runs it took was a build, not the product**, which is
worth more than either finding. `next build` was run while a `next start` was
serving that same `.next`, and the build it produced was **missing
`HelplineLink.module.css` entirely** — the audit then reported `target-size`
(serious) on `a[href$="tel:988"]` at 1440, in both palettes, on the settings
screen's crisis numbers.

Measured, because the symptom points at the code and the cause was not there:
the links carried their classes (`HelplineLink-module__…__helpline`) and
computed `display: inline`, `padding: 0px`, `background: transparent` — so
21px tall with three inline line boxes each, which is a genuine 2.5.8 failure
of a page that was never built properly. Four stylesheets had loaded and
**nothing had 404'd**, so there was no MIME warning and no console error to
notice. `rm -rf apps/web/.next` and a rebuild put the rules back, verbatim, in
the first chunk grepped.

So: **do not rebuild `apps/web` while something is serving `.next`**, and if a
browser check reports a violation that reads like missing CSS, check the build
before the component. It is the `verify:clean` failure — a stale build
directory making a tree look different from what it is — arriving inside the
web app's own output rather than in `packages/*/dist`, and it is quieter,
because there nothing resolves and here everything resolves and just has no
styles.

The 320 pass is **reflow only, in light only**, and both are deliberate rather
than thrift: an axe run there would repeat 390's findings almost exactly, which
triples the slowest part of the script to re-report what it already said, and
reflow does not depend on the palette. And it is **counted**, with the count
asserted against the number of routes visited — for the reason `targetSizeRan`
is, because a pass that quietly stopped running reports nothing and reads
exactly like sixteen clean routes. That is this script's own history: it once
printed six FAIL lines, then "CLEAN", and exited 0.

**"Every route" was a claim about this file, checked against this file.** The
four route lists at the top of `a11y.mjs` are hand-written and the summary
prints "N routes" from their length, so for as long as that script existed its
own claim to be complete was circular — and it had already been wrong by one,
which is the paragraph below. So the `page.tsx` files are the authority now: a
dynamic segment matches any one path segment, which is what the run-time
resolved routes supply, and a screen the lists do not mention at all is a
failure counted in the same tally as everything else. Checked both ways —
removing `/app/insights` from the list goes red naming it and exits 1, and
pointing the finder at a directory with no `page.tsx` goes red on "0 page.tsx
files", which is the "a check whose input is empty stops checking in silence"
half.

It compares against the **declared** set rather than against what was audited,
deliberately: a route whose role is unavailable is already reported as skipped,
and failing it here would say the same thing twice in a different voice.

**"Every route" was 19 of 20 for a while**, and the missing one is the one
worth knowing about: `/app/journal/[entryId]`, where somebody reads back their
own session and writes a note on it. It was the only route needing a row to
exist, and `DemoSeeder` deliberately makes no content, so the script's own
account had never had a session — the summary said every route was clean and
that screen had never been looked at. The other two dynamic routes were already
resolved from real rows; this one now finishes a quick session through the API
first, by the same method. A route list is exactly the kind of sentence this
file keeps catching: it reads as complete and nothing checks it against the
`page.tsx` files.

**Four routes under `/app` had one title between them**, and that is the same
point as the two paragraphs below: axe's `document-title` asks whether a page
has a title, and WCAG 2.4.2 asks whether the title says which page it is.
`/app`, `/app/journal`, `/app/insights` and `/app/journal/[entryId]` all
answered to the layout's bare "Stillpoint", so somebody with the journal and
two entries open had three identical tabs, and a screen reader announced the
same word arriving at each. The audit was clean on all four and correctly so.

The cause is worth knowing because it will recur: `metadata` **cannot be
exported from a `'use client'` module**, and these screens are client
components. `/app/settings` and `/session` already had the answer — a server
`page.tsx` holding the metadata and rendering the screen beside it — so the
journal and insights now have the same shape, and the two dynamic routes
(`[entryId]`, `coach/[clientId]`) are server components already and just
needed the export.

Both dynamic titles are **static strings**, which is the part not to tidy. The
entry's own title is the first words of what somebody said at step 1, and a
document title reaches the tab, the window chrome and the browser's history —
which is the one place this product's content must not turn up, the whole page
being behind a token for that reason. The same for whose client a coach is
looking at. `/app`, `/coach` and `/admin` keep their area's name, because each
is that area's home and "Stillpoint" is what the home screen is.

**And the audit being clean on it says less than it sounds**, which is the same
point as `axe` not catching a screen with no live region. The note's visible
label was not its programmatic one: the `<label>` is the textarea's sibling
with no `htmlFor`, so the accessible name fell back to the placeholder —
"Anything you want to remember." — and somebody driving the page by voice
asking for "My note" matched nothing. Measured through Chromium's own
accessibility tree, before and after: `name="Anything you want to remember."`
became `name="My note"`. `axe` passes either way, because a placeholder is an
accepted name source.

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

**It is launched by `e2e/desktop.mjs` now**, which is where that sentence used
to end. It said "it has been launched under Xvfb here, which proves the server
starts, the app renders and a session survives a relaunch" — every word true
once, by hand, on a machine that no longer exists. That is the ritual people
skip, which is the argument that produced `e2e/run.mjs` and
`scripts/verify-clean.mjs`. `apps/desktop` had one unit test, over the two
decisions worth asserting in isolation, and nothing that started the app.

Five things only a running app shows, and the third is the one that matters:

- **The bundled server starts.** Nothing else here runs it: the web checks use
  `next start` against `.next`, which is a different build with a different
  entry point, and `next start` is not supported alongside
  `output: 'standalone'`.
- **The renderer has no Node**, asserted from inside the page. Be precise about
  what that catches: measured, flipping `sandbox` to false **and**
  `nodeIntegration` to true changes nothing visible, because
  `contextIsolation` keeps Node out of the page's own world. Turning that off
  as well puts `require` and `process` in the page and the assertion goes red.
  So it guards the combination that actually exposes Node, not each option.
- **The navigation pin, in the real main process.** `navigation.test.ts` covers
  `sameOrigin`; this covers the `will-navigate` handler that calls it. The URL
  it uses smuggles the **API's** host after the `@` rather than a name that
  does not resolve, because a host that cannot be reached would make the
  assertion pass whether or not the pin works. Checked by putting the prefix
  check back: the window navigates, and `{"message":"Unauthenticated."}` —
  another origin's response — renders inside this app's frame.
- **`window.open` cannot hand the OS a `file:` URL**, and no window opens.
- **`localStorage` survives a relaunch**, which is the whole reason the port is
  fixed rather than whatever the operating system offers.

**And nothing had ever signed in, which hid the one failure that makes this
app unusable.** Every assertion above holds with the API refusing this origin
outright: they check the window, the pin, the schemes, the port and the
headers, and not one of them needs the API to answer. The window _is_ its own
origin — `http://127.0.0.1:8735`, fixed for exactly that reason — so every
call it makes is cross-origin and `CORS_ALLOWED_ORIGINS` is a list that never
says `*`.

Measured by taking `:8735` out of that list and re-running: the token comes
back **null**, nobody can sign in at all, and `/app/settings` reads "Could not
reach Stillpoint. Check your connection and try again." — the connection
sentence, about a configuration line, on the screen the Help menu sends
somebody to when they are upset. Every other desktop assertion stayed green.
So section 7 signs in through the app's own screens and asserts the token,
which is the API having answered this origin.

It also loads **every path the menu can reach**, in the real window. Those
were written out at five call sites in `main.ts` — the start path, the global
shortcut, two menu items and the Help item — so the shell held its own copy of
`apps/web`'s route names with nothing comparing them, and `apps/desktop` does
not depend on `apps/web` at all. A renamed route is a menu item that loads
Next's not-found page **inside** the window signed in to somebody's journal,
which the navigation pin allows because the origin is the same: "the window
did not leave" is not the check, the content is. `APP_PATHS` in
`navigation.ts` is the one list now, `navigation.test.ts` asserts each entry
has a `page.tsx` under `apps/web/src/app` (checked by renaming one: red,
naming the path), and `desktop.mjs` imports that same list from the app's own
`dist/` rather than keeping a second copy.

The Help item is why it is a list rather than a comment. Its label — "If you
need someone now" — was written against the phone's settings screen and
pointed at the web's, which had no crisis number on it at all: a target that
resolves and is the wrong screen, which is the same class as a rename. So the
last three assertions are that item's whole promise, in the build only the
desktop serves: the section is there, there are three `tel:` links, and they
are 9-8-8 and 911 rather than another market's. `flow.mjs` asserts those on
the web — against `next start` and `.next`, a different build from a different
directory, which is the same reason section 6 re-checks the headers here.

The two halves are independent, which is what makes them worth having
separately: reverting the web screen's helpline block turns the crisis
assertions red with sign-in still green, and dropping the origin from CORS
turns sign-in red first. Both were checked.

It needs a display, so `run.mjs` wraps it in `xvfb-run` and CI does the same.

**The first version of it hung in CI for the job's whole 25-minute limit**, and
the cause is a property of the app worth knowing. `main.ts` takes a
single-instance lock, and a copy that cannot get one says so and **quits
without opening a window** — right for a product that must not serve one
journal on two ports, and a trap for a check that launches twice. A launch
killed rather than asked to quit can leave `SingletonLock` behind, and then
every later launch exits at once while Playwright waits for a window that is
never coming. It passed here and hung there, which is the shape of a race.

Three things in `desktop.mjs` answer it, and the third is the one that does not
depend on having guessed right:

- **A user-data directory per run**, in `mkdtemp`, shared by both launches in
  that run. A stale lock cannot cross runs, and section 5's assertion becomes
  about what this run stored rather than what an earlier one left.
- **`stop()` asks the app to quit and waits**, bounded, before relaunching —
  rather than leaving Playwright to kill it, which is what leaves the lock.
- **A deadline for the whole script** (`DESKTOP_DEADLINE_MS`, six minutes),
  plus `timeout-minutes` on the CI step. Checked with
  `DESKTOP_DEADLINE_MS=2500`: it prints what it was doing and exits 1, so a
  hang is a red run rather than a cancelled job.

And it launches the app's **own** Electron. `require('electron')` returns the
binary's path and **downloads it synchronously if it is missing**, so letting
Playwright resolve one meant a check that could fetch a different Electron from
the one the app pins, mid-run. Resolved up front now, and a missing binary is a
sentence and a skip rather than a stall — `electron` is the one install script
`pnpm-workspace.yaml` allows to run, and where egress to its release host is
blocked the binary is simply absent.

**It has never been packaged or run on macOS or Windows**, and there is no
installer, signing, notarisation or auto-update — each of those costs a
certificate or a server rather than a line of config. A green `desktop.mjs`
means "this starts and holds its rules", not "this ships"; `LAUNCH.md` item 8
is still item 8. Its README says so; do not let `pnpm run build` passing stand
in for it.

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

**And a refusal that did not come from this application was not an
`ApiError` at all.** `request()` parsed every body with `JSON.parse` before
looking at the status, so nginx's HTML error page threw a `SyntaxError` and no
`ApiError` was constructed. Measured: 502, 504 and 413 each arrived at a screen
as a `SyntaxError`, which made `describe()` say "Could not reach Stillpoint.
Check your connection and try again." about a server that had answered, and
made every status-based branch unreachable — the 5xx sentence added the same
day, `isUnauthenticated`, `isConflict`. The deployment is nginx in front of
PHP-FPM, so a 502 is what a restart looks like, which is what a deploy is.

A refusal's body is parsed defensively now and a **success** is still parsed
strictly, which is the other half of the decision: a 200 whose body is not JSON
is this application misconfigured, and returning `{}` would make the journal
say "Nothing yet" rather than that it could not read. That is the absence class,
so a throw is the honest answer. `packages/client/src/proxy.test.ts` pins both
directions; three of its six go red with the strict parse put back.

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

**And a 500 showed somebody the words "Server Error".** The rule that the
API's own message wins has one documented exception — the framework answering
instead of the application — and the 429 branch was the only place it was
applied. Measured with `app.debug` off, which is what a deployment runs:
Laravel answers `{"message": "Server Error"}` for anything that is not an
`HttpException`, so `describe()` handed those two words to somebody part-way
through being asked why they are upset. The thrown exception's own message is
**not** leaked, which was checked separately.

A 5xx also must not get the empty-answer sentence. "Stillpoint would not do
that. Reload to see where things stand." describes a refusal the server
declined to explain, which is the `abort(404)` convention; a 500 is Stillpoint
trying and breaking, so nothing declined, and reloading is wrong advice because
the request failed and nothing moved. So a 5xx has its own sentence, named once
in the file so the two copies cannot drift on it.

**`parity/refusals.json` had a 500 case and it covered the wrong shape.** An
empty message — which a deployment never sends — and therefore agreement with
the wrong answer. That is "a comment is not a case" with the case present: a
fixture entry for a shape the hazard does not take reads as coverage and is
not. There are four now (`Server Error`, empty, a 502 from whatever sits in
front, a 503), and all four go red with the branch removed.

The 405 is the same class as the two framework 404s and is stripped beside
them: "The GET method is not supported for route api/journal/01m43t….
Supported methods: PATCH, DELETE." Nothing in a shipped client sends one, so
that one is consistency rather than a measured user-facing bug — the place it
becomes reachable is a client built against a different version of this API,
which is exactly who would be shown it.

Three wordings are deliberately **not** routed through it, and the distinction
is the one from "A screen must not report an absence it only failed to read":
these are statements about an absence, not refusals. The role and plan trails'
"Could not read…", the home screens' "Could not check whether you left a
session open", and the invite screen's 404-and-410-only branching.

**The fourth was on that list wrongly, and the excuse is the interesting
part.** It read "the static 'Could not load your journal' lines, which have no
error object to describe" — and **six** screens bound the error and threw it
away before saying "Check your connection." about a request that had arrived:
both journals, both insights screens and both home screens' journal preview.
For the two that genuinely had none, the reason was circular — they had no
error object because they did not bind one, and the throw carries it.

"Could not load your journal." is right and stays: it is the statement about
an absence, and the screen should make it. What was invented is the reason
after it. So `describeLoad(what, e)` is the second function in that file —
`Could not load ${what}.` and then the server's sentence, dropping
`describe()`'s own "Could not reach Stillpoint" clause in the connection case
because this has already said what failed. Five cases in
`parity/refusals.json` under `load`, asserted by the same test and so byte-for-
byte identical on both surfaces.

The case that makes it matter is the **429**: the authenticated routes share one
budget keyed on the account, not the token, so somebody paging a long journal on
two devices can spend it — and then be told their network is bad. That is the
same measurement that moved the turns route out of that group.

**And the phone's consent screen was missing both halves the web's has had.**
A bare `} catch {`, so an expired token sent somebody to "check your
connection" rather than to sign in, and a 422 naming the consent item they had
not accepted said the same thing — on the screen that gates the whole product
and prints the crisis numbers. It matches the web's now. Note the direction:
the `describe()` rule arrived on the phone first and the web caught up, and
this is the one screen where it went the other way.

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
them. Step 3's answer kind is the one that bites: it is a grid of feelings
and "choose up to 3", so the client posts ids, and a language that
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

**And there is one part of the protocol the fixture structurally cannot
reach**, which is worth knowing before trusting it as the whole comparison.
The journal's display rules live on an Eloquent model on the PHP side —
`JournalEntry::listSummary()` — rather than in `app/Domain`, and
`tests/Unit/ParityTest.php` is a plain `PHPUnit\Framework\TestCase` with no
application booted. So the fixture compares the Domain and the journal's rules
sit outside it.

They had already diverged. `listSummary` in TypeScript guarded on `undefined`
and the PHP guards on `null` **and** `''`, so an empty belief read `“”` — a
pair of quotation marks with nothing between them — on the client and
"Session" on the server. Four surface sites rendered the same `“”`, and the row
filter beside them drops an empty value rather than quotation marks around
one. Measured, and then measured the other way: a whitespace-only answer is
refused **422** before anything is recorded, because the route validates
`utterance` as `required` and Laravel trims — so the input is not reachable
through a turn today.

Fixed anyway, and pinned on both sides, for the reason `'ca'` is in that
fixture: two implementations of one rule disagreeing is the thing that is
wrong, and whether a current client can produce the input is a separate and
more fragile question. Each case goes red against the other language's old
behaviour — checked both directions. Whether the journal's rules should move
into `app/Domain` so the fixture can reach them is a change to where a rule
lives rather than to what it says, and it is written at the function rather
than in `DECISIONS.md` — grepped, that page has no entry for it, and by its own
definition it holds what is blocked on somebody _choosing_ something. This is
an engineering call nobody is waiting on.

**It was found by asking which protocol exports nothing consumes.** Measured:
**53 of the 114** exports of `packages/protocol` have no caller in either
surface, the desktop shell, `packages/client`, the `e2e` scripts or
`parity/generate.mjs` — they are exercised only by their own TypeScript tests.
Much of that is the port's specification doing its job, and some is covered
transitively (`mustStop` and `mustFlag` through the risk cases, `nextStep`
through the step cases). But it is also the shape of `listSummary`: a second
implementation of a rule whose PHP twin is the one every surface actually
renders, called by nothing, compared against nothing. Reading the TypeScript
to learn a rule is reliable only where the fixture covers it.

**The same sweep found a second one, on the queue.** `byUrgency` in
`packages/protocol/src/safety.ts` sorted by severity and then recency and
stopped there, where `SafetyFlag::scopeByUrgency()` orders `severity DESC,
raised_at DESC, id DESC`. The third key is the one the paging section of this
file is about: a cursor is built from the ordering columns, a tie with no
tiebreaker makes a page repeat a row or skip one, and on this list a skipped
row is a flag no reviewer sees. Its docstring stopped at "then most recent" and
read as if that were the whole rule.

Nothing calls it, so it was never a live defect — the queue is paged by the
server and the console renders what it is told. What it was is the second place
in one sweep where the unconsumed half of the protocol had drifted from the
half that runs, on a rule this file writes about at length. Two is enough to
stop calling it a slip: it is what "unconsumed and uncompared" costs.

It has the third key now, and a case for a same-second tie that passes the list
in both orders — because `Array.prototype.sort` is stable, so without a
tiebreaker the answer was the caller's input order, which is not a settled order
across two requests. Red without it, checked. Ids are ULIDs, which sort
lexicographically in creation order, so descending by string is the database's
`id DESC`.

**And then the third one, which is what makes the pattern legible.** `byNewest`
in `packages/protocol/src/journal.ts` sorted on `occurredAt` alone, where
`JournalEntry::scopeNewestFirst()` orders `occurred_at DESC, id DESC` — and
`JournalApiTest::test_paging_is_stable_when_entries_share_a_timestamp` is the
PHP half, so the rule was already pinned on the side that runs. Same fix, same
case passing the list in both orders, red without it, checked.

Counted, because "two of two" is the kind of sentence this file keeps catching:
`grep '\.sort(' packages/protocol/src` returns **three** call sites, and the
split across them is the finding. The two exported list-ordering functions,
`byUrgency` and `byNewest`, are the two that had drifted — nothing calls either.
The third is inside `insights()`, orders feelings by count and then by label,
**has** its tiebreaker, and is one of the rules `parity/cases.json` compares
against the PHP. So of the orderings here, the compared one was right and both
uncompared ones were wrong.

That is worth more than the three fixes. The sweep was looking for unconsumed
exports and found a property instead: the half nothing calls is the half nothing
corrects, so a rule written down there decays in one direction while reading as
authoritative the whole time — and the paging section of this file is at length
about exactly the key both of them were missing. Prefer the PHP, or the fixture,
over this package when they disagree about a rule nothing consumes.

**And the same sweep's last stop was `entryFrom`, which had lost two fields
rather than a sort key.** It is the TypeScript half of
`JournalEntry::fromSession()`, and it differed in two places that are not
symmetrical:

- **`sharedWithCoach` was hardcoded `false`**, which is _the_ bug the PHP's own
  docblock records — "it was hardcoded `false` here, which is how 'Share every
  session' came to share nothing". That was fixed on the side that runs, where
  the method takes the decision as an argument; this side kept the hardcode and
  had no slot in `EntryContext` to pass anything into. `sharesNewEntry()` is one
  module over in the same package, exported, and parity-compared over all three
  settings against both pairing states. Note which way it fails, because it is
  the direction that let it survive: hardcoding `false` shares nothing, so the
  drift was invisible rather than dangerous. `EntryContext` carries it now,
  defaulted `false` to match the PHP signature and because an entry nobody
  decided about is not shared.
- **`whatHappened` was not on the interface at all**, so the answer to step 1 —
  the longest thing a person writes in a session — was dropped on the floor.
  `App\Models\JournalEntry` stores `what_happened`, `JournalEntryResource`
  serves it, and both entry screens render it as the first row. What the type
  carried instead was `title`, which is `firstCharacters(text, 60)` **of** that
  field, so the entry held a cut of the answer and not the answer.

Which is the fourth and fifth findings from one question — "what does nothing
consume?" — and together with the three orderings they are the argument for the
paragraph above rather than two more fixes. Both go red by name against the old
behaviour, checked.

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
thirteen feelings colours at all.

## Commands

```bash
# Web and packages
pnpm run check   # build:packages, then format:check + lint + typecheck + test
pnpm run build   # every workspace project, packages first

pnpm run verify:clean  # all of that from nothing built — before a push

# API (from apps/api)
./vendor/bin/phpunit     # the domain tests
./vendor/bin/pint --test # formatting, as CI runs it

pnpm run check:mysql  # the migrations and the PHP suite on a real MySQL-family
                      # server rather than sqlite — needs one, so not in `check`
```

`e2e/` holds seven checks against a running API — `pnpm run e2e` runs all of
them, building what is missing, reseeding, starting the three servers and
tearing them down; `pnpm run e2e flow admin` runs a subset and `--no-build`
skips the builds and the reseed. See `e2e/README.md`. One of
them, `mobile.mjs`, is the only thing that executes `apps/mobile` at all: it
drives the Expo web export in a browser at a phone's width. It does not touch
anything native, and `apps/mobile/README.md` lists what that leaves.

**And it was ten of eleven again**, on the one screen that is a branch off the
welcome screen rather than a step in the flow: nothing reached
`welcome/forgot.tsx`. `LAUNCH.md` claimed all eleven were rendered, in the
bullet that says that sentence "was false until recently". Section 1b walks it
now, and what it asserts is the rule rather than that the screen draws — the
answer is the same whether or not the address has an account, compared across
one that has one and one that does not, which is the surface half of what
`forgotPassword()` throwing the broker's result away buys.

Two things in writing it are worth more than the section. **expo-router leaves
every screen it has shown mounted**, so `getByLabel('Email')` was a
strict-mode violation on two elements after one push and three after two —
and `.first()` would have picked the stacked one, which is 0x0 rather than
absent (measured; the pushed field is 350x48). The locator asks for the
visible one, and the section ends by reloading the app rather than unwinding
the stack, the way section 5b already does. Without that reload the next
`press('Create an account instead')` clicked a stale button and the hint read
`current-password` — a check that had quietly stopped being on the screen it
named.

**And the equality assertion passed vacuously the first time.** It compared
`said.slice(said.indexOf('If that address'))`, so with that sentence gone
`indexOf` returned -1 and `slice(-1)` handed back the body's last character —
one character, the same for both addresses, equal. Measured by editing the
screen to print the address itself: "told a link is on its way" went red and
"told exactly the same" stayed green, on exactly the leak it exists to catch.
It returns a sentinel naming the address now, so two of them cannot match, and
both cases go red together.

**Two of the phone's eleven screens were not among them** either, earlier,
which is the same gap `a11y.mjs` had and found the same way — by listing the files rather than
believing the sentence. The script pressed the Journal tab and stopped, so
`journal/[id].tsx` and `(tabs)/insights.tsx` had only ever been rendered by
`expo export`: that proves the module bundles and survives a first render with
no data, and says nothing about the screen with a real entry on it. Neither
was broken. What was missing was the evidence, and on this surface a browser
check is the only evidence there is.

What the new sections assert is what matters on those screens rather than that
they draw: the note round-trips (the Save button only disappears once the saved
entry comes back matching the field, so it is the round-trip and not an
optimistic render), and the sharing control is held to **both** coach-sharing
settings, because the server refuses turning sharing on under "Never share" and
a screen that offered it anyway would be offering something that cannot work.
Insights is asserted to count the two feelings that were chosen, not to count
the ten that were not, and to name **no** recurring belief from a single
session — the threshold is two, and a threshold nothing checks is one that can
quietly become one.

Two traps in writing those, both the shape this file keeps finding. The
first assertion read `/Noticing/` and passed while the journal was still on
screen, because "Noticing" is that tab's own label and so is on every tab — the
same false positive `admin.mjs` warns about where it looks for the trail row of
its own account rather than an arrow anywhere on the page. And the heading is
uppercased in CSS, so `innerText` returns "FEELINGS YOU CHOSE MOST" and a
case-sensitive match on the source string fails. Neither was a bug in the app;
both were a check asserting something it was not looking at.

The entry screen is **not** inside the tabs layout, so there is no tab bar on
it — `← Journal` is what it has instead — and the export is served by a plain
file server, so reloading a client-side route asks for a file that is not
there. Both scripts navigate through the app's own controls for those reasons.

**And "navigate through the controls" is not a style preference — a direct URL
into that export measures nothing, twice over.** Measured while auditing the
phone's screens: `/settings` is a 404 whose own error page carries a `<title>`,
so axe passes it having looked at the file server; `/(tabs)/settings.html` is
served, and then expo-router matches no route for that path and renders
**"Unmatched Route"**, which also passes. A run over nine screens that way
came back with one tidy finding on all nine, and every one of those nine
measurements was of a page the app does not have. Only `/` and `/welcome/` are
reachable by URL. The one real finding in that sweep came from reading the
source and React Native's own types instead.

**That finding: the phone asked iOS for an autofill hint iOS does not have.**
The password field's `autoComplete` was `'password'`, which React Native's own
types list under "Android only" — `current-password` and `new-password` are the
two that work across platforms. So somebody with the account's password in
iCloud Keychain was offered nothing on the screen that asks for it, on a
product whose rule is twelve characters, which is the length people keep in a
manager rather than in their head. The same field in `apps/web` has said
`current-password` since it was written, so the two surfaces disagreed about
one attribute and the one that was wrong was the one nobody here can test.

`Field`'s prop type no longer admits `'password'` at all, rather than the two
call sites being corrected: the value that works everywhere and the
Android-only one differ by a word, and the wrong one fails silently on the
platform with no device on CI. React Native Web passes `autoComplete` straight
through to the DOM, so `mobile.mjs` can read the attribute the native
platforms are handed — it asserts `current-password` before the screen is
toggled into register mode and `new-password` after, so a later edit cannot
swap them. Checked by putting `'password'` back: red by name, not by timeout.

**And the phone had no accessibility audit at all, which is where the two
worst findings in this file's accessibility sections were sitting.**
`a11y.mjs` covers the web's twenty routes in both palettes; the phone's eleven
screens were in nothing, because they cannot be reached by URL — the paragraph
above is why. `mobile.mjs` runs axe at every one of them now, in both palettes,
since it is the only thing that walks the app — and "every one" is compared
against the files rather than counted in this sentence, which is the section
further down.

Two findings, and the first is on the screen this product exists for.

**The crisis pause's helpline buttons hardcoded `'#FFFFFF'`.** White is right
in the light palette, and `accentInk` _is_ white there — in the dark one it is
`#1D1714`, because `positive` lightens to `#5FA883`. Measured in dark: the
helpline's name at **2.83:1**, its detail at **2.58:1**, and **the number
itself** at 2.83:1, on the screen whose only job is to get somebody to dial
one. `apps/web` has used `accent-ink` here since it was written, so the two
surfaces disagreed about one colour and the phone held the wrong one — the
same shape as the autofill hint above, found in the same hour.

**And an `opacity: 0.9` on the detail line, on both surfaces**, which blends
that white to `#eaf2ef` and takes it from 5.0:1 to **4.39:1** on `positive` in
the _light_ palette. Both are gone; the smaller font size is the de-emphasis.
Note what the token test could and could not say here: it asserts
`accentInk on positive`, which passes, because the pair is right and an
opacity on top of it is outside what a token can promise.

**Neither surface had ever audited that screen**, and the reason is worth
keeping: the pause is not a route. `/session` renders the six steps, and the
pause only exists after the server has ended a session for safety — so
"every route in both palettes" was every route's _first_ state. `flow.mjs`
audits it now, in the section that types crisis language into the page,
because that is the only place it can be reached.

**The second finding: no radio or checkbox in the app had a checked state.**
`accessibilityState={{ selected }}` on `accessibilityRole="radio"` is wrong
twice over. A radio's state is checkedness — TalkBack reads `isChecked()`, so
the option somebody had just chosen announced as "not checked" — and React
Native Web does not translate `accessibilityState` at all: measured in the
export, these rendered `role="radio"` with no state attribute of any kind,
which axe calls critical. Eleven controls: the consent gate's two checkboxes,
voice setup's two, and nine on settings including the **coach-sharing** group,
so the control that decides who may read somebody's sessions never said which
option was chosen. They use `aria-checked`, which React Native documents as an
alias for `accessibilityState.checked` — one prop that is right on iOS, on
Android, and visible to a check in the export.

The two `accessibilityRole="button"` controls with `selected` state — the
feeling chips and the calmer rating — are deliberately left. `selected` is a
real trait on both platforms for a button, so they do announce where they
ship, and adding `aria-selected` to make the export agree would be invalid
ARIA on that role and a violation of its own.

**And the phone's count was written in prose, so it was wrong twice.** It said
"ten of eleven" and then "ten of eleven again", corrected both times by listing
the files instead of believing the sentence — which is a method that works and
has to be repeated by hand every time. `audit()` takes the screen's own path
now and the summary compares what was collected against what is on disk, in
both directions: a screen nothing audited, and a path an audit names that no
longer exists. `_layout.tsx` is not a screen, and the crisis pause is audited
with **no** file on purpose, because it is a state of `session.tsx` rather than
a route and must not stand in for the six steps.

Eleven screens, and the two it found were the two worth having.

**The home screen was pressed and never looked at.** Section 5 clicked the
Today tab only to start a session from it, so the one screen a person opens the
app onto had never been through axe — and it holds "Start talking", the offer
to carry on an open session, what the weekly allowance has left and a preview
of the journal, which is more decision than any other screen in the app asks
for. It was clean in both palettes. What was missing was the evidence.

**The gate had never been rendered by anything, and it was not clean.**
`index.tsx` is the first thing the app draws — no token means welcome, a token
without consent means consent, otherwise the app — so it redirects too fast to
audit by arriving at it. With a token it asks the server first, which means the
state somebody on a slow connection actually sits on is `Waiting`: so the check
holds `GET /me` open and audits the app stuck where a bad connection leaves it.
**`aria-progressbar-name`, serious, in both palettes.** React Native's
`ActivityIndicator` renders `role="progressbar"`, and this one had no name at
all.

The fix is to hide it rather than name it, and that choice is the session
screen's argument one screen over: naming it would have a screen reader read
these words twice, once as the indicator's name and once as the caption under
it. So the indicator is `aria-hidden` and the caption is a polite live region —
`SaveStatus`'s choice on the web, for the same reason, with the crisis block's
`role="alert"` still the one place assertive is right. Three other screens
render `Waiting` (the journal entry, settings, the home screen) and all three
were clean, because the audit reaches them after their data has arrived.

**`Button` had the same spinner and a worse surprise.** It swaps its label for
an `ActivityIndicator` while a request is out — unnamed, so the same violation
on the app's primary control, and invisible to every audit because an audit
catches a screen at rest. Measured with the sign-in request held open, which is
the only way to see that state: `aria-disabled="true"`, `aria-label="Sign in"`,
visible text **empty**, and **no `aria-busy` at all**. So the paragraph above
about "Load more" was half wrong, and `accessibilityState={{ busy }}` joins
`{{ selected }}` as a key React Native for web does not translate. The button
carries `aria-busy` explicitly now and the indicator is `aria-hidden`; the
`aria-label` that keeps it identifiable while its text is gone was already
there, and is asserted beside the fix so it cannot be traded away for naming
the spinner. All three go red when reverted.

`document-title` is the one rule turned off in the phone's audit, and the
reason is that it is not about the app: the export serves one `index.html`
whose `<title>` Expo fills from a screen's `options.title`, and there are none
here because `headerShown` is false on every stack. A phone has no document to
title. Leaving the rule on would have meant a known violation on every one of
them, which is the state in which nobody reads the next one.
`flow.mjs` is the web app's: register, consent, a full session, a reply lost on
the way back, journal, insights, settings, the safety stop, sign-out and a
forgotten password reset. It
needs three servers, so it is not part of `check` — but it **is** in CI, as the
`e2e` job, along with the other six. Run it by hand too after changing the
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

### The checks get an empty database and the demo does not

`DemoSeeder` makes the four accounts and the pairing and **nothing else**,
because a fixture that already contains what a test is about is a test that
passes whether or not the code works. Every check above runs against exactly
that, and `flow.mjs` registers its own account anyway.

`pnpm run demo` is the same machinery pointed at a person rather than a check,
and it inherited that emptiness — which `LAUNCH.md` item 1 had already promised
away. That item is asking a clinician to read the risk screen and says the way
to ask is the demo, "including the console's safety queue, where they can see
what a reviewer would actually read". Walked in a real browser, what they would
have seen: a journal saying "Nothing yet", insights saying "Nothing to show
yet", a console overview of 0 sessions and 0% at every step, the coach's two
clients as a row of em-dashes, and the **safety queue saying "Nothing in the
queue"** — the one screen the whole request is about. `run.mjs` also printed
`you@stillpoint.test` as "an ordinary account, with a journal", which it was
not.

So `DemoContentSeeder` is the demo's own furniture, run by `--demo` and by no
check. Three things about it are deliberate:

- **It is a second seeder, not an addition to the first.** Folding it in would
  hand every check a database that already contains journal rows, insights and
  an open flag, and several of them assert on counts. Checked: the test seed is
  still 0 entries, 0 flags and 0 sessions, and `flow`, `coach` and `admin` all
  still pass.
- **Only one row carries anything like a disclosure**, at `medium`, and the
  excerpt is a sentence about not coping rather than a statement of intent.
  An empty queue cannot show a reviewer what a reviewer reads; inventing crisis
  language for a database somebody may screenshot is a different mistake. The
  phrases a reviewer actually judges are in the generated
  `docs/clinical-review/RISK-SCREEN-REVIEW.md`.
- **The free allowance is left intact.** The recent sessions are `quick`, since
  the weekly count is `where('kind', Full)` — a demo that opens on "you have
  used all three" cannot show anybody the session flow.

The insights content is overlapped on purpose too (one feeling in three
sessions, another in two, one belief in two): thirteen feelings each counted
once is a ranking of nothing, which is what the first attempt rendered.

CI runs four jobs: the PHP suite, the JavaScript gates, the end-to-end checks,
and the Docker images.

**And it has been failing without running, which is a different thing.** From
run 198 to run 223 — **twenty-six consecutive pushes** — every job finished in
under two seconds with `conclusion: failure` and **no log output at all**. Not
a test failure: the annotation says "The job was not started because recent
account payments have failed or your spending limit needs to be increased."
A billing hold on the account, with nothing in the repository wrong, for about
eight hours, while `verify:clean` and all seven end-to-end checks were green
locally the whole time.

Two things to take from it. **A red CI badge is not a result**, and the way to
tell is the shape: seconds, no logs, and a reason that lives in the run's
_annotations_ rather than its output. And what that window leaves unverified is
exactly the two things only CI can do — the **MySQL** migration run up and back
down, and the **Docker** images plus `deploy/smoke.mjs` through nginx. Neither
could be closed in the development container, and **one of the two now can**:
`apt-get install mariadb-server` works here, which the paragraph below was
wrong about for as long as it was written down. Docker still cannot — the CLI
is present with no daemon behind it. So for every commit in that window
sqlite passing proved nothing about MySQL, which was the rule at the time; what
is different now is that it did not have to stay that way. PHP here is 8.3; Laravel 13 needs ^8.3, and Pest 5 needs
8.4, so the API uses PHPUnit — which is what the skeleton ships anyway.

**The suite runs on in-memory sqlite, and `pnpm run check:mysql` runs it on a
real MySQL-family server instead.** The container has no MySQL _running_, and
this file said for a long time that "apt cannot install one" — which was simply
false. `apt-get update && apt-get install -y mariadb-server mariadb-client`
works; the update is not optional, because without it one package 404s on a
stale index, which is probably how the original claim was made. There is no
systemd here, so `mysqld_safe --user=mysql &` starts it, and the script does
both of those for you if nothing is answering.

What it runs: the migrations up, back down, up again, and then the whole PHP
suite against that database. **645 of 647 passed first time**, and both
failures were tests written against sqlite's grammar rather than anything about
the product — see the two notes below.

**Be exact about what that buys**, because overclaiming it is worse than not
having it. apt offers **MariaDB 10.11** and CI runs **MySQL 8.4**: MariaDB
stores `json` as `longtext` with a constraint where MySQL 8 has a native type,
and the default collations differ (`utf8mb4_unicode_ci` against
`utf8mb4_0900_ai_ci`) — both case-insensitive, which is the property the email
rule leans on, but not the same rules. So a green `check:mysql` means the
grammar, the column widths and the collation _behaviour_ hold on a real
MySQL-family server. It is strictly more than sqlite told you and strictly less
than CI does, and if you change a migration it is the first thing to run and
not the last word. It is deliberately not part of `check` or `verify:clean`,
for the reason `e2e` is not: it needs a server.

**The two that failed there are worth knowing, because neither was a bug.**
`InsightsReadsOnlyWhatItNeedsTest` asserts the ordering on the SQL — the only
way to see that rule at all, since the response is identical either way — and
it asserted `order by "occurred_at" desc, "id" desc`, which is **sqlite's**
identifier quoting. MySQL writes backticks, so the assertion read as a failure
while the ordering it is about was character-for-character the same. It strips
the quote characters now, because which one a test sees is a fact about where
the suite is pointed rather than about the query.

And `OneSpellingForAnAddressTest::test_the_migration_leaves_a_case_collision_alone`
**cannot run there at all**, which is the thing it exists to say. It needs two
rows differing only in case, and MySQL's unique index refuses the second one —
measured, `1062 Duplicate entry 'aarav@example.com'`, thrown by the fixture
before the migration under test was reached. So it skips when the driver is not
sqlite, with that as the reason. Skipped rather than deleted: the collision is
real where this is developed, and a migration that breaks a development
database is still a broken migration.

**Collation is the second thing sqlite will not tell you**, after column
widths, and it was costing somebody their account. `users.email` was written
exactly as typed while five other places compared it lowercased — the password
broker, the invitation table, the rate limiter, the erasure sweep and the
invitation accept path. On MySQL the default collation is case-insensitive, so
`where email = ?` matches whatever case was asked and the disagreement is
invisible. On sqlite `=` is case-sensitive, and all three of these were
measured:

- somebody who registered `Aarav@Example.com` could not sign in as
  `aarav@example.com` — 422, "These credentials do not match our records";
- a second account registered fine differing only in case, because
  `unique:users,email` is that same comparison, leaving two rows MySQL would
  never have allowed;
- and a reset asked for with the **exact** address they had registered
  answered **200 and sent nothing** — no notification, no token row — because
  the broker lowercases. The 200 is deliberate, so an unauthenticated caller
  cannot learn who has an account, which means the person is told a link is on
  its way to an account they can never get back into.

`App\Support\EmailAddress::normalise()` is the one rule now and all eight call
sites go through it, so the product behaves the same where it is developed and
where it runs rather than resting on an accident of the storage engine — which
is this repository's position everywhere else. Registration normalises
**before** validating, because `unique` is that same case-sensitive compare.

`OneSpellingForAnAddressTest` is written as sqlite tests on purpose: against
MySQL they would pass before the fix as well as after, by the collation rather
than by anything the application does, and that is the whole point. Checked two
ways, and the difference is worth knowing. Removing the helper entirely leaves
five of the seven red but the **reset one green** — because then both sides are
as-typed, which is accidentally consistent. The bug was the _disagreement_, so
reproducing it means storing as typed while the broker lowercases, and under
that exact configuration the reset case goes red too, on zero token rows.

The migration that lowercases existing rows **leaves a case collision alone**
rather than failing. Two such rows were never storable on MySQL and are
storable on sqlite, so a development database can hold them, and a blind
`LOWER(email)` would violate the unique index. Merging two accounts is not a
migration's decision — each has its own journal — which is the same choice
`stillpoint:rotate-key` makes for a row it cannot decrypt.

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

**That read names its columns now, and "the window keeps the set small enough"
was the sentence that needed checking.** The window bounds days, not sessions,
and a quick session is always allowed by design — so the number of journal rows
inside 30 days has no ceiling. Measured, with a full session's text in each
row:

| rows   | fetched | read   | before                           | after          |
| ------ | ------- | ------ | -------------------------------- | -------------- |
| 2,000  | 55.5 MB | 494 KB | 199 ms, 76 MB                    | 128 ms, 12 MB  |
| 4,000  | —       | —      | **exhausts `memory_limit=256M`** | 232 ms, 16 MB  |
| 20,000 | —       | —      | —                                | 1.15 s, 104 MB |

At 4,000 it died inside Laravel's `Connection`, **fetching** — before anything
was reduced — against `deploy/php.ini`'s own limit, and the person it happens
to is whoever used the product most. Six encrypted columns were pulled and two
read: `what_happened`, `forgiveness`, `memory`, `note` and `title` are the
user's own words about what hurt them, and this screen counts feelings. The
cast is lazy so they were never decrypted, which is exactly the difference
`CoachAttention` already names between a rule and a habit —
`CoachAttention` selects two timestamp columns rather than the row, and this
read was the habit.

**It is bounded now, and the number is what decided how.** That paragraph
ended "it is still not bounded, and naming the columns did not make it so",
with two candidate fixes and no measurement of how much headroom was left. So
it was measured to the failure rather than extrapolated, peak process memory
against `deploy/php.ini`'s own 256M (about 24 MB of which is bootstrap):

| rows   | peak   |                                                       |
| ------ | ------ | ----------------------------------------------------- |
| 2,000  | 34 MB  |                                                       |
| 5,000  | 50 MB  |                                                       |
| 10,000 | 76 MB  |                                                       |
| 20,000 | 130 MB |                                                       |
| 45,000 | 262 MB | **does not fit** — dies inside `Collection`, fetching |

About 5.3 MB a thousand entries, so the limit is reached at roughly **44,000
entries inside the window** — and that changes what the fix should be. 44,000
entries in thirty days is about 1,450 sessions a day: not a number a person
reaches, a number a script reaches, and the read is per-user so the cost falls
on that one account's own screen. Which rules out the second candidate
immediately: plaintext aggregate counters would trade the encryption for a
query to defend against something nobody using the product can do.

So it is the first one. `InsightsService::MAX_ROWS` is **5,000**, newest first,
applied as a `limit` on the query rather than a slice after everything arrives
— with `id` after `occurred_at` for the reason every paged ordering here ends
in `id`. One row more than the ceiling is fetched, so truncation is visible
without a second `count()`. The account that used to 500 now answers in 677 ms
at 50 MB.

5,000 is picked so the ceiling is real and the caveat is unreachable: a heavy
user at ten sessions a day for thirty days has 300 entries, so there is about
sixteen times that in headroom. **Nobody actually using the product sees a
partial number**; what changed is that the server's work per request is bounded
rather than merely improbable.

The screen says so when it happens, because the alternative is presenting a
number of a subset as a number of everything — the rule one section down about
a screen reporting what it does not know. `partial` rides on the insights
response and both screens read it, and the count in the sentence comes from
`sessions`, which **is** the ceiling when the read was truncated, so no second
number crosses the wire and neither surface writes 5,000 down. Measured in a
browser at both branches: "Last 30 days, counted from your most recent 5,000
sessions." against 45,000 entries, and "Last 30 days" on an ordinary account.

`partial` is deliberately **not** on `App\Domain\Insights`: it is a fact about
the read rather than about the journal, and `packages/protocol/src/insights.ts`
summarises whatever it is handed. Putting a storage decision inside the domain
would give the two ports different shapes for one rule, which is the asymmetry
`Insights::from()` taking `$now` was added to remove. `App\Services\InsightsRead`
carries the pair.

`InsightsReadsOnlyWhatItNeedsTest` asserts the columns on the SQL — there is
nothing in the response to see it by, since the version that fetched everything
printed identical numbers — and asserts the numbers beside them, because a
`select` that dropped a column the reduction reads would make this screen
quietly wrong rather than fail. It now also asserts the `limit` and the
ordering on the SQL, for the same reason: a version that fetched every row and
sliced in PHP would print identical numbers and have exactly the memory profile
the ceiling exists to prevent. The truncation branch itself is reached through
a `$maxRows` seam, which is a test seam for the reason `$now` is one — five
thousand and one journal rows is a test nobody runs — and what the seam cannot
prove is the number, which is what the table above is for.

A user can erase their own account, and it has to actually take everything:
`AccountDeletionService`. Most of the removal is the schema's — sessions,
journal, flags and pairings cascade from `users` — and what is in the service is
everything a foreign key does not reach, which is the pattern to check for
whenever a table is added:

- **Sanctum tokens**, which have no foreign key, so nothing would remove them.
- **The role-change trail**, which must outlive the account but must not keep
  its address.
- **The plan-change trail**, the same kind of record and the same treatment,
  and the worked example of why this is written down as a _pattern_: the table
  arrived after this list was written, the sweep for it was added, and the list
  itself still had five bullets for six things. Both columns are swept, the
  subject's and the actor's — an admin who changed somebody's plan and later
  erased their own account is in `changed_by_email`, not `user_email`.
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

**And the pattern is enforced rather than remembered now.** Every item above
has a test, each test names the table it is about, and each lives beside its
own feature — the role trail's in `AdminUserApiTest`, the plan trail's in
`GrantingAPlanTest` — so a table added later has no test and nothing says so.
`ErasureLeavesNoAddressAnywhereTest` asks the **schema** instead: it finds
every text column in every table whose name mentions an email, and asserts the
erased address is in none of them. A table added tomorrow with an address in it
is covered on the day it is created, which a hand-written list cannot be. It is
`RotateEncryptionKey::COLUMNS` with the direction reversed — that refuses when
a model declares a column its list does not cover; this discovers the columns
rather than declaring them.

Two halves make it worth anything, and the first is what caught a gap in its
own fixture. **A sweep over empty tables passes**, so it writes a row into
every one of those tables and asserts they hold the address _before_ erasing —
and that assertion failed first time, because the address was only ever the
subject and never the actor, so `changed_by_email` was being swept over an
empty column. And **a sweep that deleted everything would pass too**, so
somebody else's address is asserted untouched in the same place. Checked by
removing the role, plan and invite sweeps one at a time: each goes red naming
its own table and column.

By type as well as by name, incidentally: `users.email_verified_at` is a
timestamp and excluding it by name would be a rule that breaks the next time
somebody adds `email_changed_at`.

It is guarded by the
account's own password and a typed confirmation, because it is not reversible
and should not be something a stray tap on an unlocked phone can do.

**And `GET /journal` carrying every field is load-bearing, which it does not
look like.** The journal **list screen** reads five of them — `id`, `title`,
`summary`, `occurredAt`, `durationMinutes` — and the response carries fourteen,
including all five encrypted content columns. Measured on 25 entries of a full
session's text: **302 KB and 31 ms** whole, against **55 KB and 21 ms** with the
content dropped. So it reads as the obvious thing to trim, especially since the
entry screen fetches `GET /journal/{entry}` for the rest anyway.

What that misses is that `api.wholeJournal()` is
`everyPage(journal(100, cursor))` — "Export my data" pages **this** route. Trim
the list and the export becomes metadata: a file that looks right, sized about
right, with every word the person wrote missing from it, and nothing failing,
because `wholeJournal` would go on returning rows.
`TheJournalListIsWholeForTheExportTest` is that reason written as a check
rather than as a comment, because a comment above a resource is not what
somebody reads while deleting a field from it — it asserts the five content
fields by value, and names the export in the failure. Checked by dropping
`note`: red, quoting it. If the shape ever should be trimmed, the export has to
stop depending on it first.

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

### And it must not report an answer it has been given a newer one than

The same shape with the arrow reversed. A list screen fires a request when its
filter changes, nothing orders the answers, and the last `setState` wins —
which can be the **older** one. There a failed request became "nothing"; here
an answered-but-superseded request becomes "this is what you asked for", which
is the harder of the two to notice because the screen is showing real rows from
the real server.

Two screens had it, both in the console, and both measured in a real browser
with the first response held for 2.5 seconds:

- **The safety queue.** Pressed "Include reviewed", then "Open only" again. The
  filter button read "Include reviewed" — so the screen was offering to include
  them, meaning it was showing open work only — the count line read
  `2 open · most severe first`, and one of the two rows was marked
  **Reviewed**. A reviewer deciding what still needs following up was shown
  finished work, counted as open, in the flattering direction. With the guard
  neutered and a run's worth of flags in the table it reads **5 of 6 rows
  reviewed**.
- **The accounts list.** Typed `zzzz-nobody` into the search. The box held that
  and the screen listed `11 accounts · 1 admin`, every row: every account in
  the product, under a search matching none of them, on the screen where
  `admin` is granted.

**The cursor is the other half of it**, and it is the part a server-side test
cannot catch. Each screen stores the page's `nextCursor` beside its items, so a
stale answer leaves the cursor pointing into the other ordering —
`cursorPaginate` encodes the ordering columns and knows nothing about the
filter, so the cursor is accepted and "Load more" continues a different list
from the one on screen. On the queue that is the failure the cursor rule above
is written down for: a reviewer never seeing a flag.

`apps/web/src/lib/stale.ts` is the rule, one module for the same reason
`describe()` is: both screens had the identical omission, so the third would
have too. It is a sequence rather than an `AbortController` because
`packages/client` takes no signal and threading one through every method is a
larger change than the bug — and an abort arrives as a rejection, so each call
site would have to tell it apart from a real failure or show a connection error
for a request it cancelled itself. By the time a stale answer is here its cost
is already paid; what is left is only whether to believe it. The core is a
plain function with the hook two lines around it, because `vitest` here runs in
`node` with no React renderer — the same split as
`apps/desktop/src/navigation.ts`.

**The failure path is gated too.** A stale rejection setting an error over a
newer page's rows is the same bug wearing the other face: the screen would
report a problem with a request whose replacement had already succeeded.

`Accounts`'s "Load more" also had **only** a cursor check where the queue's had
`loadingMore` as well, so two presses both read the same cursor and both
appended the same page. The journal's was already right; the accounts list was
the odd one out, the way the session screen was for live regions.

`e2e/admin.mjs` delays the abandoned request on both screens and asserts the
newer answer is what is rendered. Both were checked by neutering the guard and
rebuilding; both go red.

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

**Section 9 of `flow.mjs` walks it, which nothing did.** `PasswordResetApiTest`
covers the API thoroughly — thirteen cases, including that the journal is still
there — and what nothing covered was the two screens and the seam between them
and the notification. The link carries the address as `?email=`, and the reset
screen reads that parameter and shows "This link is incomplete" without it: a
mismatch would lock out everybody who forgot a password while every API test
stayed green. Checked by dropping the parameter — the section goes red naming
it, and the screen below it says "This link is incomplete".

It also walks the only path that exists today, which is somebody reading the
link out of a log file, and that is the check for whether the link is usable at
all: Laravel's log mailer writes a rendered message, and a token wrapped across
two lines would be a link nobody could follow. The link is found by **what the
log gained while this account asked** rather than by the address in it, because
keying on the address would make a link with no `?email=` unfindable and turn
the seam's failure into "no link for this address".

Two rules in there are asserted through the screens rather than the API. The
answer is the same whether or not the address has an account — compared with
the address itself swapped out of both, since the sentence names it — and
checked by putting the leak back, which goes red quoting "We have no account
for that address." And a reset does **not** sign you in: it revokes every
token, this browser's included, so the screen says so and the new password has
to be used. That one is asserted on the token in `localStorage` rather than on
the URL, because signing in carries on through the welcome flow and landing on
`/welcome/voice` is being signed in.

What the section cannot demonstrate by breaking is the sentence it is named
for. Keying the encryption to the password is the change that would make a
reset a shredder, and simulating it means implementing per-user keys. The
assertion is a regression guard on the composite path; `PasswordResetApiTest`
is what pins the unit.

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

### A stranger holding somebody's id, on every route that takes one

Each of those checks already existed: `authorizeOwnership()` on sessions and on
the journal, `authorizePairing()` on the coach portal, a `coach_id` comparison
on withdrawing an invitation, the addressee comparison on accepting one. What
did not exist was coverage of all of them, and the one that was uncovered is
why this is a sweep rather than a case.

`SessionApiTest::test_a_user_cannot_touch_someone_elses_session` named three of
that controller's four id-taking routes — `show`, `turn`, `stop` — and not
`rating`. The guard is on `rate()` and always was, so nothing was wrong;
what was missing was the thing that keeps it there. Measured: with
`authorizeOwnership` taken out of `rate()`, **the entire 647-test suite
notices through exactly one test, the new one.** And a rating is not the
harmless one of the four — it is the single operation the reducer still accepts
on an **ended** session, and it writes through to the journal entry, so it is
the one route by which a stranger could have changed what somebody else reads
back about their own session.

`EveryOwnedRouteRefusesAStrangerTest` therefore asks the **route table** rather
than listing routes, which is `PageSizesAreBoundedTest` reading the source and
`ErasureLeavesNoAddressAnywhereTest` asking the schema. Two maps keyed on the
route parameter: `OWNED`, which is what a stranger gets, and `NOT_OWNED`, which
is why that parameter is not an ownership question — and a parameter in neither
fails the test naming the route, so a route added tomorrow with `{entry}` in it
is covered the day it is written. That is
`RotateEncryptionKey::COLUMNS`'s direction: refuse what is not covered, so the
next one has to be argued for.

Four things in it are deliberate:

- **Only `auth:sanctum` routes**, by construction rather than by exclusion:
  "what does a stranger get" presupposes somebody signed in.
  `GET /invites/{token}` is the one id-taking route without it, and it is
  public on purpose.
- **`{token}` expects 403, not 404**, and it is the only entry that does.
  Whoever holds an invitation link was _given_ it — they are not somebody who
  guessed an id, they are the wrong account for a real invitation — so they are
  told which address to sign in as. Every other 404 here is this product's
  standard, so a route does not confirm its own resource exists to somebody who
  may not have it.
- **The stranger's role is part of each fixture.** A coach route is behind
  `EnsureCoach`, so sweeping it with an ordinary account would get a 404 from
  the middleware and pass with no ownership check present at all.
- **One request body carrying every field any of these routes validates**, so a
  422 can never stand in for the refusal. A body per route would be the
  hand-written list this replaces.

And the way writing it went wrong is the usual shape: the first version
returned the **owner** where the stranger goes, so three routes were swept by
the account that owns the resource and `POST sessions/{session}/turns` answered
**200** — which is what the owner correctly gets. It failed loudly against
working code rather than passing against a bug, which is the better of the two
ways for a check to be wrong, and it is why the assertion prints the status it
got. Checked in all three directions: the rating guard removed, the
invite-withdrawal guard removed, and a route added with an unaccounted
parameter.

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

**And `coach_client.status` still defaults to `invited`, which is deliberate
now rather than left over.** The enum no longer has that case, so the default
reads like something to tidy — and tidying it is the dangerous move: a default
of `active` would mean a row inserted without a status silently granting
somebody the ability to read another person's shared sessions. The stale
default is accidentally the fail-closed one, so it stays.
`test_a_pairing_written_with_no_status_grants_nothing` is what says so, and it
is a second test on purpose: the one beside it writes `invited` explicitly and
stays green when the default changes. Checked by changing the migration to
`active` — the new one goes red with the coach reading a client they were never
paired with, and the old one does not notice.

**The client creates the pairing, and the client ends it.** A coach can open an
invitation to an email address; they cannot attach themselves to an account.
Accepting is what pairs them, only the address it was sent to may accept, and
`/me/coaches` lets the client see who can read their shared sessions and end it
immediately. A sharing rule the sharer cannot inspect or revoke is a promise
about someone else's behaviour, not a rule.

**And the invitee came back from signing in, which they did not.** Following a
coach's invitation while signed out is the ordinary case — there is no mail
driver yet, so the coach passes the link on by hand, and the person it reaches
is being invited _to_ the product. The screen pushed
`/welcome?next=/welcome/invite/<token>` with a comment saying "the invitation
is in the URL, so it survives the trip", and **nothing read that parameter**.
Measured in a real browser: the invitee pressed Accept, registered, landed on
`/welcome/consent`, and the invitation was gone. The only path by which a coach
gets a client, broken for everybody who was not already signed in.

`apps/web/src/lib/after-welcome.ts` holds it, in `sessionStorage` rather than
in the URL, and says why that is the better answer rather than merely a
different one. Two reasons. A `?next=` is a redirect target **anybody can
write** — a link to `/welcome?next=…` makes the welcome flow a thing that signs
you in and forwards you somewhere chosen by whoever sent the link, which then
needs validating, and validating a URL-shaped string is where the desktop
shell's pin went wrong. And it would cost the **static render**: reading a
search parameter means `useSearchParams`, which on a prerendered route means a
`Suspense` boundary (see `apps/web/src/app/session/page.tsx`), three of them
here — and every route being statically prerendered is what lets the content
policy keep `'unsafe-inline'` instead of minting a nonce. Both `/welcome/voice`
and `/welcome/invite/[token]` are still prerendered after the fix.

So sign-in and consent do not change at all: the destination is not their
business, it is just still there when the flow ends. **Consent stays first**,
because it is the server's gate and the screen that names the crisis numbers —
an invitee is not routed past it to go and accept a sharing arrangement.
**And it broke a second time, in the same place, for the same reason.** The fix
above guarded on `hasToken()` — which asks whether a token **exists**, not
whether it works, and a thirty-day expiry leaves one in `localStorage`. So an
invitee with a dead token pressed Accept, the accept answered 401, and the
screen printed Laravel's **"Unauthenticated."** under an invitation from their
coach. The stale token stayed and pressing Accept again did the same thing.
Measured in a real browser, twice round: same URL, same screen, same word.

A dead token is the same situation as no token, so it takes the same path —
clear it, remember the destination, go to sign in. Driven end to end
afterwards: Accept → sign-in with the token cleared → consent → voice → back
at the invitation. Both times this screen has broken it was by **reasoning
about the request instead of the answer**, which is why `coach.mjs` now
asserts the expired-token case beside the signed-out one rather than only the
fix being in place. Three of its four assertions go red with the screen
reverted, each naming itself — `waitForURL` would have thrown a timeout
instead, so the check reads the pathname after waiting.

**A 401 is the framework answering too, which the earlier sweep missed.**
`describe()` now gives it a sentence, for the reason a 429 and a 500 get one:
nothing in this API words its own 401, it comes only from the auth middleware
with that one string, so there is no application sentence to shadow. Most
screens never show it — they check `isUnauthenticated` and redirect — and the
invite screen is the one that proved otherwise. The fourth `coach.mjs`
assertion pins that half and stays green when only the screen is reverted,
which is the right behaviour for two independent halves.

`safePath()` is still a single origin comparison by the URL parser, and the
reason is the same as the desktop's: measured, `//evil.example`,
`/\evil.example` and `  //evil.example` all resolve to another origin, and a
`startsWith('//')` check catches the first and misses the other two.

**`e2e/coach.mjs` was working around this.** It registered the invitee and then
`goto`-ed the link, navigating back to the invitation by hand — exactly what
the product failed to do — so it passed while the flow was broken, because the
script knew the link and the person would not. It presses the button the screen
offers and lets the product route, with no `goto` in that block at all; the
"ends back at the invitation" assertion goes red on `/app` without the fix. It
is the same shape as the plan trail's paging test: a check that walks a path
the user cannot.

**And accepting pairs with one statement**, which it did not. It was
`exists()` and then `attach()` — read-then-insert, the shape `openDraft()` was
fixed for, on the route that grants somebody the ability to read another
person's shared sessions. `coach_client` is unique on (coach_id, client_id), so
two accepts arriving together could never have made two pairings; what the
loser got was a constraint violation and a **500**, from a method whose own
comment said it was idempotent, on the one screen an invitee uses and from
which they have no other way in. `insertOrIgnore` has no gap to lose in, and
deleting the check is what makes "one pairing" the database's rule rather than
a check with a gap after it — the same sentence as
`journal_entries.guided_session_id` being unique.

Not a lock, because there is nothing to serialise: the row is either there or
it is not, and either answer is the one the caller asked for.

**Opening one needed the lock, though, and for the opposite reason.** "One
open invite per address" was read-then-insert too, so two requests together
both found none and both opened one — two pending invitations for one address,
each with its own token, which is exactly what that rule exists to prevent.
Here there is no unique index to lean on and there cannot be: the table keeps
withdrawn, expired and accepted invites for the record, so inviting the same
address again later is legitimate, and "one _pending_ per address" is a partial
index, which MySQL 8 does not have. So it reads under `lockForUpdate()` inside
a transaction, which gap-locks the range the other insert would land in — the
`(coach_id, status)` and `(email, status)` indexes are what give it a gap.

**And that lock cannot be asserted from this suite**, which took two wrong
tests to establish. Looking for `for update` in the executed SQL goes red
against the fix, because sqlite's grammar omits it entirely — `lockForUpdate()`
is a no-op there, which is `ConcurrentTurnTest`'s problem one layer out. So it
reads the source, the way `PageSizesAreBoundedTest` does. And **the first
source-reading version passed with the lock removed**, because the docblock
above the call explains what `lockForUpdate()` is for, so the check matched the
prose about the mechanism rather than the mechanism. It strips comments first
now. Both of those were caught by reverting the fix to watch the check go red,
which is the only thing that catches them.

Three things about verifying it. The existing "accepting twice is one pairing"
test does **not** reach the insert — the second accept is refused with a 409 by
`isUsable()`, so it stops well short — which is why a new case was needed. That
case asserts the **statement**, since two simultaneous accepts cannot be driven
from one process on sqlite any more than `lockForUpdate()` can, and it accepts
both grammars because sqlite writes `insert or ignore into` where MySQL writes
`insert ignore into`. And it also asserts that nothing selects from
`coach_client` first, which is the gap itself rather than its consequence.

**What was checked and found clean in the same pass:** a triple-tapped Accept
in a real browser sends **one** request. The handler sets `busy` without
refusing on it, which is the exact shape five other controls were fixed for —
but `disabled={… || busy}` is applied before the next click lands, measured, so
this one was never reachable from the screen. The server-side race was the real
half.

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

**The safety queue was looking up who, on the screen whose rule is that it
never does.** `SafetyFlagResource` prints `UserHandle::for($flag->user_id)` — a
salted hash of an integer — and nothing in the application reads `$flag->user`
at all; grepped, zero call sites. And the controller eager-loaded that relation
on **three** reads: the list, the single flag, and the response to "Mark as
reviewed". Measured by printing the SQL:
`select * from "users" where "users"."id" in (1, 2)` on a two-flag page —
`select *`, so the name, the address and the password hash, for every flag the
reviewer can see, to render a screen built so that whoever reads somebody's
crisis words cannot also read their name.

Nothing leaked: the response was identical before and after, which is the
reason this needed the SQL rather than a body assertion. It is
`CoachAttention`'s standard one screen over, where the cost is higher.

Two things about finding it, both the usual shape. **The grep found two of the
three** — `review()`'s was `$flag->refresh()->load('user')` and only turned up
on re-reading the file, so `TheQueueDoesNotLookUpWhoTest` has a case per route
rather than two standing for the controller. And the **first version of the
test passed with the eager load still in place**, twice over: it looked for
`in (?, ?)` where Eloquent inlines integer keys as `in (1, 2)`, and its other
case counted users reads expecting the bearer token's — but `Sanctum::actingAs`
resolves without touching the database, so the single read it allowed for _was_
the eager load. Printing the SQL settled both; guessing at its shape had
produced a check that was not looking at the thing it named.

**And no client reaches `GET /admin/safety-flags/{flag}`.** `packages/client`
has `safetyFlags()` and `reviewSafetyFlag()` and no single read; the queue's
detail pane renders the row it already has, since the list and that route share
one resource. Kept, because a reviewer deep-linked to a flag is the obvious
next thing this screen grows — and written down, because an unreached route is
one whose guard no browser exercises. Swept the other way too: of
`packages/client`'s 42 methods, that safety wording was the only one nothing
called, and it has a caller now.

That read **selects two timestamp columns**, not the row. `guided_sessions.data`
is the most personal column in the schema, and a coach's request does not ask
for it at all rather than asking and not using it. The encrypted cast is lazy,
so nothing was being decrypted either way — this is the difference between a
rule and a habit. It is asserted on the SQL, because there is nothing in the
response to see it by: adding a field to `CoachAttention` and reaching for
`$session->data` would otherwise break no test.

**And the client view read a private entry's words, which is the same rule
one step further in.** `journalOf()` built the rendered `presented` block for
every entry _before_ `CoachView` filtered, so a coach opening a client
decrypted the **title** and **note** of entries that client had kept private,
and fetched `forgiveness` and `memory` without reading either. Nothing leaked —
the filter runs before the response is built, and the response was correct
throughout. What was wrong is that the plaintext existed in the process at all,
which is precisely the standard `CoachAttention` states three paragraphs up.

Proved by ciphertext rather than by reading the code: a payload no configured
key can read, written into one private entry, made `CoachService::client()`
throw `DecryptException`. That is also a second consequence worth noting — one
unreadable private row broke the coach's whole view of that client, and
`stillpoint:rotate-key` leaves a row that decrypts under no key **byte-for-byte
as it is**, so an unreadable row is a state this product can really be in.

`presented` is a closure now, called only for the entries `sharedWith()` kept,
and the query names its columns. 470 ms and 84 MB at 2,000 entries (200 of them
shared) became 158 ms and 28 MB. `CoachReadsOnlyWhatItNeedsTest` has a
**positive control** — a shared entry's title must still be read — because
without it the two cases would pass just as well against a method that read
nothing at all.

`belief` is still read for every entry, and that is the one trade rather than
an oversight. `CoachView::summarise()` filters to the shared set itself and
then computes the recurring belief from it, and the property worth keeping is
that it stays correct **even when handed everything**. Nulling a private
entry's belief in the caller would make that filter unnecessary, which is
exactly the "a forgotten `where` is silent" failure `CoachView` exists to
prevent. So one column is decrypted and never shown, deliberately, and there is
a test pinning that it is — so the next person does not finish the job and
quietly remove the reason the rule lives in one place. Making it lazy instead
means changing a contract `parity/cases.json` pins against the TypeScript port,
which takes plain strings.

**It is still unbounded**, and it is now the only read that is. Insights has a
ceiling; this has a better reason not to — the sharing rule needs the whole
journal, so there is no window to bound and no page to take. Which also makes
its exposure different in kind: insights was reached by one account's own
scripting, where a coach's view grows with how much a _client_ has written and
shared, over all time rather than thirty days. Paging it is a design decision
rather than a refactor, and it is written down at the method rather than in
`DECISIONS.md` — grepped, that page has no entry for it, which is worth
knowing before describing it as tracked.

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

**And that was a reason with nothing asserting it.** No test in the suite
published a version and then took a turn, so the two halves of the rule were
only ever exercised apart. The behaviour was right — measured, a session at
step 1 advanced to a step 2 question from its own version while a different
one was live — and `PublishingDoesNotChangeALiveSessionTest` is what now keeps
it right. It matters for the obvious reason and one less obvious: a session's
recorded answers are only interpretable against the version that asked them,
so a session whose version moved half way through leaves a journal entry no
version explains.

Its third case is a **control** and the test is worth little without it: a
product that ignored published versions altogether and always fell back to the
baseline would pass the first two while being badly broken, so a session
started _after_ the publish is asserted to get the new question. Both breaks
were checked. Reading the live version instead of the pinned one turns the
behavioural case red and leaves the control green — correctly, because the
column is still written, only the read was wrong. Falling back to the baseline
turns the control red, and the behavioural case too, through its own guard
against an empty question rather than by passing vacuously on one.

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
unbounded work — which the insights read has since shown is not theoretical,
having died at 4,000 rows against the deployment's own memory limit.

**Nothing tested any of that.** `limit` appeared in no test in the suite, so
the ceiling, the fallback and the rule that every list applies them were all
description. `PageSizesAreBoundedTest` has three cases and the middle one is
the point: a unit test of `Paged::limit()` would pass while an endpoint quietly
passed the raw request value, and an end-to-end test on one list would pass
while a sixth list forgot. So it **reads the source** and asserts every
`cursorPaginate` in the application is handed a `Paged::limit(...)` — the same
shape as asking the schema for erasure's address columns, and for the same
reason: the hand-written list of endpoints is the thing that goes stale. It
counts the calls it found and fails if there are fewer than five, because a
source-reading test whose pattern stops matching silently stops checking.

Checked by making the journal paginate on the raw query value: the source case
goes red naming the file and the call, and the end-to-end case returns **105
encrypted rows where the ceiling is 100**.

`Paged`'s own docblock is the worked example of the drift: it said "these two
endpoints" and "both lists" for as long as there have been five, and it now
names them.

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

**And two of the three key on an address this API does not always see.**
`$request->ip()` is whatever opened the TCP connection unless a proxy is
trusted, and nothing was trusted: there was no `config/trustedproxy.php`, so
the key `TrustProxies` reads resolved to null. That is correct while nginx is
the edge, and `deploy/nginx.conf` listens on port 80 and assumes something in
front of it holds the certificate — so the **documented** topology is the one
where it bites, and nothing visibly breaks when it does.

The API generates no URLs, so an untrusted proxy costs nothing there: the
reset link and the invitation link both come from `APP_FRONTEND_URL`, not from
`url()`. What it costs is these limiters. Behind a terminator every request
carries the terminator's address, so `Limit::perMinute(60)->by('ip:…')` stops
being a ceiling on one machine and becomes **sixty requests a minute for the
whole product**; and the tight bucket keyed by account _and_ address collapses
to six a minute per account from anywhere — which is exactly the innocent
lockout the paragraph above says was fixed, arriving back in production only.
An address is not a secret.

So it is configuration, because the answer is a fact about a deployment's
topology: `TRUSTED_PROXIES`, a list or `*`, defaulting to trusting nothing.
`TrustedProxiesTest` pins both halves and the configuration key itself, since
`TrustProxies::at()` in a test proves the mechanism and says nothing about the
file a deployment actually sets — checked by pointing the config at a
different address, which brings the 429 back at the seventh request.

While I was in there: `.env.example` carried a
`FRONTEND_URL=http://localhost:3000:8000` — two ports, so not a URL — which
nothing reads, because this app's published `config/app.php` reads
`APP_FRONTEND_URL` and only the framework's own default reads the shorter name.
Verified with both set rather than reasoned about. Removed: a variable named
almost the same as the real one, in the file people copy, is a trap on the one
path back into a locked-out account.

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

### And the API's own origin had none of that

Twelve directives on the web app, built from the same `NEXT_PUBLIC_API_URL` the
client reads — and the origin it talks to answered with **no security header at
all**. Measured with `curl -I` against `artisan serve`: no policy, no
`nosniff`, no `Referrer-Policy`, and `X-Powered-By: PHP/8.3.6`.

Three of the four did exist, in `deploy/nginx.conf`, and only there. That is
the one-place argument this file makes about `describe()` and about having one
API client, with a different cost: a header set at the edge holds for that edge
and nowhere else — the development container, the end-to-end stack, and any
deployment whose terminator is not that file.
`App\Http\Middleware\SecurityHeaders` sets them now and nginx's copies are
gone, with a note there saying why putting them back would send each one twice
(`add_header` appends).

**`Content-Security-Policy: default-src 'none'` was in neither place**, and it
is the one worth having. This origin serves JSON: no page, no script, no
stylesheet, nothing to frame. A policy that forbids everything is the accurate
description of it rather than a strict choice, and it is what gives `nosniff`
something behind it if a browser is ever talked into rendering a response as a
document. `routes/web.php` being empty — `NoWebSessionsTest` — is why there is
no page here for it to break.

**`X-Powered-By` does not come off the response, which is the trap.**
`$response->headers->remove()` reads like the fix and is a no-op: PHP adds that
header itself at the SAPI's own header list when `expose_php` is on. Measured —
the header was still there after the middleware ran, on the first version of
it. `header_remove()` is what takes it off. `deploy/php.ini` sets
`expose_php=Off`, which is the real answer and reaches only the deployment.

**And the policy caught something on the way in.** `/up` is the health route,
and `health: '/up'` answers JSON to `Accept: application/json` and Laravel's
own **branded HTML page** to anything else — a page that links
`fonts.bunny.net` and `cdn.jsdelivr.net`. Measured in a real browser: two
requests to two third parties, from an API that has no web routes on purpose,
in a product that stopped linking Google's font CDN because "every visitor's IP
and user-agent reached a third party on every page". The container's own
healthcheck is `wget` with no `Accept` header, so that page is the one it had
been asking for all along.

`default-src 'none'` stops both — checked in the browser, the stylesheet and
the script are refused — but a page that _tries_ is the thing `e2e/privacy.mjs`
exists to catch, and that script only ever looked at the web app's origin. So
the route is ours now, in `withRouting`'s `then`, answering JSON to everybody
with no page to link anything; it keeps the `DiagnosingHealth` event, the
200-or-500, and `preventRequestsDuringMaintenance(except: ['up'])`, which
`health:` used to arrange. It also drops the **exception message** Laravel's
page prints: a listener here checks a database or a cache, so that message can
name a host or a credential, on the one route no token guards.
`HealthRouteNamesNoThirdPartyTest` asserts the body matches no `https?://` at
all — a stricter rule than avoiding those two hosts — names no framework, and
contains no `<`.

Asserted twice, on purpose. `ApiOriginIsLockedDownTest` pins all four on a
signed-in response **and on a 401** — the exception handler builds its own
response, so appending to the group is the only placement that reaches both.
And `deploy/smoke.mjs` asserts them over HTTP, because what a feature test
cannot see is a proxy or a CDN stripping a response header, and a header
stripped in production is missing exactly where it matters. Checked by taking
the middleware out: eight of the nine PHP cases go red, and the smoke check
names each header that did not arrive. The ninth is the `X-Powered-By` one,
which stays green in PHPUnit because there is no SAPI there to add it — worth
knowing, since that is the case the HTTP check is carrying.

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

- **`GuideVoice` — the guide speaking.** Bound, and working. `speak()` takes
  `GuideCopy`, which is the protocol's own copy and is already on the screen,
  so saying it aloud discloses nothing new. It is **never** the user's words.
  `SpeechEngine` is the narrow seam a vendor binds behind; the Web Speech API
  lives in `browser-engine.ts` and nowhere else, so the browser's accident of
  design does not become the requirement.

  **That used to be a sentence rather than a rule.** Both seams said `speak`
  "is only ever handed `session.say`" and that reading the user's words out to
  a third-party synthesiser "is not a thing to do by accident" — while the
  parameter was a `string` named `protocolCopy`, so the only thing preventing
  the accident was the name. `GuideCopy` is a nominal type in
  `packages/client`, branded on the API's `say` field, and it is assignable to
  `string` so rendering and comparing are unchanged; what it stops is the other
  direction. A plain string needs a cast, and a cast is conspicuous in review
  in a way a parameter name is not.

  **The type earned its keep immediately: the sentence was already false.** The
  phone's voice-setup screen speaks a preview line built from `GUIDE_VOICES`,
  and had done all along. That is the product's own copy too, so it has a named
  constructor rather than a cast at the call site — and those two are the whole
  set. `grep 'as GuideCopy'` across the surfaces returns exactly two lines:
  `voicePreview`, and one named helper in the voice test, which has no session
  to take copy from. That grep is the audit.

  The call sites also lost their `?? ''`: an empty string is not `GuideCopy`,
  and the honest fix was to check for nothing to say rather than cast a blank
  into the type.

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
built to dodge it.

**"There is a test asserting the response contains neither" was the second
sentence of this kind to be wrong, and it was found by checking the first.**
There was no such test. The behaviour was right — measured, a stopped
session's response carries no level, no category, no matched phrase and none of
the words that were said — so what was missing was the thing that keeps it
right: adding `'level' => $this->safety_level` to the resource would have been
silent.

`TheClientIsNotToldWhyTest` checks the keys **recursively**, by path, because
the field that leaks is the one nobody thought of: a nested `safety.level`
passes a check on `array_keys()` and was caught by this one naming
`safety.level`. It covers the subtler case too — a `medium` disclosure raises a
flag and the session carries on, and the response must not hint at that either,
or the line can be found and stayed under. Both halves assert the flag really
was raised first, so neither can pass vacuously, and a third case checks that
the key check itself can fail.

API resources are **not** wrapped in a `data` envelope in this Laravel version —
assert on `step.ordinal`, not `data.step.ordinal`.
