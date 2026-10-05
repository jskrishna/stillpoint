# @stillpoint/mobile

Stillpoint for iOS and Android. Expo SDK 57, expo-router, consuming
`@stillpoint/protocol`, `@stillpoint/design-tokens` and `@stillpoint/client`.

Read the repository root `CLAUDE.md` first — it governs this directory, and the
safety rules in it are not preferences.

## Running it

```bash
pnpm --filter @stillpoint/mobile run start   # Metro, with a QR code
pnpm --filter @stillpoint/mobile run ios     # a simulator, on a Mac
pnpm --filter @stillpoint/mobile run android
pnpm --filter @stillpoint/mobile run web     # a browser, for a quick look
```

The API has to be running (`php artisan serve` in `apps/api`). The default base
URL is `http://localhost:8000/api`, which a simulator on the same machine can
reach and a real device cannot: copy `.env.example` to `.env` and point
`EXPO_PUBLIC_API_URL` at the machine's address on the network, then serve the
API with `--host=0.0.0.0`. The API's `CORS_ALLOWED_ORIGINS` already lists
Expo's `:8081` and a static export's `:4000` for development.

That variable reaches a **built** app now, which it did not. `src/api.ts` read
it through an alias, and Expo only inlines the exact expression
`process.env.EXPO_PUBLIC_API_URL`: measured, an export built with the variable
set did not contain the address, so every built copy of this app called
`localhost` whatever it was built for. `expo start` defines the variable at run
time, so Expo Go worked and hid it. The `build` script also passes `--clear`,
because Metro caches the file with the address already in it and does not
notice the address changing.

**On a real phone, the one command is `pnpm run demo --lan`.** It binds all
three servers to `0.0.0.0`, rebuilds the web app for this machine's address —
`NEXT_PUBLIC_API_URL` is baked in at build time, so a `.next` left from a
localhost run serves a phone a bundle calling a host it cannot reach — widens
`CORS_ALLOWED_ORIGINS` to the LAN origin, and prints the exact
`EXPO_PUBLIC_API_URL` line to write into `.env` before `expo start`.

It exists because the two documents disagreed. This file and `.env.example`
both said to serve the API on all interfaces, and `pnpm run demo` — the only
command the README gives — ran `php artisan serve --port=8000 --no-reload`,
which binds loopback. Measured: `127.0.0.1:8000/api/me` answered **401** and
the same request to this machine's own LAN address was **refused**. So the
documented path to a device test was the one command that could not get you
there.

Measured after, on the LAN address: all three servers bound `0.0.0.0`, the API
401, the web app 200, the export 200; the built bundle carries the LAN API URL
in 13 chunks and `localhost:8000` in **zero**; the served policy's
`connect-src` names the same origin, because both come from one variable. And
`deploy/smoke.mjs` run against that address walks a whole session — register,
consent, two turns with the guide speaking, the safety stop returning 988,
Québec's line and 911, a 409 on the next turn, no journal row, and the account
erased again.

Every dependency in `package.json` is in **Expo Go**'s own bundled set, so
scanning the QR is the whole install — no development build, no EAS account.
That is read off the dependency list rather than proved here: nothing in this
container can run Expo Go, which is the same sentence this file makes about the
keychain and `tel:` links.

Be plain about the cost: `--lan` puts three development servers and a demo
database on the local network. That is why it is a flag rather than the
default, and the banner says so where somebody will read it.

## Building an APK

It has never been done, so treat the first one as a test build. What is here
is the setup: `eas.json`, and `app.config.js`, which refuses a build that
could not work.

```bash
# once
npx eas-cli@latest login
cd apps/mobile && npx eas-cli@latest init     # links this app to your Expo account

# each time: put the API's address in eas.json, under build.preview.env, then
npx eas-cli@latest build -p android --profile preview
```

That builds on Expo's servers and answers with a link to an `.apk` you can
install directly. `production` builds an `.aab` for the Play Store instead,
which needs a Google Play account and a signing key EAS can hold for you.

Three things decide whether the app that comes out can do anything:

- **The address is built in.** `EXPO_PUBLIC_API_URL` is inlined into the
  bundle, and its default is `localhost`, which on a phone is the phone. So
  `eas.json` carries it per profile, empty until you fill it in, and
  `app.config.js` stops the build while it is empty, is `localhost`, or does
  not end in `/api`. A variable typed in front of `eas build` does not reach
  the machine that builds; `eas.json` does.
