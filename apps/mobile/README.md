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
every module and statically renders all 15 routes, so a broken import or a
component that throws on first render fails it.

**Nothing here has run on a phone.** There is no simulator in the development
container and no device attached to CI. What that leaves unverified is real:
the keychain (`expo-secure-store`), text-to-speech (`expo-speech`), `tel:`
links on the safety screen, the splash screen, safe-area insets on a notched
device, and how any of it behaves when the app is backgrounded mid-session.
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
```

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
