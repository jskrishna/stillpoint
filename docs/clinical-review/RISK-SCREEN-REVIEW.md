# Stillpoint — risk screen, for clinical review

Generated from `packages/protocol/src/risk.ts` at commit `b69df1f`.
Regenerate with `pnpm run clinical:review` after any change to the screen.

## What we are asking for

Seven answers, in [Questions](#questions-we-need-answered) at the end. You do
not need to read any code: everything the screen does is in this document,
including every phrase it looks for and the grade each one carries.

It is about half an hour of reading. You do not need to use the product
to answer the seven questions — we can walk you through it if that helps,
but this document is written so that you do not have to.

**We would rather be told this is inadequate than ship it believing
otherwise.** Nothing here is a request for approval.

## What the product is

Stillpoint is a guide that walks an adult through six steps when they are
upset: Notice → Responsibility → Feel → Remember → Inquire → Forgive. It is
not therapy and does not present itself as therapy. The person types their
answers; the guide speaks its questions aloud and asks nothing else of them.
Canada is the first market, and a new account is assumed to be there. India is covered as well.

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

On a high grade the person sees a pause screen with the crisis numbers for
their country:

**Canada**

- **988** — Suicide Crisis Helpline. Call or text · 24 hours · Canada.
- **1-866-277-3553** — Québec — 1-866-APPELLE. Call · 24 hours · Québec.
- **911** — Emergency. If you are in danger now.

**India**

- **14416** — Tele-MANAS helpline. Free · 24 hours · India.
- **112** — Emergency. If you are in danger now.

A country this product has no numbers for is shown **none**, rather than a
plausible-looking number from somewhere else. A wrong crisis number is worse
than none, and that is the whole reason this list is short.

The person is **never** told which rule they tripped, the grade, or the
phrase that matched. A medium or low flag is invisible to them.

### What happens after the session stops

The session is over. It cannot be resumed — there is no path around a
safety stop — and it is **never written to the journal**, so the person
cannot read back what they said in it. Those words exist only in the flag,
which only an administrator can open, and the product’s “export
everything” does not include them.

**And the person can start a new session straight away.** Measured against
the running product: a stop, then a new session accepted at step 1, with no
cooldown and nothing asked of them in between. The stop is a stop on that
session, not a lock on the product. That is deliberate — refusing would
mean telling somebody who has just said they are not safe to go away — but
it means the screen can be walked past by anybody who does not repeat the
phrase, and we would rather you told us whether that is the right call.

### Where a flag goes, and who is watching

To a queue only an administrator can open — not a coach. A flag holds the
grade, the category, when it was raised, and **the sentence the person
typed**. That sentence is the most sensitive thing the product stores. It is
encrypted at rest.

**Nobody is on call.** There is no alert, no email, no notification and no
response time: the only thing that brings a reviewer to that queue is
somebody opening the console. The queue shows each flag’s age, and the
overview reports how long the longest-waiting open flag has been waiting,
precisely because that is the number nobody is otherwise watching. Whether
a flagged disclosure may sit unread for a day is not a question the code
can answer.

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

**English, French, Hinglish (romanised Hindi) and Hindi in Devanagari** —
and it is thin in all four. French is here because Canada is the first
market and French is one of its two official languages. Hinglish has no
settled spelling, so common variants are listed separately; a missed
spelling is a missed disclosure.

Accents are folded before matching, so "fatigué" and "fatigue" are the same
phrase — a phone keyboard without French accents is ordinary.

### Two different kinds of gap, and only one of them announces itself

When somebody writes in a script the screen has no phrases for at all —
Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Odia, Gurmukhi,
Perso-Arabic — it records that **it could not read the text**, rather than
reporting that it found nothing. That is counted and shown to
administrators, so the gap is visible. Nothing is flagged on that basis, and
nothing is stored about which language it was.

**A language written in Latin script that it has no phrases for does not
announce itself.** It normalises cleanly, matches nothing, and comes back
"nothing found" with full confidence — which is exactly what French got
until French was added. Spanish and Portuguese are in that position now.
This is the limitation we would most like your view on: it is not that the
screen is thin, it is that in these cases it cannot tell that it is.

**And the honest answer depends on the keyboard, not on the person.** The
rows below are the same sentence in the same language, typed two ways. In
its own script the screen says it could not read it. Typed in Latin letters
— which is how a great many people type on a phone — the same words come
back as nothing found, with confidence. Punjabi, Mandarin, Cantonese,
Arabic and Tagalog all have large communities in Canada, which is the first
market.

| Said                                                        | In its own script             | Typed in Latin letters                 |
| ----------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| Hindi: "मुझे मरना है" / "mujhe marna hai"                   | Session ends, helplines shown | Session ends, helplines shown          |
| Punjabi: "ਮੈਂ ਮਰਨਾ ਚਾਹੁੰਦਾ ਹਾਂ" / "main marna chahunda han" | Not read, and says so         | **Nothing found** — stated confidently |
| Mandarin: "我想死" / "wo xiang si"                          | Not read, and says so         | **Nothing found** — stated confidently |
| Russian: "я хочу умереть" / "ya hochu umeret"               | Not read, and says so         | **Nothing found** — stated confidently |

Hindi is the row that is not a problem, and it shows what closing the gap
costs: it is graded both ways because somebody wrote out the Hinglish
spellings by hand. Every other row needs the same work, per language, and a
missed spelling is a missed disclosure. That is the argument for the
classifier being multilingual from the start rather than English translated
— and it is a clinical question as much as an engineering one, because
somebody has to judge whether a phrase in a language they do not speak
means what the list says it means.

## The phrases, in full

Matched as substrings of the answer after lowercasing, straightening curly
apostrophes, and removing punctuation. So "KILL MYSELF." and "...kill
myself..." both match `kill myself`.

The answer is then read a second time, more forgivingly, against the same
list: apostrophes are dropped from both the answer and the phrase, characters
with no width (a joiner, a zero-width space, a soft hyphen) are removed, and
fullwidth or styled letters are folded to plain ones. So "dont want to live"
matches `don't want to live`, and a Hindi phrase matches with a joiner inside
one of its conjuncts. A match in either reading counts, so this second reading
only ever adds matches. It adds no phrase: every phrase the screen can find is
in the list below.

There are 155 phrases in 8 rules.

### Graded high

**The session ends immediately.** The guide is never consulted. The person is shown a pause screen with the crisis numbers for their country (see below), and the session cannot be resumed or continued. A flag is raised for a reviewer. No journal entry is written.

**Self-harm or suicide** — 61 phrases

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
- `je veux mourir`
- `je veux me tuer`
- `je vais me tuer`
- `me suicider`
- `je veux en finir`
- `en finir avec la vie`
- `mettre fin a mes jours`
- `me faire du mal`
- `mieux sans moi`

**Harm to others** — 4 phrases

- `kill him`
- `kill her`
- `kill them`
- `want to hurt someone`

### Graded medium

The session continues normally. A flag is raised for a reviewer, with the sentence that matched. The person is not interrupted and is not told anything happened.

**Self-harm or suicide** — 43 phrases

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
- `je n'en peux plus`
- `je ne peux plus continuer`
- `fatigue de vivre`
- `je ne veux pas vivre`
- `je ne veux plus vivre`
- `plus envie de vivre`
- `je n'ai plus d'espoir`
- `plus rien n'a de sens`
- `je suis un fardeau`
- `un poids pour tout le monde`

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

**Self-harm or suicide** — 6 phrases

- `nothing matters any more`
- `nothing matters anymore`
- `what's the point any more`
- `what's the point anymore`
- `a quoi bon`
- `plus rien ne compte`

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
| je veux mourir                                              | high              | Session ends, helplines shown, flag raised                                  |
| je n’en peux plus                                           | medium            | Flag raised, session continues                                              |
| je suis fatigué de vivre                                    | medium            | Flag raised, session continues                                              |
| quiero morirme                                              | none              | Nothing                                                                     |
| আমি মরতে চাই                                                | none (unreadable) | Not read — the screen has no phrases for this script. Counted, not flagged. |

The last rows are the point of the previous section. The Hinglish and
French ones are graded. The Bengali one is not read at all and says so. The
Spanish one — "quiero morirme", "I want to kill myself" — is the gap that
does not announce itself: read cleanly, matched against nothing, and
returned as though there were nothing there.

## Questions we need answered

1. **Is this list acceptable as an interim backstop** while a trained model
   is built — and if not, what should be removed or added? We would rather be
   told it is inadequate than ship it believing otherwise.
2. **Is the grading boundary right?** Specifically: should hopelessness and
   burdensomeness ever end a session, when ending it means the person cannot
   continue and is shown helplines?
3. **Is the pause screen clinically appropriate** — what it says, and showing
   the numbers listed above, and showing a national line and a provincial
   one (988 and Québec’s 1-866-APPELLE) on the same screen?
4. **Should a safety flag outlive the person deleting their account?**
   Today it is deleted with everything else, because that is what erasure
   means. Which also means that if somebody said they were in danger and then
   deleted their account, no reviewer can follow it up. If a flag should
   survive, in what form and for how long?
5. **Should a stop stop anything more than the session?** A person can start
   a new one immediately. We think refusing would be worse, and we are not
   confident. If something should change — a cooldown, an acknowledgement
   before starting again, the same numbers shown on the way in — it is a
   product change we would make.
6. **How quickly must a flag be read, and by whom?** There is nobody on call
   and no alerting today. Your answer decides whether this queue is a
   safeguarding process that needs rotas and escalation, or a review log —
   and it is the difference between what we have built and what we would
   have to build.
7. **Should the person be able to read back what they said in a stopped
   session?** It is the one thing they typed that they cannot see again.
   Handing somebody their own crisis disclosure months later, unprompted, is
   not obviously a kindness; nor is keeping it from them. We have written the
   argument down both ways and not chosen.

## What we will do with the answers

Your corrections go into the phrase list and the grading, and your sign-off
or your refusal is recorded in the repository alongside this document. If the
answer is that this should not ship in this form, that is an answer we will
act on.

Nothing in the product currently claims clinical review. It will not until
there is one.