- **`http://` only works in a preview build.** Android refuses plain HTTP in a
  release build unless the manifest allows it. A preview build pointed at an
  `http://` address gets that allowance, because a laptop on the same network
  is the only API there is to test against today. A production build pointed
  at one is refused: every request carries a bearer token.
- **The server has to be reachable from the phone.** For a laptop that is
  `pnpm run demo --lan`, which binds every server to the network and prints
  the address to use. The API's `CORS_ALLOWED_ORIGINS` does not matter to the
  installed app, which sends no `Origin`.

The workspace packages are built on the build machine by the
`eas-build-post-install` script, since this app resolves `@stillpoint/*` to
their built output.

## What is verified, and what is not

`pnpm run typecheck` and `expo export --platform web` both run in CI's image
and in the development container, and the export is a real build: it bundles
every module and statically renders every route, so a broken import or a
component that throws on first render fails it. Eleven screens, which the
export emits as 16 pages, and the arithmetic is worth closing because it did
not add up: **three** of the four tab screens are written twice, under
`(tabs)/` and at the top level, plus `_sitemap` and `+not-found`, which are
Expo's own. 11 + 3 + 2 = 16.

The fourth is not a duplicate. `src/app/index.tsx` is the **Gate** — a
redirect with no interface of its own, which asks the server where somebody
should land and drops a stale token rather than carrying it into a screen that
would 401 on its first request. `(tabs)/index.tsx` is the home screen. They
share a path in the export and are two different files, which is how "the four
tab screens are written twice" made the total come to 17.

`e2e/mobile.mjs` goes further: it serves that web export and drives it in a
real browser at a phone's width against a running API — register, the consent
gate, voice setup, a full six-step session, the journal, **a journal entry and
Insights**, settings, and the safety stop, including asking the **server** what
it recorded and that it refuses another turn on a stopped session.

Those two were added late and the reason is worth keeping: they were the only
two of the eleven screens nothing ever rendered. The script pressed the Journal
tab and stopped there, so `journal/[id].tsx` and `(tabs)/insights.tsx` had only
ever been statically rendered by `expo export` — which proves the module
bundles and survives a first render with no data, and says nothing about the
screen with a real entry on it. Neither turned out to be broken; what was
missing was the evidence. The entry's note is checked round-trip, and the
sharing control is checked against both coach-sharing settings, because the
server refuses turning sharing on under "Never share" and a screen that
offered it anyway would be offering something that cannot work. It also holds this app to the rule
`e2e/privacy.mjs` holds the web app to: **nothing leaves this origin.** That one
caught a real leak once — the web's fonts were linked from Google's CDN, so
every page load of a product about being upset reached a third party. This app
has always bundled its fonts; now that is checked rather than said. The screens, the reducer, the API binding and the
navigation are the same files a phone runs, and until that script existed none
of them had ever been executed. It runs in CI.

**One branch added late is deliberately not asserted, and the reason is the
Gate.** The consent screen now clears a dead token and routes to sign in, which
the web's copy of that screen has always done — but `src/app/index.tsx` asks
the server where to land and drops a stale token before consent is reached, so
the only way in with one is for the token to expire **while somebody is on
that screen**. That is the thirty-day boundary, it is real, and contriving a
check for it would mean driving the app into a state ordinary navigation
cannot produce. The fix is defensive; the evidence is the web's equivalent,
which `e2e/coach.mjs` does assert on the invitation screen.

**Nothing here has run on a phone**, though, and that is still the sentence
that matters. What a browser cannot stand in for: the keychain
(`expo-secure-store` — `localStorage` on web), text-to-speech
(`expo-speech`), `tel:` links on the safety screen **and now on settings**,
writing the export and
handing it to the share sheet (`expo-file-system`, `expo-sharing`), the splash
screen, safe-area insets on a notched device, and how any of it behaves when
the app is backgrounded mid-session.

