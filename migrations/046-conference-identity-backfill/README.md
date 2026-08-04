# Migration 046: Backfill the three existing editions' visual identity

## ⚠️ NOT RUN — maintainer decision required (run BEFORE the next default-neutralisation PR)

Running this is a deliberate maintainer action via the
[`Run Sanity Migration`](../../.github/workflows/run-migration.yml) workflow
after review. **It must be applied before any further neutralisation of the
platform's house defaults**, because it is precisely those defaults that these
three sites currently render from.

## Why

Konf is becoming a multi-tenant product where every conference configures its
own look. Today the platform's hardcoded defaults **are** Cloud Native Days'
visual identity: the house palette is their blue, the default page background is
the animated CNCF logo field, the prospectus copy is their wording. The three
existing sites render correctly _because nothing is configured_.

Neutralisation has already begun — `Logo.tsx` was deleted in #703, homepage
section copy moved to configuration in #702. Every further step silently drifts
these sites unless their identity is **explicit data on their own conference
documents first**. This migration writes, as stored values, exactly what the
fallbacks produce today.

## Documents it targets

Targeting is by **routing identity**, never by title or document order. A
conference is a target iff one of its `domains[]` entries would serve the target
host under `domainServesHost` — the exact predicate `getConferenceForDomain`
uses. Zero matches, two matches, or one document matching two targets **aborts
the whole run before a single patch is yielded** (`resolveTargets` in `plan.ts`).

| Edition                       | Host matched                 | Restores the legacy logo |
| ----------------------------- | ---------------------------- | ------------------------ |
| Cloud Native Days Norway 2026 | `2026.cloudnativedays.no`    | no — has its own         |
| Cloud Native Day Bergen 2025  | `2025.cloudnativebergen.dev` | yes                      |
| Cloud Native Day Bergen 2024  | `2024.cloudnativebergen.dev` | yes                      |

## What it writes, and where each value came from

Every write is conditional on the field being **absent**. Nothing is ever
overwritten.

