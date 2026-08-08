# Agent Instructions for Cloud Native Days Norway

## Overview & Architecture

Multi-tenant website for Cloud Native conferences.
**Tech Stack:** TypeScript 5.8+, Next.js 15+ (App Router), Tailwind CSS 4+, Sanity.io, tRPC + React Query, NextAuth 5.0.

### Architecture Rules

- **Multi-tenant Isolation:** Use `resolveConferenceId()` in tRPC server-side. **NEVER accept `conferenceId` from the client.**
- **Cache Strategy:** Use Next.js 16+ `'use cache'` directive with `cacheLife` and `cacheTag`.
  - _Wrapper Pattern:_ Outer component reads `headers()` for domain, passes to inner cached component (`getConferenceForDomain(domain)`).
- **Admin Access:** Protected by `is_organizer: true` flag in user profile.
- **Filtering:** Filtering logic (Proposals, Sponsors) must reside on the API/Server side using Zod schemas.

## Commands

Project uses [mise](https://mise.jdx.sh/).

- `mise run all` (check, test, build) · `mise run check` (lint, typecheck, format check)
- `mise run dev` & `mise run storybook` (local servers)
- For CLI (`cli/` Rust): `cd cli && mise run <check|clippy|fmt|test|build>`

**Do NOT use `rtk`.** This file previously mandated it on every command. It is not installed, and independent benchmarking (JetBrains, 86 paired SkillsBench tasks, measuring real billing rather than rtk's self-reported metrics) found a **+7.6% cost _increase_** at low reasoning effort and ~zero at high — because it only intercepts Bash, while Read/Grep/Glob bypass it entirely, capping any saving near 3% of input tokens.

**Verification commands that are easy to get wrong:**

- **`next lint` is vacuous in Next 16** — it treats "lint" as a directory and exits 0 having linted nothing. Use `npx eslint .`.
- `tenancy/no-unscoped-groq` is **CI-ratcheted per file** (`pnpm run lint:tenancy`). A file may not gain a warning. Fixing sites is welcome — regenerate with `pnpm run lint:tenancy:update` in the same PR.
- **Playwright is broken on the primary dev machine** (every browser dies at launch, SIGTRAP). `pnpm shoot` cannot run, so **never claim visual verification**; add stories and rely on CI-published Storybook.
- **Production Sanity is readable** from this repo with no `.env` or token: `npx sanity documents query '...'`. Two traps: an _unauthenticated_ query returns `[]`/`0` rather than erroring, and a bare zero `count()` prints an error — wrap as `{"n": count(...)}`. Treat as **read-only** unless explicitly told otherwise.

## Agent discipline

These are the rules that repeatedly caught real defects here. Follow them without being re-told; a brief that repeats them is wasting tokens.

- **Sabotage-prove every guard.** Remove it, show the specific test fails, restore, show green. **Check file AND test counts every run** — a malformed edit that breaks an import silently stops tests and reads as a pass.
- **A test must fail on a VALUE or on the action succeeding, never on an absence.** Confirm nothing else in the path could produce the same refusal; a test that passes because an unrelated guard refuses with the same code proves nothing.
- **Guard before fetch.** Fetching then refusing leaks a 1-bit existence oracle (nonexistent vs foreign return different errors). Assert the fetch was never called.
- **Never drop a field from a GROQ projection without finding its consumers.** A missing field is `undefined`, not an error — it breaks silently in production.
- **A mock is never evidence about the thing it mocks.** `jose` is aliased suite-wide; to claim a library behaves some way, exercise the real one in a standalone `node -e`. Surprise about a mature dependency should trigger doubt, not excitement.
- **Answer every unresolved review-bot thread** before declaring work done. Bot threads outside the review brief have been the real defect repeatedly.
- **Work in an isolated worktree** (`git worktree add`). Several agents share this checkout and have overwritten each other's uncommitted work.
- **Do not overstate.** Name the holes you leave. The dominant defect on this project is a true-sounding claim that CI cannot falsify — not broken code.
- **Git:** conventional commits; **no AI co-author trailers** (a pre-push hook rejects them); never pass `-S` (no gpg here).
- **Keep the final report under ~400 words.** Put the evidence — sabotage matrices, before/after numbers, per-file tables, the reasoning — **in the PR body**, where a human reviews it and where it persists. The report back is a routing summary: what you built, what you proved, what you could not, what needs a decision. Reports have been running 1,500–2,500 words and duplicating the PR body verbatim; that is paid for twice and read once. **Brevity here is not less rigour — it is the same rigour, filed where it belongs.**

## Workflow

- **Branch + draft PR first:** For non-trivial work, create a branch and open a draft PR (title = intended work, body = plan) as the first action, unless told otherwise.
- **PR descriptions:** Pass multiline Markdown to `gh` with real newlines (never escaped `\n`); verify the rendered body with `gh pr view`.
- **Subagents:** Divide work across role-specific subagents.
- **Adversarial review:** When done, review changes with multiple adversarial-persona subagents; repeat until they find no real, actionable issues.
- **Finalize PR:** Update the PR title/description to describe the complete work (with plan) and remove draft status.
- **CI:** Don't stop after pushing — monitor CI and fix until all checks are green.

## Development Guidelines

- **Modularity:** No top-level sprawl. Put features in subdirectories with a barrel export (`index.ts`).
- **UI & Styling:** Tailwind v4.1+ (`size-full`, `shadow-xs`). Use Heroicons (`@heroicons/react` from `/24/outline` or `/24/solid`).
- **Dates:** Always use `src/lib/time.ts` (e.g., `formatConferenceDateLong()`). **No raw `new Date()` for display.**
- **Sanity CMS:** All array items MUST include a unique `_key` property (use `prepareArrayWithKeys`).
- **`conference` and `organization` schemas are APPEND-ONLY.** A second application (`RunKonf/kontroll`, the control panel at my.konf.app) reads those documents straight out of Sanity and does not compile against this repo, so a deleted or retyped field breaks it silently at runtime. Adding fields is always fine. `__tests__/sanity/schema-contract.test.ts` locks both types against `sanity/schema-shape.baseline.json`. **Escape hatch:** if a removal is intended, run `pnpm tsx scripts/update-schema-baseline.ts` and commit the regenerated baseline in the SAME PR. The narrow cross-app read contract lives in `src/lib/conference/contract.ts` (~10 fields, not the whole document; knip-ignored because its consumer is another repo) and is slated to move into a shared `@runkonf/core` package.
- **Privacy/GDPR:** Always update `/privacy` when adding data collection.
- **JSX/TSX:** Use HTML entities (`&apos;`, `&quot;`).
- **CLI Commits:** Use Conventional Commits (`feat:`, `fix:`) for `cli/` to auto-generate release notes. Never push without asking.

## Storybook & Testing

- **Storybook** is the single source of truth for UI/UX.
  - Component stories go in `Components/` or `Systems/{SystemName}/`.
  - **Deterministic Dates:** Mock `globalThis.Date` in Storybook `beforeEach` to fix relative dates (prevents visual diff thrashing).
- **Visual inspection is MANDATORY for UI work.** Whenever you create or change a component/layout, **look at the rendered result** — never conclude "it works" from code review, measurements, or unit tests alone (they miss overflow, truncation, spacing, and responsive bugs). Workflow:
  - Ensure the component has a Storybook story (add one if missing) so it's inspectable in isolation.
  - Screenshot it with **`pnpm shoot <story-id> [width] [height]`** (`scripts/shoot-story.mjs`) — defaults to iPhone-portrait (393×852, DPR 3), auto-starts Storybook, flattens decorator insets so the capture maps 1:1 to the app, and prints a hard per-card viewport-overflow check. Then actually view the PNG.
  - For full-screen/mobile views set `parameters.layout: 'fullscreen'` on the story so captures aren't inset.
  - Prefer isolated Storybook capture over trusting a deployed URL — a stale **PWA service worker** can serve an old bundle (see `public/sw.js` / `scripts/stamp-sw.mjs`); a Safari **Private tab** bypasses the SW when checking production.
- **Testing (Vitest):** Test behavior over implementation. Prefer integration tests. Mock at boundaries.
- **Storybook Interaction:** Use `play` functions for interactive tests (`storybook/test`).

## In-app notifications

The persistent notification hub (`src/lib/notification/*`, `src/server/routers/notification.ts`, `src/components/notifications/*`) is a durable, per-recipient inbox — surfaced by the `NotificationBell`. **Name-collision warning:** this is NOT the ephemeral toast system in `src/components/admin/NotificationProvider.tsx` (`useNotification()` / `showNotification()`), which shows transient, in-memory alerts and persists nothing. Keep the two straight — the bell may _bridge_ a new persistent notification into a toast, but they are separate systems.

- **Never-fail contract:** a notification write must NEVER fail (or roll back) the business mutation that triggered it. `createNotifications` catches and logs its own errors and never throws into the caller — do not wrap it expecting to react to failures. A submitted proposal stays submitted even if the organizer notification write fails.
- **Actor exclusion:** never notify the actor about their own action. Exclude `actorId` from the recipient set when fanning out.
- **Per-recipient fan-out in ONE transaction:** fan out one `notification` document PER recipient (read state is per-user), and write the whole batch in a single `clientWrite.transaction()` — or per-recipient chunked transactions where failure isolation is required (see `docs/MESSAGING_SYSTEM.md`).
- **Link conventions:** link to the most-specific page for the audience — `/admin/...` for organizers, `/cfp/...` for speakers (e.g. `/cfp/proposal/<id>`, `/admin/proposals/<id>`). Same event to both audiences → two inputs with different links.
- **Bus-handler vs router-inline:** emit from a domain **bus handler** when multiple call sites raise the same event or the emit is cross-cutting; emit **inline in the router/mutation** only when the notification is a one-off tightly coupled to that single mutation.
- **Retention:** notifications older than **90 days are hard-deleted** by a daily cron — **including unread ones**, with one exception: unread `message_received` notifications are exempt (they are the only store of per-recipient message unread state). The hub is not an archive; anything that must persist longer belongs in its own record.

See `docs/ADMIN_NOTIFICATION_SYSTEM.md` for the ephemeral toast system it is often confused with, and `docs/MESSAGING_SYSTEM.md` / `docs/MESSAGING_UX.md` for the speaker↔organizer messaging that rides this hub (note: unread `message_received` notifications are the one type EXEMPT from the 90-day purge).
