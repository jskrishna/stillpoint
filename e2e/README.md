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

## The admin console

`admin.mjs` checks who may read what. A safety flag's excerpt is the user's own
words at the moment they said they were not safe, so most of this script is
asserting that an ordinary account cannot reach it — that the text is absent
from the response, not merely hidden.

It also covers the step-prompt editor: that an incomplete protocol blocks
publishing, that the server refuses it with a 422 and the problem list even when
the request bypasses the button, and that an edit survives a reload.

It needs an admin account, which the API deliberately cannot make: `role` is
not fillable, so no request can set it. Make one with artisan:

```bash
cd apps/api && php artisan tinker --execute="
  \$u = App\Models\User::firstOrCreate(
    ['email' => 'admin@stillpoint.test'],
    ['name' => 'Admin', 'password' => 'correct-horse-battery-staple'],
  );
  \$u->role = App\Domain\Role::Admin;
  \$u->save();
"
node e2e/admin.mjs
```

`ADMIN_EMAIL` and `ADMIN_PASSWORD` override the defaults.

## The accessibility audit

`a11y.mjs` runs axe-core over every route in both palettes at 390 and 1440 — 60
combinations — against the same two servers. `CLAUDE.md` asks for it after UI
work.

```bash
node e2e/a11y.mjs
```

It registers its own account so the routes behind a token render something
rather than redirecting, and signs in as the admin above for the console —
signed out those render a one-line "the console is for staff", which is not the
screen worth auditing. Without an admin account the console's routes are
skipped, and the run says so rather than passing on a refusal. Contrast is already covered at the token level by
`packages/design-tokens/src/contrast.test.ts`; what this catches is the rest — a
control with no accessible name, a label with nothing to label, a heading level
skipped, a pairing that only exists once a component is rendered.
