# What has to happen before real people use this

`DECISIONS.md` is the list of things waiting on a choice. This is the shorter,
harsher question: **what stands between the code as it is and a Canadian
stranger finishing a session safely.** In order, with what each one actually
needs.

It is written for the person doing this, not for a team. Where something cannot
be done without an account, a certificate or a qualified person, that is said
plainly rather than estimated away.

Nothing here is a list of code that is missing. The product is built: five
surfaces, the six steps, the safety stop, the journal, the console, the coach
portal, erasure, and a deployment that builds and starts. What is left is
mostly the things software cannot do for itself.

---

## 1. A clinician has to look at the risk screen — before launch, not after

**Why it is first.** Everything else on this list is a product that works
badly. This one is the product doing harm. The marketing site promises that a
session stops when a user may be in danger, and what decides that today is
`packages/protocol/src/risk.ts`: a list of 155 literal phrases in four
languages. It cannot read tone, context, metaphor or irony. It misses whole
languages silently — `quiero morirme` is "I want to kill myself" and the screen
reports nothing at all, with confidence.

It was built to be a backstop so the obvious cases cannot be missed while a
real classifier is chosen. It has been the only thing there for a while.

**What to do.** First, be able to show them the thing: **`pnpm run demo`**
brings up a seeded stack and prints the four accounts and the five URLs,
including the console's safety queue, where they can see what a reviewer would
actually read. Asking somebody to judge a crisis screen from a document is
harder than asking them to use it for ten minutes.

Then `docs/clinical-review/RISK-SCREEN-REVIEW.md`, which is generated from
the code (`pnpm run clinical:review`), so it cannot drift from what actually
runs. It lists every phrase, every grade, the worked examples, and the four
questions a reviewer needs to answer. Give it to someone qualified — a
registered psychologist, a crisis-line clinical lead, a safeguarding
consultant. In Canada, a provincial college's referral list or a crisis-line
organisation's clinical team is the realistic route.

**What you are asking them for**, specifically: is the grading right, is the
recall acceptable, what is missing, and is the pause screen's wording safe.
Not "is this good enough" — they cannot answer that about software. These four.

**Cost.** A consultation. Expect it to produce changes, not a signature.

**What not to do.** Do not launch on the phrase screen and plan to replace it.
Do not let anyone describe it as adequate. The code says so in several places
on purpose.

---

## 2. A mail provider — or nobody can reset a password

**What is wrong.** `MAIL_MAILER=log`. A password-reset link is written to
`storage/logs/laravel.log` instead of being sent. In a real deployment that
means a user who forgets their password has no way back to their journal, and
the journal is the thing they came back for. A coach's invitation has the same
shape: the link comes back to the coach to pass on, and the screen says so
rather than pretending an email went out.

**What to do.** Pick a transactional provider (Postmark, Resend, SES, Mailgun
— any of them), verify a sending domain, put the credentials in the
environment, set `MAIL_MAILER`. Then
`CoachInviteController::forCoach()` should stop returning the invitation token
to the coach, since the invitee will receive it directly.

**Cost.** An account and a DNS record. Roughly two hours of work once the
account exists.

**Needs you.** A domain and a card.

---

## 3. Somewhere to run it, with TLS

**What exists.** `docker-compose.yml` and `deploy/` bring up MySQL, PHP-FPM,
nginx, Laravel's scheduler and the Next.js app. CI builds all three images,
starts the stack and then runs `deploy/smoke.mjs` against it, which registers
an account, runs a session, says something that must stop one, and asserts the
server stopped it and sent helplines. So the stack is known to build, start and
serve a session.

**Run that against your own deployment the moment it is up**, with both URLs:
`node deploy/smoke.mjs https://your-api/api https://your-site`. It is plain
HTTP, it needs nothing installed, and it erases the account it makes. The
second URL is the one that matters on a first deployment: without it the script
is not a browser, so a stack whose `CORS_ALLOWED_ORIGINS` or baked
`NEXT_PUBLIC_API_URL` is wrong passes every check and then shows a person a
screen where nothing works.

**What does not.** Nothing has run against real traffic, nobody has restored a
backup, and TLS terminates somewhere that does not exist. `deploy/README.md`
has the detail.

**Three things on that page that are not optional:**

- **`APP_KEY` is the whole journal.** Every entry, every session's content and
  every safety flag's excerpt is encrypted with it. There is no second copy and
  no recovery path: change it or lose it and that content is gone, not locked
  out. Back it up somewhere that is not the server, before there is anything to
  lose. `stillpoint:rotate-key --dry-run` reads every encrypted row and writes
  nothing, which makes it the check for "can this deployment still read what it
  holds".
- **`NEXT_PUBLIC_API_URL` is fixed when the web image is built**, because the
  browser is what calls the API. Pointing a built image at a different API is
  not possible; rebuild it.
- **Backups, and a restore you have actually done.** An encrypted journal with
  no tested restore is a promise you cannot keep.

**Cost.** A host and a domain. A day to stand it up, more to be honest about
backups.

**Needs you.** A card.

---

## 4. The step copy has to be published, the hour the deployment is up

