# Schedule Drafts & Versioning Architecture

## Overview

This document outlines the architectural strategy for enabling "Organizer Lists" (Schedule Drafts) using your bespoke React-based drag-and-drop Schedule Editor. By extending the existing Sanity `schedule` document model and updating the React UI, organizers can safely build schedules using unapproved talks before publishing them to the public site.

## 1. The Data Model Extension & Decoupling

We will extend the `sanity/schemaTypes/schedule.ts` document with three fields to support ownership and snapshot versioning:

- **`status` (String):** `draft`, `official`, or `archived`.
- **`version` (Integer):** An incrementing integer for snapshot tracking.
- **`owner` (Reference):** A reference to the `staff` or `user` who created the draft.

**Strict Typing & Enums:** To prevent string-literal anti-patterns, we will define a canonical `enum ScheduleStatus` in `website/src/lib/schedule/types.ts` (`Draft`, `Official`, `Archived`). This enum will be explicitly imported into the Sanity schema definition (`schedule.ts`), the Next.js GROQ builders, and the tRPC validators. A mirroring Rust enum (`ScheduleStatus`) will also be added to `konfctl/src/types/schedule.rs` for type-safe CLI interactions.

**CRITICAL DECOUPLING:** Currently, the `conference` document holds an array of references to official schedules (`conference.schedules`). **Draft schedules must NEVER be added to this array.** If a draft is added to `conference.schedules`, the public site's GROQ queries will automatically pull it down and expose it. Instead, drafts exist as freestanding `schedule` documents pointing back to the conference. The React Editor (`getScheduleData` in `server.ts`) must be updated to explicitly query Sanity for _all_ schedules (both drafts and official) via `*[_type == "schedule" && conference._ref == $id]`, ensuring the editor sees everything while the public site continues to safely trust only what is strictly inside the `conference.schedules` array.

## 2. The Schedule Editor UI Enhancements

Since you are using a custom React Schedule Editor (`src/components/admin/schedule/ScheduleEditor.tsx`), we have full control over the drafting experience.

### A. The "Unassigned Talks" Query

**The Problem:** The left-hand panel (`UnassignedProposals.tsx`) currently queries the tRPC backend only for `accepted` or `confirmed` proposals, preventing organizers from experimenting with `submitted` talks.
**The Change:** Update the tRPC endpoint to return all proposals (including `submitted` and `waitlisted`). Add a visual cue to the Legend (e.g., a blue dotted border for `Submitted`) so organizers instantly recognize that a talk is not yet approved when dragged onto the grid.

### B. Draft vs. Publish Workflow

**The Problem:** The editor currently only has a single "Save" button that writes directly to the official schedule.
**The Change:**

- Introduce a global **"Draft Mode" toggle** at the top of the screen next to the "Save" button.
- **The Fallback Union:** When Draft Mode is active, the React UI must intelligently merge states. If an organizer has a draft for Day 2 but not Day 1, the UI renders the Official Day 1 and the Draft Day 2. If the user edits Day 1 and hits "Save Draft", it safely forks Day 1 into a new draft.
- When in Draft Mode, the primary action button becomes **"Save Draft"** (which sets `status: 'draft'`). When in Official Mode, it becomes **"Publish"** (which sets `status: 'official'`).

### C. Frontend Publish Validation

**The Problem:** It must be physically impossible to publish a schedule that contains unapproved talks or overlapping times.
**The Change:** When "Publish" is clicked, the React component must iterate over every card on the grid. If it detects a talk with `status === 'submitted'`, it aborts the save and displays a toast error: _"Cannot publish: Schedule contains unapproved talks."_ It must also mathematically assert that `endTime <= next startTime` across all tracks.

### D. Mobile Schedule Editor Sync

**The Problem:** The editor renders a distinct UI (`MobileScheduleView.tsx`) for phone users to support tap-driven assignments. This mobile tree must stay in feature-parity with the desktop drag-and-drop board.
**The Change:**

- Ensure the new "Save Draft" vs "Publish" buttons are perfectly mirrored in the mobile view's action bar.
- Since both views share the `handleSave` dispatcher in `ScheduleEditor.tsx`, the frontend validation logic (blocking unapproved talks and checking time geometry) must be centralized in `handleSave` so it seamlessly protects both desktop and mobile users before the tRPC mutation fires.

## 3. The Backend tRPC Validations (The Safety Net)

The frontend validation must be backed by strict server-side rules.

- **The Change:** In the `saveSchedule` tRPC router, if the incoming payload requests `status: 'official'`, the server must fetch the status of all included talks. If any are unaccepted, it throws a `TRPCError(BAD_REQUEST)`. This acts as a bulletproof seal protecting the public schedule.

## 4. Snapshot Versioning Strategy

Git-style versioning (branching, diffing arrays, and resolving merge conflicts) is overly ambitious and highly complex. Instead, we implement **Snapshot Versioning**:

