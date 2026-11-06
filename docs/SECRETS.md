# Secrets

Where each platform secret lives, where its source of truth is, and how to rotate it (#1927). Names only; no values are in this repo. The source of truth is [fnox](https://fnox.jdx.dev) (`fnox.toml`, keychain provider): a key name below is a fnox key. Check names with `fnox list`, never with `--values`.

Environments: **Preview** and **Production** are separate everywhere. Never reuse a production value in preview, except the values marked shared.

## Table

| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (P-256 web push key pair, base64url; kontroll#61)                                                                                         | Worker `konf-identity[-preview]`; kontroll needs the public key to subscribe browsers                              | separate                                      | preview: `KONTROLL_PREVIEW_VAPID_PUBLIC_KEY` / `KONTROLL_PREVIEW_VAPID_PRIVATE_KEY`; production: none yet (gap) | Generate with `npx web-push generate-vapid-keys`, `wrangler secret put VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY --env <env>`, give kontroll the new public key. Rotating invalidates every stored subscription (browsers must subscribe again). `VAPID_SUBJECT` is a plain var (`mailto:hei@konf.app`). Unset: no pushes are sent. |

Deliberately shared, accepted by the owner: the GitHub and LinkedIn OAuth apps (one app serves preview and production) and the Sanity read token (preview reads the same token as production, though preview Workers read the `development` dataset). Everything else must differ between preview and production.

Gaps: `fnox.toml` references `KONF_<ENV>_BETTER_AUTH_SECRET`, `KONF_<ENV>_BETTER_AUTH_URL`, `KONF_<ENV>_CF_API_TOKEN`, `KONF_<ENV>_CF_ZONE_ID` and `KONF_<ENV>_PUSH_WEBHOOK_SECRET`, but the keychain may not hold them yet; `fnox check --all` shows which. `scripts/rotate-gateway-key.sh preview` creates the first pair. Whether Vercel Preview/Production hold the pairs above must be checked in the Vercel dashboard; this table says what they should hold.

Also set on Vercel, not secret: `KONF_API_URL` (see [PLATFORM.md](./PLATFORM.md#gateway-url); the site reads it since #1935, so it only takes effect once that PR is merged).

## Setting a Worker secret

Each Worker declares the secret names it needs, per environment: `secrets` in `services/<name>/service.cue` (generated into `secrets.json` by `pnpm scaffold:service`), and `api/secrets.json` for the gateway. Every fnox key below is a reference in `fnox.toml`; a CI test (`__tests__/scripts/secrets-sync.test.ts`) fails when a script asks for a key that is not there.

```sh
mise run secrets:sync -- <api|SERVICE> <preview|production>          # put every declared secret
mise run secrets:sync -- <api|SERVICE> <preview|production> --check  # list missing names only
```

The sync reads each value with `fnox get` and pipes it to `wrangler secret put --env`; it prints only `ok <NAME>`. The fnox key is `KONF_<ENV>_<NAME>` unless `scripts/secrets-sync.ts` maps it: `ENVELOPE_PRIVATE_KEY` reads `KONF_<ENV>_GATEWAY_PRIVATE_KEY`, `SANITY_API_TOKEN_READ` reads `SANITY_API_TOKEN_READ_PROD`, and the OAuth client ids and secrets read `ID_KONF_APP_*`. These shared keys are the owner's **accepted exceptions** to preview/production separation (`SHARED_ACROSS_ENVS` in the script); every other name is per environment, and a test fails if another name maps to one key for both. An empty `fnox get` value is never put: a required one fails, an optional one is skipped with a warning. Every wrangler call runs with `CLOUDFLARE_ACCOUNT_ID` forced to the RunKonf account, and the script refuses to start if you exported a different one. `--check` compares the declared names with `wrangler secret list`, no values.

Names are `required` (the Worker cannot run without them) or `optional` (the code degrades, for example push is a no-op or registration refuses). After every production deploy, `deploy-workers.yml` runs `--check` for each Worker: a missing required secret fails the job, a missing optional one is a warning. The sync skips an optional secret fnox does not hold. Undeclared secrets (the conference parity Slack webhook) are set by hand:

```sh
cd <api|services/NAME>
fnox get FNOX_KEY | npx wrangler secret put WORKER_NAME --env <preview|production>
```

New fnox references use `if_missing = "warn"`, so a key not yet in your keychain does not break `fnox exec` for the site. Production is the RunKonf Cloudflare account `eefa2cb5c8528a07d7bf8b00a6606dcd`. `.mise.toml` sets `CLOUDFLARE_ACCOUNT_ID` to it, so local wrangler never falls back to another account. **Wrangler must be logged in as a user with access to the RunKonf account:** `npx wrangler whoami` must list `eefa2cb5c8528a07d7bf8b00a6606dcd`. `secrets:sync` runs `wrangler whoami` before any write and refuses unless that account is listed.

## Gateway key

The gateway signs a short-lived envelope with `ENVELOPE_PRIVATE_KEY`; every subgraph verifies it with `GATEWAY_PUBLIC_KEY`.

```sh
scripts/rotate-gateway-key.sh preview     # or production (asks to confirm)
```

It generates the Ed25519 pair, stores both halves in fnox, then puts them on the gateway and the four subgraphs. It prints no key material. The Workers switch one at a time, so requests fail between the first and last `put`; run it in a quiet window and check `GET` on the public site afterwards. If it stops halfway, the new pair is already in fnox: re-run the remaining `wrangler secret put` steps by hand (see above).

## Site key

The site signs `x-konf-service` with `KONF_SITE_SIGNING_KEY`; the gateway verifies it against `SITE_PUBLIC_KEYS`, by `kid`. Rotation without downtime:

1. Generate a new pair with a new `kid` (command in [api/README.md](../api/README.md#secrets)).
2. Add the new public key to `SITE_PUBLIC_KEYS` (old kid stays), update `KONF_<ENV>_SITE_PUBLIC_KEYS` in fnox, `wrangler secret put SITE_PUBLIC_KEYS --env <env>` on the gateway.
3. Store the new private JWK in fnox as `KONF_<ENV>_SITE_SIGNING_KEY`, set it on Vercel for that environment, redeploy.
4. Once no old deploy is live, drop the old kid from `SITE_PUBLIC_KEYS` the same way.

## Shared pairs

`CLIENT_IP_SECRET`, `IDENTITY_EXCHANGE_SECRET` and `IDENTITY_UPGRADE_SECRET` are symmetric secrets held on both sides. Generate with `openssl rand -base64 32` piped into `fnox set <KEY>`, then put the same value on the Worker (`fnox get FNOX_KEY | wrangler secret put WORKER_NAME --env <env>`) and on Vercel for that environment. There is no overlap window, and a Vercel variable change only reaches a new deployment: set the Vercel variable first, redeploy, and update the Worker secret as soon as that deployment is live. The sides disagree in between. Effect while they disagree: client IP signing is ignored (the gateway falls back to `CF-Connecting-IP`); exchange and upgrade sign-ins fail.
