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
- **Testing (Vitest):** Test behavior over implementation. Prefer integration tests. Mock at boundaries.
- **Storybook Interaction:** Use `play` functions for interactive tests (`storybook/test`).