1. **Drafting:** Saving a draft creates or updates a document with `status: 'draft'` and `version: n+1`.
2. **Promoting:** When published, the tRPC endpoint marks the currently active `official` schedule as `archived`, promotes the target draft to `official`, and **swaps the reference** in the `conference.schedules` array to point to the newly promoted document.
3. **Immutability:** This append-only system retains a perfect historical audit trail (e.g., viewing `v1` vs `v2`) with zero merge conflicts.

## 5. Critical Edge Cases & Mitigations

### A. The Reverse-Lookup Collision

**The Risk:** Throughout the Next.js app (`src/lib/...`), GROQ reverse lookups are used to find a speaker's time slot. If drafts exist, the query will return non-deterministic results, exposing unapproved draft times on public speaker pages.
**The Fix:** Every reverse lookup must enforce `status == 'official'`.

### B. Automated Reminder Engine

**The Risk:** The cron job in `src/lib/reminders/runner.ts` queries the schedule to send emails. Querying a draft schedule will hallucinate start times.
**The Fix:** Ensure the reminder GROQ explicitly filters `status == 'official'`.

### C. State Transition Desync

**The Risk:** Placing a `submitted` talk on a draft schedule does not change its status. If a draft is promoted containing unapproved talks, they bypass the acceptance pipeline (including emails).
**The Fix (Strict Block):** We enforce a strict workflow. The `publishSchedule` mutation does **not** auto-accept talks. If it detects any unapproved talks in the payload, it throws a hard error. Organizers are forced to manually accept the talks in the Proposals list (firing the necessary emails) before the system allows them to publish the schedule.

## 6. Migration Strategy

To ensure data purity moving forward, we will execute a one-off Sanity migration script. This script will iterate through all existing `schedule` documents in production and explicitly tag them with `status: 'official'` and `version: 1`, preventing undefined states and guaranteeing the public site remains completely stable during the rollout.

## 7. CLI Extensions (konfctl)

To provide full terminal-based management consistent with the existing `proposals` and `speakers` commands, we will extend `konfctl` with a complete CRUD lifecycle for schedules.

### A. tRPC Backend Support

We are fundamentally restructuring the `schedule` tRPC router (`src/server/routers/schedule.ts`) to support a complete CRUD lifecycle:

**1. Upgrading the Existing `save` Mutation:**

- The `SaveScheduleSchema` will be expanded to accept the new `status` enum (`Draft` vs `Official`).
- The mutation logic will be upgraded to enforce the **Strict Block**: If the payload is marked `Official`, the router will fetch all included talks and throw a `TRPCError(BAD_REQUEST)` if any are unapproved, physically preventing a publish.
- The save operation will correctly route to creating a new standalone draft document or updating an existing one, rather than just mutating the official array.

**2. New Admin Endpoints (For CLI & Future UI):**
To match the standard admin router pattern, we will add:

- `schedule.admin.list`: Fetches all schedules (optionally filtered by `status`).
- `schedule.admin.getById`: Fetches the raw JSON payload of a specific schedule.
- `schedule.admin.delete`: Deletes a draft schedule (blocks deletion of `official` schedules).
- `schedule.action`: Handles the atomic promotion swap (`action: 'promote'`).

### B. CLI Subcommands (`konfctl schedule`)

The `konfctl/src/commands/schedule` module will be scaffolded to include:

- `konfctl schedule list [--status <official|draft|archived>]`: Lists schedules via `schedule.admin.list`, formatted cleanly using the CLI's standard `display` tables.
- `konfctl schedule get <id>`: Fetches and outputs the schedule JSON payload.
- `konfctl schedule delete <id>`: Prompts for confirmation before deleting a draft.
- `konfctl schedule promote <id>`: Triggers the atomic swap to promote a draft to the official `conference.schedules` array.

## 8. Backend Auto-Forking (Preventing Data Corruption)

**The Risk (Accidental Mutation):** If an organizer views an `official` schedule and clicks "Save Draft", the React Editor passes the official document's `_id` to the backend. If the backend blindly patches it with `status: 'draft'`, the official schedule is destroyed.
**The Fix:** The tRPC `save` mutation implements an **Auto-Fork Guard**. If `input.status === 'draft'`, but Sanity indicates the target `_id` is currently `official`, the backend explicitly strips the `_id` and creates a brand new draft document. It returns the new `_id` to the React client so the local reducer can sync to the newly forked draft.

## 9. Next.js Data Flow (Preventing Tab Duplication)

**The Risk (Tab Duplication):** The React Editor derives its Day Tabs (Day 1, Day 2) directly from the array length of `initialSchedules`. If `getScheduleData()` returns both the Official Day 1 and the Draft Day 1 in a flat array, the UI will render two identical "Day 1" tabs and crash the user experience.
**The Fix:** The Server Action `getScheduleData()` must explicitly segregate the data into `{ officialSchedules: EditorSchedule[], draftSchedules: EditorSchedule[] }`. The `ScheduleEditorProps` will be updated to accept both arrays independently, allowing the React component to seamlessly toggle between them without mutating array lengths or confusing the `currentDayIndex`.
