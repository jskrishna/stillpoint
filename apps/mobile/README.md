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

## What is verified, and what is not

`pnpm run typecheck` and `expo export --platform web` both run in CI's image
and in the development container, and the export is a real build: it bundles
every module and statically renders every route, so a broken import or a
component that throws on first render fails it. Eleven screens, which the
export emits as 16 pages — the four tab screens are written twice, under
`(tabs)/` and at the top level, and `_sitemap` and `+not-found` are Expo's
own.

`e2e/mobile.mjs` goes further: it serves that web export and drives it in a
real browser at a phone's width against a running API — register, the consent
gate, voice setup, a full six-step session, the journal, and the safety stop,
including asking the **server** what it recorded and that it refuses another
turn on a stopped session. It also holds this app to the rule
`e2e/privacy.mjs` holds the web app to: **nothing leaves this origin.** That one
caught a real leak once — the web's fonts were linked from Google's CDN, so
every page load of a product about being upset reached a third party. This app
has always bundled its fonts; now that is checked rather than said. The screens, the reducer, the API binding and the
navigation are the same files a phone runs, and until that script existed none
of them had ever been executed. It runs in CI.

**Nothing here has run on a phone**, though, and that is still the sentence
that matters. What a browser cannot stand in for: the keychain
(`expo-secure-store` — `localStorage` on web), text-to-speech
(`expo-speech`), `tel:` links on the safety screen, writing the export and
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
Treat the first run on hardware as a test pass that has not happened yet, not
as a formality.

## Layout

```
src/app/              expo-router routes (the app directory)
src/api.ts            the surface binding: base URL + keychain token store
src/theme.ts          the tokens, translated into React Native
src/use-theme.ts      palette and shared styles for the current colour scheme
src/ui.tsx            Button, Field, Card, Tag — the controls the screens use
src/voice.ts          the guide's voice, behind the same seam as the web's
src/mark.tsx          the Stillpoint mark
src/describe.ts       an API refusal in words, word for word the web app's
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