| Field                          | Value                                                    | Source                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`                        | `{ primaryColor: '#1D4ED8', accentColor: '#06B6D4' }`    | Code: `DEFAULT_PRIMARY_COLOR` / `DEFAULT_ACCENT_COLOR` (`src/lib/branding/theme.ts`) = the `var(--brand-primary, #1d4ed8)` fallbacks in `tailwind.css`. **Live-verified:** all three `/manifest.webmanifest` serve `"theme_color":"#1D4ED8"`, and none of the three pages contains a `conferenceThemeCss` `:root` block — so no theme is stored today.                  |
| `backgroundPattern`            | `'cloud-native'`                                         | Code: `DEFAULT_BACKGROUND_PATTERN` (`src/lib/conference/backgroundPattern.ts`). **Live-verified:** the background layer on all three pages is byte-identical over 60 584 characters and carries 98 `<img>` icons (49 light + 49 dark) at ~0.108 max opacity — the dense `iconCount: 50 / opacity: 0.1` setting, not `subtle` (14 / 0.04) and not `none` (layer absent). |
| `logoBright`, `logomarkBright` | The Cloud Native Bergen mark (`legacy-brand.ts`)         | Code history: mechanically extracted from `git show 3175974f^:src/components/Logo.tsx` — the `<Logo>` / `<Logomark>` fallback #703 deleted. **Bergen editions only.**                                                                                                                                                                                                   |
| `sponsorshipCustomization.*`   | The eight prospectus strings, merged under existing keys | Code: the `\|\|` fallbacks in `src/components/sponsor/SponsorProspectus.tsx:54-72`. **Live-verified:** every string appears verbatim on all three `/sponsor` pages — except `heroHeadline` on Norway 2026, which already stores its own. That is why the object is merged per key rather than written whole.                                                            |

## Why it is a visual no-op — and the two places it is not

`theme` and `backgroundPattern` write the value the fallback already produces;
`sponsorshipCustomization` writes the string the component already renders.
Applying them changes nothing on screen. Two exceptions, both deliberate:

**1. The Bergen logo writes revert an already-live regression.** #703 has
shipped, so both Bergen sites are _already_ rendering a generated name-wordmark
instead of their logo (`aria-label="Conference logo"` count is 0 on both), and
their PWA icon falls through to `DEFAULT_LOGOMARK_SVG`. These writes are a no-op
against the **pre-#703** site, not against today's. The restored markup:

- round-trips byte-for-byte through `sanitizeSvgUpload`, the authoritative
  write-path gate — i.e. it is exactly what an admin upload would have stored;
- rasterizes to a PWA icon **byte-identical** to the current fallback at 512,
  512-maskable and apple-touch (asserted in `plan.test.ts` via resvg — same path
  data, same gradient stops);
- keeps the `text-brand-slate-gray dark:text-white` utilities the deleted
  component used, so the wordmark still flips slate → white in dark mode from a
  single stored `*Bright` slot (no `*Dark` slot is written, which is what keeps
  `ConferenceLogo` on its single-element render path).

**2. Storing a theme changes four dark-mode declarations.** Measured by
rendering the deployed Tailwind CSS with and without the exact `<style>`
`conferenceThemeCss()` would inject (5 of 12 probes differ):

| Utility                           | Mode | Today                 | With the theme stored                      |
| --------------------------------- | ---- | --------------------- | ------------------------------------------ |
| `hover:bg-brand-cloud-blue-hover` | both | `#1E40AF`             | `color-mix(#1D4ED8 85%, #000)` ≈ `#1942B8` |
| `bg-brand-cloud-blue`             | dark | `#1E40AF`             | `#1D4ED8`                                  |
| `bg-brand-gradient`               | dark | `#1E3A8A` → `#155E75` | `#1D4ED8` → `#06B6D4`                      |
| `border-brand-cloud-blue`         | dark | `#2563EB`             | `#1D4ED8`                                  |

This is the documented L1 design, not a bug: the `.dark` rules read the same
`--brand-primary` / `--brand-accent` with their **own darker fallbacks**
(`tailwind.css:344, 533-534, 568`), so one `:root` injection re-skins both modes
and a themed tenant loses the bespoke dark tints. **The alternative is worse** —
leaving the theme unset means both light _and_ dark drift completely the moment
the house palette is neutralised. See the decision item in the manual list below.

## Idempotency

Safe to run repeatedly. Each field is written only when absent, so a re-run
yields an empty changeset; `plan.test.ts` asserts `planSets` returns `[]` when
applied to its own output. A stored theme — including a schema-invalid **half**
theme, which the platform renders as fully unthemed — is left exactly alone, as
is a deliberately non-default `backgroundPattern` (e.g. `'none'`) and any
uploaded logo. Drafts are skipped; the published document owns the fields.

## Running the migration

Via the **`Run Sanity Migration`** GitHub Actions workflow (`workflow_dispatch`):

- **migration**: `046-conference-identity-backfill`
- **dataset**: `production`

The workflow exports a dataset backup artifact, performs a **dry run**, and only
then applies. The dry-run log prints, per edition, every field it would set with
its reason, plus every manual follow-up it detected in the real data — read it
before the apply step.

Equivalent local invocation:

```bash
pnpm sanity migration run 046-conference-identity-backfill \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
pnpm sanity migration run 046-conference-identity-backfill \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

```bash
# All three must report a stored theme, a pattern and (Bergen) a logo.
npx sanity documents query '*[_type == "conference" && !(_id in path("drafts.**"))]{
  _id, title, domains, theme, backgroundPattern,
  "hasLogo": defined(logoBright), "hasMark": defined(logomarkBright),
  "sponsorshipKeys": count(sponsorshipCustomization)
}'
```

Then, on each site (use a **Safari Private tab** — a stale service worker will
otherwise serve the old bundle):

- `curl -s https://2025.cloudnativebergen.dev/ | grep -c 'aria-label="Conference logo"'` → `2` or more (was `0`).
- `curl -s https://<host>/ | grep -o ':root{--brand-primary[^}]*}'` → the injected theme block appears.
- `curl -s https://<host>/manifest.webmanifest | grep theme_color` → still `#1D4ED8`.

## What would break if this were skipped

The next PR that points the house palette at Konf's colours re-skins all three
sites in one deploy — every button, link, focus ring, badge and brand gradient.
Neutralising `DEFAULT_BACKGROUND_PATTERN` removes the CNCF logo field from every
page background. Neutralising the prospectus copy replaces the entire `/sponsor`
hero and philosophy sections. None of it is recoverable from the sites
themselves once the defaults have moved — which is why the values are hardcoded
in `plan.ts` rather than imported from the constants they mirror.

---

# MANUAL SETUP — things this migration deliberately does not do

## PRE-MERGE

