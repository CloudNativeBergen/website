# End-to-end auth tests (Playwright)

Real-browser login / session tests for the Next.js app (#451). Distinct from the
Storybook test-runner (which also uses Playwright). These drive the app's **real
auth gate** using a minted session cookie rather than a live OAuth round-trip.

> ⚠️ **Scaffold — not yet run.** This harness was authored in an environment
> where the app could not boot (`@playwright/test` not installed; `next build`
> fails on a missing `@digitalbazaar/vc` dep). Run it once in a working env and
> adjust the best-effort selectors in `auth.spec.ts` as needed.

## One-time setup

`@playwright/test` is intentionally **not** in `package.json` — it couldn't be
added in the authoring sandbox without desyncing the frozen lockfile. Add it,
then fetch the browsers:

```bash
pnpm add -D @playwright/test  # pin to the same version as `playwright` in package.json
pnpm exec playwright install  # downloads the browser binaries
```

The e2e files are excluded from `tsc` / `eslint` / `vitest` (see the exclude
notes in tsconfig.json, eslint.config.js, vitest.config.ts) so the repo stays
green until you install the runner.

## Required env (via `.env.local`, auto-loaded by `playwright.config.ts`)

| Var                                                          | Purpose                                                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                                | **Required.** Must match the running app's secret — the cookie is minted with it and the app decodes it.                                                                                      |
| `E2E_SPEAKER_ID`                                             | Speaker `_id` the session represents. Point at a **real seeded speaker** in your Sanity dataset so speaker-dependent pages (dashboard proposals, profile) resolve. Defaults to a placeholder. |
| `E2E_SPEAKER_SUB` / `E2E_SPEAKER_EMAIL` / `E2E_SPEAKER_NAME` | Session identity fields.                                                                                                                                                                      |
| `E2E_SPEAKER_IS_ORGANIZER`                                   | `true` to exercise `/admin/*` routes.                                                                                                                                                         |
| `E2E_BASE_URL`                                               | Override the target (default `http://localhost:3000`).                                                                                                                                        |

The app also needs its usual dev env (Sanity project/dataset, etc.) to boot.

## Run

```bash
pnpm test:e2e         # headless
pnpm test:e2e:ui      # Playwright UI mode
```

`playwright.config.ts` boots `pnpm dev` automatically (or reuses a running dev
server). The `setup` project mints the session cookie into
`e2e/.auth/user.json`, which the authenticated specs load as storage state.

## What's covered

- unauthenticated → protected route redirects to sign-in
- authenticated user reaches the speaker dashboard (no redirect)
- the signed-in user menu (avatar) renders
- session persists across navigation between protected pages
- sign-out de-authenticates and re-blocks the protected route

## Deferred (tracked in #451)

- the self-service **provider-linking** flow and its shared-browser abuse
  residual — needs the link-intent cookie + a second-provider callback, which
  this cookie-minting scaffold doesn't drive yet. The integrity/abuse logic is
  unit-covered in `__tests__/lib/auth/auth-link-abuse.test.ts`.
- **MSW-mocked OAuth** for a true end-to-end sign-in _click-through_ (vs. the
  minted-cookie shortcut). Requires MSW intercepting the server-side token
  exchange in the running app.

## Notes on the auth approach

The app decodes the session in its `jwt` callback and returns `{}` (signed out)
if a read token lacks **both** `account` and `speaker`, so `utils/session.ts`
mints both (plus `slug`/`image` so slug-gated UI renders). The cookie name
(`__Secure-` prefix vs bare), its `Secure` flag, and its domain are derived from
`E2E_BASE_URL`, so pointing at an https or non-localhost target Just Works.
