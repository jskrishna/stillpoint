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
