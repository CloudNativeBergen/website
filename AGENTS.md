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

## RTK - Token-Optimized Commands

**ALWAYS prefix terminal commands with `rtk`** (e.g., `rtk git status`, `rtk vitest`, `rtk tsc`, `rtk lint`, `rtk cargo test`). Also use in chains: `rtk git add . && rtk git commit -m "msg"`.
Project uses [mise](https://mise.jdx.sh/). Key commands:

- `rtk mise run all` (check, test, build)
- `rtk mise run check` (lint, typecheck, format check)
- `rtk next build` (Next.js build with compact route metrics)
- `rtk pnpm install` (compact dependency installation)
- `mise run dev` & `mise run storybook` (for local servers)
- For CLI (`cli/` Rust): `cd cli && rtk mise run <check|clippy|fmt|test|build>`

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
- **Privacy/GDPR:** Always update `/privacy` when adding data collection.
- **JSX/TSX:** Use HTML entities (`&apos;`, `&quot;`).
- **CLI Commits:** Use Conventional Commits (`feat:`, `fix:`) for `cli/` to auto-generate release notes. Never push without asking.

## Storybook & Testing

- **Storybook** is the single source of truth for UI/UX.
  - Component stories go in `Components/` or `Systems/{SystemName}/`.
  - **Deterministic Dates:** Mock `globalThis.Date` in Storybook `beforeEach` to fix relative dates (prevents visual diff thrashing).
- **Visual inspection is MANDATORY for UI work.** Whenever you create or change a component/layout, **look at the rendered result** — never conclude "it works" from code review, measurements, or unit tests alone (they miss overflow, truncation, spacing, and responsive bugs). Workflow:
  - Ensure the component has a Storybook story (add one if missing) so it's inspectable in isolation.
  - Screenshot it with **`rtk pnpm shoot <story-id> [width] [height]`** (`scripts/shoot-story.mjs`) — defaults to iPhone-portrait (393×852, DPR 3), auto-starts Storybook, flattens decorator insets so the capture maps 1:1 to the app, and prints a hard per-card viewport-overflow check. Then actually view the PNG.
  - For full-screen/mobile views set `parameters.layout: 'fullscreen'` on the story so captures aren't inset.
  - Prefer isolated Storybook capture over trusting a deployed URL — a stale **PWA service worker** can serve an old bundle (see `public/sw.js` / `scripts/stamp-sw.mjs`); a Safari **Private tab** bypasses the SW when checking production.
- **Testing (Vitest):** Test behavior over implementation. Prefer integration tests. Mock at boundaries.
- **Storybook Interaction:** Use `play` functions for interactive tests (`storybook/test`).

## In-app notifications

The persistent notification hub (`src/lib/notification/*`, `src/server/routers/notification.ts`, `src/components/notifications/*`) is a durable, per-recipient inbox — surfaced by the `NotificationBell`. **Name-collision warning:** this is NOT the ephemeral toast system in `src/components/admin/NotificationProvider.tsx` (`useNotification()` / `showNotification()`), which shows transient, in-memory alerts and persists nothing. Keep the two straight — the bell may _bridge_ a new persistent notification into a toast, but they are separate systems.

- **Never-fail contract:** a notification write must NEVER fail (or roll back) the business mutation that triggered it. `createNotifications` catches and logs its own errors and never throws into the caller — do not wrap it expecting to react to failures. A submitted proposal stays submitted even if the organizer notification write fails.
- **Actor exclusion:** never notify the actor about their own action. Exclude `actorId` from the recipient set when fanning out.
- **Per-recipient fan-out in ONE transaction:** fan out one `notification` document PER recipient (read state is per-user), and write the whole batch in a single `clientWrite.transaction()`.
- **Link conventions:** link to the most-specific page for the audience — `/admin/...` for organizers, `/cfp/...` for speakers (e.g. `/cfp/proposal/<id>`, `/admin/proposals/<id>`). Same event to both audiences → two inputs with different links.
- **Bus-handler vs router-inline:** emit from a domain **bus handler** when multiple call sites raise the same event or the emit is cross-cutting; emit **inline in the router/mutation** only when the notification is a one-off tightly coupled to that single mutation.
- **Retention:** notifications older than **90 days are hard-deleted** by a daily cron — **including unread ones**. The hub is not an archive; anything that must persist longer belongs in its own record.

See `docs/ADMIN_NOTIFICATION_SYSTEM.md` for the ephemeral toast system it is often confused with, and `docs/MESSAGING_SYSTEM.md` / `docs/MESSAGING_UX.md` for the speaker↔organizer messaging that rides this hub (note: unread `message_received` notifications are the one type EXEMPT from the 90-day purge).
