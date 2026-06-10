# contributing to couchcircle

glad you're here. quick orientation before you open a PR.

---

## running it locally

```bash
npm install
npm run dev          # Next.js dev server — http://localhost:3000
npx partykit dev     # PartyKit server — ws://localhost:1999
```

both need to run at the same time. open two terminals or use your
preferred process manager. environment variables go in `.env.local`
(not committed — see ARCHITECTURE.md for what's expected).

---

## what CI checks

every PR and push to `main` runs **ci.yml**:

1. `npm ci` — clean install, fully reproducible
2. `npx tsc --noEmit` — no type errors allowed
3. `npm run build` — Next.js must build clean
4. gitleaks secret scan — nothing sensitive sneaks in
5. PartyKit dev server boots on port 1999, then
   `node scripts/load-test.mjs 127.0.0.1:1999 8` hammers it with 8
   concurrent clients and asserts join latency, broadcast fan-out, and
   room-full rejection. all checks must pass — this step is not
   `continue-on-error`.

PRs cannot merge until the `ci` status check is green.

---

## how deploys work

pushing to `main` triggers **deploy.yml** (after CI). two steps:

1. **PartyKit** — `npx partykit deploy` pushes the edge worker to
   `couchcircle.partykit.dev`. the `ALLOWED_ORIGINS` var is set inline
   so only the production frontends can connect.

2. **Vercel** — `npx vercel deploy --prod` ships the Next.js front-end.
   the workflow already knows the project and org IDs from the repo's
   `.vercel/project.json` and passes them as plain env values.

3. **smoke test** — the workflow curls the lobby endpoint (expect
   2xx + JSON) and the Vercel homepage (expect 200) and fails loud
   if either is wrong.

both deploy steps guard for missing secrets: if you're working in a
fork, they print a clear warning and exit 0 so your CI still goes green.

---

## deploying your own couch

fork the repo, then add these secrets in your fork's
**Settings → Secrets and variables → Actions**:

| secret | how to get it |
|---|---|
| `PARTYKIT_TOKEN` | run `partykit login`, then grab `access_token` from `~/.partykit/config.json` |
| `VERCEL_TOKEN` | create a token at vercel.com/account/tokens (or find the local CLI token in `~/.local/share/com.vercel.cli/auth.json`) |

you'll also want to update the `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`
values in `deploy.yml` to match your own Vercel project — find them in
`.vercel/project.json` after running `vercel link`.

`PARTYKIT_LOGIN` is hardcoded to `alliecatowo` in the workflow — change
that to your PartyKit username if you fork.

no other secrets are required. `GITLEAKS_LICENSE` is only needed for
private repos; on a public fork gitleaks runs free and the secret can
be left unset.

---

## a note on scope

the product has a binding contract in **ARCHITECTURE.md** and
**CONCEPTS.md**. read both before touching anything in `party/`,
`lib/`, or the sync engine. the copy voice matters — see CONCEPTS.md
§"canon copy".

questions → open an issue or drop a note in a PR.