Do these **before** the next PR that neutralises a house default.

### P1 · Decide the dark-mode theme question (Cloud Native Days, all three)

- **What:** accept the four dark-mode deltas in the table above, or keep the
  bespoke dark tints by giving them their own variables first.
- **Where:** `src/styles/tailwind.css` lines `344`, `533-534`, `568` — the four
  `.dark` declarations that read `var(--brand-primary|--brand-accent, <darker hex>)`.
  Keeping them means emitting `--brand-primary-dark` / `--brand-accent-dark`
  from `conferenceThemeCss` (`src/lib/branding/theme.ts`) and reading those in
  the `.dark` rules.
- **If left as-is:** the three sites' dark mode gets a slightly brighter primary,
  a slightly darker border and a noticeably brighter hero gradient. Light mode is
  unchanged apart from the hover shade.
- **Verify:** toggle dark mode on `https://2025.cloudnativebergen.dev/` and
  compare the hero gradient before/after the migration.

### P2 · Run this migration (all three editions)

- **What:** the `Run Sanity Migration` workflow, migration
  `046-conference-identity-backfill`, dataset `production`.
- **If left undone:** everything under "What would break if this were skipped".
- **Verify:** the queries in the Verification section above.

## POST-MERGE

Safe to do afterwards.

### M1 · Homepage section copy (all three editions)

- **What:** the sponsors band description, the sponsor CTA description and the
  gallery description are still house copy (`"…fueling the cluster and keeping
the pods running!"`, `"Level up your brand's visibility among Kubernetes
enthusiasts…"`, `"Relive the energy and excitement from our past events…"`).
- **Why not migrated:** none of the three has a stored `homepageSections`, so
  the homepage renders `getDefaultSections()`, which is **phase-aware** — a
  published schedule swaps Featured Speakers for Program Highlights. Writing the
  array would freeze that choice, and Norway 2026 has not published its schedule
  yet. That is a behavioural regression a backfill must not cause.
- **Where:** Admin → Settings → Homepage (the section editor). Opening it and
  saving materialises the array as a deliberate act; set the copy there.
- **If left unset:** those three strings revert to whatever the neutralised
  defaults become. Everything else in those bands is already tenant-derived.
- **Verify:** `curl -s https://<host>/ | grep -c 'fueling the cluster'` → `0`
  once configured.

### M2 · Two hardcoded `<Sponsors>` call sites (code, not data)

- **What:** `src/app/(main)/program/page.tsx:128-131` and
  `src/components/sponsor/SponsorProspectus.tsx:501-505` render `<Sponsors>`
  without copy props, so they always show the house band copy no matter what is
  stored.
- **If left as-is:** after M1 the homepage and the program page disagree about
  the sponsors band wording.
- **Verify:** compare the sponsors heading/description on `/` and `/program`.

### M3 · Platform PWA fallback mark (code, not data)

- **What:** `src/lib/pwa/default-mark.ts` still ships the Cloud Native Days mark
  as `DEFAULT_LOGOMARK_SVG`. After this migration all three editions store their
  own `logomarkBright`, so the fallback is unreachable **for them**.
- **If left as-is:** any NEW tenant that has not uploaded a square mark installs
  with Cloud Native Days' home-screen icon. The file's own header documents this
  gap and why (resvg has no font configured for a generated monogram).
- **Verify:** `curl -s https://<new-tenant>/pwa/icon/512 | md5` compared with
  `md5 public/icon-512.png` — a match means the tenant is on the house fallback.

## Could not be determined from outside — and therefore skipped

- **Whether `backgroundPattern` is absent or explicitly `'cloud-native'`** on any
  edition. Both render identically, so the live sites cannot distinguish them.
  Harmless: the migration writes only when absent, and the value is the same
  either way.
- **`logomarkDark` for Cloud Native Days Norway 2026.** Its `logomarkBright` is
  stored (the Sponsors CTA renders a single `class="block"` wrapper, and
  `/pwa/icon/512` returns its own mark), but nothing on a public surface reveals
  whether a dark mark exists. Not written — an absent `logomarkDark` correctly
  falls back to the bright one.
- **Anything about drafts.** Not readable from outside and not touched.

## Rollback

Every write is additive and reproduces the current rendered output, so there is
normally nothing to roll back. To undo, unset the fields listed in "What it
writes" on the three documents, or restore from the backup artifact the workflow
produced.