**This is not polish.** Until a protocol version is published, the guide asks
step 1's question and then says nothing for the remaining five steps, because
only steps 1, 4 and 5 have copy in the designs and the rest are `null` in code
on purpose. A fresh deployment is in exactly that state —
`deploy/smoke.mjs` reports it, and I have watched it do so against an unseeded
database. So this belongs beside item 3 rather than after it: a deployment
nobody has published on is a product that stops talking to somebody who is
upset.

**What is there.** The designs specify step 1's question, step 4 in full and
step 5's question. Everything else is `null` in code, deliberately — a guess in
`steps.ts` silently becomes the product's therapeutic voice and nobody can tell
afterwards which lines came from the designs.

But `null` is not shippable either, and three of the six steps said nothing at
all. So the shippable copy lives in a **draft protocol version**, written by
`stillpoint:draft-step-copy`, which you read and edit at `/admin/protocol` and
then publish. The server refuses to publish anything still incomplete, so
publishing is a deliberate act by a person.

**That copy was written by Claude.** Not by a clinician, not from a PRD. It
follows the voice of the three questions the designs do give and each step's
own summary from the marketing site. It is rows in a table with an editor in
front of them precisely so the person who owns the voice can replace it.

**What to do.** Read all six steps at `/admin/protocol`. Change what is wrong.
Publish. Production publishes nothing by itself, so until you do, a real
deployment has no live protocol version.

**Cost.** An hour of reading. Longer if you rewrite it, which you may well
want to.

---

## 5. Billing, if you want anyone to pay

**What is wrong.** There is no billing at all — no provider, no checkout, no
subscription, and nothing that charges anybody. `App\Domain\Plan` has always
enforced what each plan _allows_ (Free gets three full sessions a week,
unlimited quick ones), and the prices are set in CAD. What is missing is
everything between a price and money.

**What works meanwhile.** An admin can grant a plan from `/admin/users`,
trailed in `plan_changes`. That is how a pilot account or a coach gets onto
Plus by hand, and it is a thing a product needs anyway rather than a stopgap to
rip out.

**What to do when you want it.** A provider account, a checkout, a webhook that
writes the plan, and a way to cancel. The webhook should write to the same
`plan_changes` trail with `changed_by` null, which is the field that exists for
a change nobody made by hand.

**Cost.** A provider account, and roughly a week.

**Not a blocker for a pilot.** Free is a complete product.

---

## 6. The phone app has never run on a phone

**What is verified.** `expo export --platform web` bundles every module and
statically renders every one of its eleven screens, in CI. `e2e/mobile.mjs` then drives that
export in a real browser at 390px through registration, consent, the six steps,
the journal, the safety stop and settings, against the real API.

**What has never run.** The app on a device or a simulator. There is none here
and none on CI. Unproven: the keychain, text-to-speech, `tel:` links on the
safety screen — which is the one that matters, because that screen's whole job
is to place a call — the splash screen, and safe-area insets on a notched
device.

**What to do.** Open `apps/mobile` in Expo Go on your own phone and walk the
journey once. The `tel:` links are the thing to check deliberately: tap a
crisis number on the pause screen and confirm the dialler opens with the right
number.

**Cost.** An hour and a phone. A store release additionally needs an Apple
Developer account and a Google Play account.

**Needs you.** A phone.

---

## 7. The marketing site needs a design rebuild

Deliberately untouched. `/` and `/pricing` work and say true things, and the
visual design is being redone, so no effort has gone into their layout. The
safety-relevant parts of them are correct: the helplines on `/` come from the
shared constant and the prices come from `plans.ts`.

---

## 8. The desktop app has never been packaged

It runs — launched under Xvfb here, and a session survives a relaunch — and
`pnpm run build` passes. There is no installer, no signing, no notarisation and
no auto-update, and it has never run on macOS or Windows. Each of those costs a
certificate or a server rather than a line of configuration.

Also: `/app` opens narrow, because the only design the artifacts give for those
screens is the phone one at 430px. That is the designed layout at its designed
width, not a desktop layout. A desktop layout for `/app` is a design decision.

---

## What is not on this list

Because it is done, and because a list like this is only useful if it is
honest about both halves:

- The six steps, on web, phone and desktop, against one server that owns the
  rules.
- The safety stop, enforced server-side before the guide is consulted, with the
  helplines resolved by country and the session terminal afterwards. Tested in
  a real browser against a real server.
- The journal, encrypted at rest, with deletion that takes the words out of the
  session too.
- Account erasure that reaches everything a foreign key does not.
- Roles, the safety queue, the protocol editor, the plan and role trails — all
  in the console, where granting admin is guarded three ways and recorded.
- The coach portal, where a coach sees only what a client chose to share, and
  the client can see who can read their sessions and end it.
- The plan allowance, enforced, with a quick session always allowed.
- WCAG AA contrast, asserted for every text role against every surface in both
  palettes, and axe-core clean across 19 routes at two widths in both.
- The session screen announced rather than only drawn: the crisis numbers on an
  answer that never sent, and the safety pause, reach a screen reader instead
  of appearing silently. Verified in a real browser on web; on the phone the
  live regions are verified and the spoken announcement is item 6.
- No third-party origin is contacted from any screen, asserted by a real
  browser.
- 574 TypeScript tests, 522 PHP tests, a cross-language parity fixture both
  suites assert against, and six end-to-end scripts — `pnpm run e2e`.

A green build means "this will start". It does not mean "this is ready", and
items 1 to 3 are why.
