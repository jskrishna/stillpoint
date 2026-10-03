# End-to-end check

`flow.mjs` drives a real browser through the web app against a running Laravel
API: register, consent, a full six-step session, the journal, insights,
settings, the safety stop, and sign-out.

It is a script and not part of `pnpm run check`, because it needs two servers
and CI has neither. Run it by hand after changing the session flow, the API
client or anything in `apps/api/app/Domain`.

```bash
# 1. the API, on :8000
cd apps/api && php artisan serve --port=8000 &

# 2. the web app, on :3000  (the API's CORS list allows localhost and 127.0.0.1)
pnpm run build
cd apps/web && npx next start --port 3000 &

# 3. the check
node e2e/flow.mjs
```

`WEB_URL` and `CHROMIUM_PATH` override the defaults.

The section that matters most is the last one. It types crisis language into the
browser and asserts that the **server** ends the session, that the Tele-MANAS
and 112 numbers are shown, and that no journal row was written. Those are the
rules in `CLAUDE.md` that must never be weakened, checked against the real
stack rather than a mock.

## The accessibility audit

`a11y.mjs` runs axe-core over every route in both palettes at 390 and 1440 — 60
combinations — against the same two servers. `CLAUDE.md` asks for it after UI
work.

```bash
node e2e/a11y.mjs
```

It registers its own account so the routes behind a token render something
rather than redirecting. Contrast is already covered at the token level by
`packages/design-tokens/src/contrast.test.ts`; what this catches is the rest — a
control with no accessible name, a label with nothing to label, a heading level
skipped, a pairing that only exists once a component is rendered.
