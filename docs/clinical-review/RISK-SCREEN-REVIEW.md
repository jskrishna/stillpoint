# Stillpoint — risk screen, for clinical review

Generated from `packages/protocol/src/risk.ts` at commit `efeb815`.
Regenerate with `pnpm run clinical:review` after any change to the screen.

## What we are asking for

Four answers, in [Questions](#questions-we-need-answered) at the end. You do
not need to read any code: everything the screen does is in this document.

## What the product is

Stillpoint is a guide that walks an adult through six steps when they are
upset: Notice → Responsibility → Feel → Remember → Inquire → Forgive. It is
not therapy and does not present itself as therapy. The person types their
answers; the guide speaks its questions aloud and asks nothing else of them.
The product is India-first.

## What the screen is, and what it is not

It is a **phrase screen**: it looks for fixed phrases in what the person
typed and grades what it finds. It cannot read tone, context, metaphor or
irony. It is not a classifier, it is not a clinical instrument, and nothing
in the product describes it as either.

It exists so that the most unambiguous disclosures cannot be missed while a
trained model is chosen and reviewed. It is **tuned deliberately for recall**:
a false flag costs a reviewer a minute, a missed one costs something that
cannot be undone.

### The order it runs in

1. The person sends an answer.
2. The screen reads it. This happens **before** anything else — before the
   guide is consulted, and before any rate limit can refuse the request.
3. If the grade is **high**, the session ends there and the guide is never
   asked to say anything.
4. Otherwise the guide asks the next question, and any flag is recorded.

This ordering is enforced in code and has tests asserting it. A model
answering somebody who has just said they are not safe is the specific
failure it prevents.

### What the person sees, and what we never tell them

On a high grade the person sees a pause screen, Tele-MANAS **14416** and
emergency services **112**. Helplines are India-only; for any other country
the product shows none rather than a plausible-looking wrong number.

The person is **never** told which rule they tripped, the grade, or the
phrase that matched. A medium or low flag is invisible to them.

### Where a flag goes

To a queue only an administrator can open — not a coach. A flag holds the
grade, the category, when it was raised, and **the sentence the person
typed**. That sentence is the most sensitive thing the product stores. It is
encrypted at rest.

## The grading rule

Only **a statement of intent, or of an act**, is high — because high ends the
session, and ending a session is a serious thing to do to somebody who was
asking for help.

Hopelessness and feeling like a burden are **medium** or **low**: flagged for
a reviewer, not stopped on. People say "I can't go on" and "I feel like a
burden" on an ordinary bad day often enough that stopping on them would make
the product unusable by the people it is for.

Past tense is included, because people speak that way. This trips on reported
speech — "a film about someone who wanted to die" is graded high and ends the
session. That false positive is deliberate and is recorded as such.

## The languages it covers

English, Hinglish (romanised Hindi) and Hindi in Devanagari — and it is thin
in all three. Hinglish has no settled spelling, so common variants are listed
separately; a missed spelling is a missed disclosure.

**It covers no other Indian language.** When somebody writes in Bengali,
Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi or Urdu, the
screen records that it could not read the text at all, rather than reporting
that it found nothing. That is counted and shown to administrators, so the
gap is visible. Nothing is flagged on that basis, and nothing is stored about
which language it was.

## The phrases, in full

Matched as substrings of the answer after lowercasing, straightening curly
apostrophes, and removing punctuation. So "KILL MYSELF." and "...kill
myself..." both match `kill myself`.

There are 134 phrases in 8 rules.

### Graded high

**The session ends immediately.** The guide is never consulted. The person is shown a pause screen with Tele-MANAS (14416) and emergency services (112), and the session cannot be resumed or continued. A flag is raised for a reviewer. No journal entry is written.

**Self-harm or suicide** — 52 phrases

- `better off without me`
- `better off if i was gone`
- `kill myself`
- `killing myself`
- `end my life`
- `ending my life`
- `take my own life`
- `want to die`
- `wish i was dead`
- `wish i were dead`
- `no reason to live`
- `nothing to live for`
- `not want to be here`
- `don't want to be here`
- `do not want to be here`
- `hurt myself`
- `harm myself`
- `cut myself`
- `suicide`
- `suicidal`
- `wanted to die`
- `wanted to kill myself`
- `tried to kill myself`
- `tried to end my life`
- `khudkushi`
- `khudkhushi`
- `khud kushi`
- `atmahatya`
- `aatmahatya`
- `mujhe marna hai`
- `mujhe mar jana hai`
- `marna chahta hu`
- `marna chahti hu`
- `marna chahta hoon`
- `marna chahti hoon`
- `jaan de dunga`
- `jaan de dungi`
- `jaan dene ka`
- `nas kaat`
- `khud ko khatam`
- `खुदकुशी`
- `आत्महत्या`
- `मुझे मरना है`
- `मरना चाहता`
- `मरना चाहती`
- `जान दे दूंगा`
- `जान दे दूँगा`
- `जान दे दूंगी`
- `जान दे दूँगी`
- `जान देने का`
- `नस काट`
- `खुद को खत्म`

**Harm to others** — 4 phrases

- `kill him`
- `kill her`
- `kill them`
- `want to hurt someone`

### Graded medium

The session continues normally. A flag is raised for a reviewer, with the sentence that matched. The person is not interrupted and is not told anything happened.

**Self-harm or suicide** — 33 phrases

- `feel like a burden`
- `burden to everyone`
- `burden to my family`
- `burden on everyone`
- `can't go on`
- `cannot go on`
- `can't keep going`
- `tired of living`
- `don't want to live`
- `do not want to live`
- `no point in living`
- `better off if i wasn't here`
- `better off if i was not here`
- `jeene ka mann nahi`
- `jeena nahi chahta`
- `jeena nahi chahti`
- `jeene ki iccha nahi`
- `sabke liye bojh`
- `sab ke liye bojh`
- `bojh ban gaya hu`
- `bojh ban gayi hu`
- `bojh hu sabpe`
- `jeene se thak`
- `thak gaya hu jeene`
- `thak gayi hu jeene`
- `जीने का मन नहीं`
- `जीना नहीं चाहता`
- `जीना नहीं चाहती`
- `जीने की इच्छा नहीं`
- `सबके लिए बोझ`
- `बोझ बन गया`
- `बोझ बन गई`
- `जीने से थक`

**Harm to others** — 4 phrases

- `could hurt him`
- `could hurt her`
- `could hurt them`
- `want to hit`

**Medical** — 16 phrases

- `stopped my meds`
- `stopped taking my meds`
- `stopped my medication`
- `stopped taking my medication`
- `off my meds`
- `haven't eaten in`
- `have not eaten in`
- `stopped eating`
- `starve myself`
- `starving myself`
- `make myself sick`
- `making myself sick`
- `drank a whole bottle`
- `drinking every day`
- `drink to forget`
- `relapsed`

**Trauma or abuse** — 18 phrases

- `abused me`
- `he hit me`
- `she hit me`
- `they hit me`
- `hits me`
- `beats me`
- `assaulted me`
- `raped me`
- `molested me`
- `threatens me`
- `threatened me`
- `threatens to kill`
- `threatened to kill`
- `forced me`
- `afraid of him`
- `afraid of her`
- `scared of him`
- `scared of her`

### Graded low

The session continues normally. A flag is raised for a reviewer, at the lowest severity. The person is not interrupted and is not told anything happened.

**Self-harm or suicide** — 4 phrases

- `nothing matters any more`
- `nothing matters anymore`
- `what's the point any more`
- `what's the point anymore`

**Medical** — 3 phrases

- `not sleeping at all`
- `can't stop drinking`
- `cannot stop drinking`

## Worked examples

What the screen actually returns, run against it while generating this.

| What was typed                                              | Grade             | What happens                                                                |
| ----------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| My manager called out my mistake in front of the whole team | none              | Nothing                                                                     |
| I felt ashamed and rejected                                 | none              | Nothing                                                                     |
| Sometimes I think everyone would be better off without me   | high              | Session ends, helplines shown, flag raised                                  |
| I want to die                                               | high              | Session ends, helplines shown, flag raised                                  |
| I can’t go on like this                                     | medium            | Flag raised, session continues                                              |
| I feel like a burden to everyone                            | medium            | Flag raised, session continues                                              |
| I stopped my meds last week                                 | medium            | Flag raised, session continues                                              |
| he hit me when I was small                                  | medium            | Flag raised, session continues                                              |
| a film about someone who wanted to die                      | high              | Session ends, helplines shown, flag raised                                  |
| मुझे मरना है                                                | high              | Session ends, helplines shown, flag raised                                  |
| ab jeene ka mann nahi karta                                 | medium            | Flag raised, session continues                                              |
| আমি মরতে চাই                                                | none (unreadable) | Not read — the screen has no phrases for this script. Counted, not flagged. |

The last two rows are the point of the previous section: the Hinglish one is
graded, and the Bengali one is not read at all.

## Questions we need answered

1. **Is this list acceptable as an interim backstop** while a trained model
   is built — and if not, what should be removed or added? We would rather be
   told it is inadequate than ship it believing otherwise.
2. **Is the grading boundary right?** Specifically: should hopelessness and
   burdensomeness ever end a session, when ending it means the person cannot
   continue and is shown helplines?
3. **Is the pause screen clinically appropriate** — what it says, and showing
   Tele-MANAS and 112 together?
4. **Should a safety flag outlive the person deleting their account?**
   Today it is deleted with everything else, because that is what erasure
   means. Which also means that if somebody said they were in danger and then
   deleted their account, no reviewer can follow it up. If a flag should
   survive, in what form and for how long?

## What we will do with the answers

Your corrections go into the phrase list and the grading, and your sign-off
or your refusal is recorded in the repository alongside this document. If the
answer is that this should not ship in this form, that is an answer we will
act on.

Nothing in the product currently claims clinical review. It will not until
there is one.