**And whether VoiceOver or TalkBack actually speaks the safety pause.** The
session screen announces it with `AccessibilityInfo.announceForAccessibility`
and marks the pause and the unsent-crisis block as assertive live regions —
because without that a person using a screen reader typed that they wanted to
kill themselves, the request died, and the numbers that answer that appeared
with nothing announcing them. `e2e/mobile.mjs` checks the live region, which
React Native for web renders as `aria-live`, so the markup is verified. The
announcement call is not: there is no screen reader here. It is the same kind
of unproven as the `tel:` link beside it, and on the same screen.
**And the settings screen's numbers are pressable now, which they were not.**
They were plain `Text` while the pause one screen over had a `HelplineButton`
all along — `HelplineButton` lived inside `app/session.tsx`, so settings could
not have used it, which is exactly the finding `apps/web` had before
`HelplineLink` moved into `components/`. It is in `src/ui.tsx` now and all
three places share it. `e2e/mobile.mjs` asserts the three controls and their
accessible names; whether tapping one opens the dialler is on the list above.

Treat the first run on hardware as a test pass that has not happened yet, not
as a formality.

**What the browser can check, it now does: axe runs at every screen that
check walks, in both palettes** (`grep -c 'await audit(' ../../e2e/mobile.mjs`
says how many) inside `e2e/mobile.mjs`, because these screens cannot be reached
by URL and so could not have an audit of their own. It found the two things
worth knowing about here.

The crisis pause's helpline buttons hardcoded `'#FFFFFF'` where the web uses
`accent-ink`. That is the same colour in the light palette and `#1D1714` in
the dark one, because `positive` lightens to `#5FA883` — so in dark the
helpline's name, its detail and **the number itself** were 2.83:1 and 2.58:1,
on the screen that exists to get somebody to dial one.

And every radio and checkbox rendered with no checked state:
`accessibilityState={{ selected }}` on `accessibilityRole="radio"` is the
wrong state for the role (TalkBack reads `isChecked()`, so the chosen option
announced as "not checked") and React Native Web does not translate
`accessibilityState` at all. Eleven controls, the consent gate and the
coach-sharing group among them. They use `aria-checked`, React Native's own
documented alias, which is right on both platforms and visible in the export.

Note the asymmetry that leaves. The `aria-checked` attribute in the export is
evidence the prop reaches the DOM; whether VoiceOver and TalkBack then
announce it is the same unproven as everything in the list above.

## Layout

```
src/app/              expo-router routes (the app directory)
src/api.ts            the surface binding: base URL + keychain token store
src/theme.ts          the tokens, translated into React Native
src/use-theme.ts      palette and shared styles for the current colour scheme
src/ui.tsx            Button, Field, Card, Tag — the controls the screens use
src/voice.ts          the guide's voice, behind the same seam as the web's
src/mark.tsx          the Stillpoint mark
src/describe.ts       an API refusal in words — byte for byte the web app's,
                      asserted by apps/web/src/lib/describe.test.ts against
                      parity/refusals.json. Do not edit one copy.
src/exports.ts        the journal export's cache file, and discarding it
```

## The journal export leaves a file behind, briefly

Settings writes the whole journal — every entry, plaintext — to the app's cache
and hands it to the system share sheet, which is what a phone has instead of a
download. It cannot delete the file straight afterwards: the share sheet may
still be reading it when `shareAsync` returns.

So it is deleted at the **next launch** (`src/exports.ts`), which bounds the
exposure to one app session rather than to an unspecified decision by the
operating system about when to empty a cache. That is not encryption and not a
guarantee — a device backup taken between the share and the next launch has it
— but "until you next open the app" is a sentence that can be said, and
"eventually" was not.

## Things that will bite

- **Metro and pnpm.** `metro.config.js` watches the repository root and adds
  both `node_modules` folders to the resolver. Without it a `@stillpoint/*`
  import resolves to nothing, or resolves but never reloads on an edit.
- **Package exports.** The workspace packages are ESM with an `exports` map,
  so `unstable_enablePackageExports` is on in `metro.config.js`.
- **`react` is pinned exactly** (19.2.3), because React Native is. `apps/web`
  is on a range; pnpm keeps them separate and that is fine, but do not
  "tidy" the pin.
- **`expo install --check` cannot run here.** The container's proxy blocks
  Expo's version-matrix API, so the dependency versions came from a
  `create-expo-app` template of the same SDK. Run it outside the container
  before changing a version.
- **`expo-secure-store` has no web implementation** and throws if called.
  `src/api.ts` branches on `Platform.OS` — the web target is a development
  preview, not a surface anyone ships.
