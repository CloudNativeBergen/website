# Admin Dashboard System

The admin dashboard is a widget-based command center for conference organizers. It provides contextual insights and actions that adapt to the conference lifecycle — from initial planning through post-event wrap-up.

## Design Principles

- **Phase-aware** — Every widget adapts its content based on the current conference phase. A single widget evolves through the lifecycle rather than being replaced by separate components.
- **Desktop-first** — Designed for organizer workflows on laptop and desktop screens.
- **Fetch-on-mount** — Widgets load data when they mount. No polling or real-time updates.
- **Conference-scoped** — All data is scoped to the active conference.
- **Customizable layout** — Organizers can drag, drop, resize, add, and remove widgets.
- **Resilient** — Each widget handles its own loading, empty, and error states independently via error boundaries.

## Conference Lifecycle Phases

Phase is calculated from conference date fields using `getCurrentPhase(conference)` — never stored as state.

| Phase               | Timing                        | Focus                                             |
| ------------------- | ----------------------------- | ------------------------------------------------- |
| **Initialization**  | Creation → CFP Start          | Configuration, sponsor recruitment, team building |
| **Planning**        | CFP Start → CFP Close         | Submissions, reviews, speaker engagement          |
| **Execution**       | Program Published → Event End | Schedule, tickets, workshops, logistics           |
| **Post-conference** | After Event End               | Archives, analytics, expense reconciliation       |

## Architecture

### Grid System

The dashboard uses a responsive 12-column grid powered by `@dnd-kit` for drag-and-drop.

| Breakpoint | Columns | Min Width |
| ---------- | ------- | --------- |
| Desktop    | 12      | 1024px    |
| Tablet     | 6       | 768px     |
| Mobile     | 4       | &lt;768px |

Configuration (row height, gap, breakpoints) is defined once in `GRID_CONFIG` within `constants.ts`. Cell width is calculated dynamically from the viewport.

### Component Hierarchy

```text
AdminDashboard
├── DashboardGrid          ← drag-drop container, layout state
│   └── WidgetContainer    ← positioning, resize handles, edit controls
│       └── WidgetErrorBoundary
│           └── [Widget]   ← data fetching, phase rendering
└── WidgetPicker           ← category browser for adding widgets
```

- **AdminDashboard** — Top-level orchestrator. Manages widget list, edit mode, persistence, column count.
- **DashboardGrid** — Renders the grid, handles drag events, passes each widget to its render callback.
- **WidgetContainer** — Wraps each widget with positioning styles, resize handles (in edit mode), and macOS-style close/configure controls.
- **WidgetErrorBoundary** — Catches render errors per widget to prevent cascading failures.
- **WidgetPicker** — Modal with category-based browsing and search for adding new widgets.

### Widget Pattern

All 13 widgets follow the same structure:

1. **Data fetching** via the `useWidgetData<T>` hook — eliminates boilerplate `useState` + `useEffect` + error/loading patterns.
2. **Phase detection** via `getCurrentPhase(conference)` — determines which view to render.
3. **Shared UI primitives** from `widgets/shared.tsx` — `WidgetSkeleton`, `WidgetEmptyState`, `WidgetHeader`, `PhaseBadge`, `ProgressBar`.
4. **Phase-specific views** — Each widget renders a different layout for initialization, planning/execution (operational), and post-conference phases.

### Widget Registry

Every widget type is registered in `widget-registry.ts` with metadata:

- Display name, description, icon, category
- Size constraints (min/max cols and rows)
- Default and available sizes
- Phase configuration (relevant phases, adaptive behavior)
- Optional configuration schema (Zod-validated fields rendered in `WidgetConfigModal`)

Categories: **Core** (blue), **Analytics** (purple), **Operations** (green), **Engagement** (orange).

### Presets

Pre-built widget configurations in `presets.ts` provide ready-made layouts: Planning, Execution, Financial, Comprehensive, and Empty. In edit mode, the floating **Layout** control opens a preset picker (`PresetMenu`); applying a preset replaces the current layout after an explicit confirmation and persists like any other edit. There is no separate "reset" control — the Planning preset is marked as the default in the picker, and applying it is the reset. A dashboard with no saved config loads the Planning preset.

### Layout Persistence

Dashboard layouts are persisted **per-organizer** via Sanity using the `dashboardConfig` document type. Each organizer's layout lives in its own document with a deterministic id — `dashboardConfig-<conferenceId>-<speakerId>` — carrying both a `conference` and a `speaker` reference. Saves use `createOrReplace` on that id, so concurrent saves by the same user are race-free and can never create duplicates.

The server actions (`loadDashboardConfig` / `saveDashboardConfig`) accept **no conference id from the client**: the conference is resolved server-side from the request domain (`resolveConferenceId`, the same helper the tRPC routers use) and the organizer's speaker id comes from the server session.

**Load fallback chain:**

1. **Personal doc** (deterministic id) — returned even when its widgets array is empty: `widgets: []` means the organizer deliberately cleared their dashboard, and the client renders an empty grid rather than defaults.
2. **Legacy shared doc** (matching `conference._ref`, no `speaker` reference) — a read-only first-visit default kept from the pre-per-organizer era. It is never written again; an empty legacy doc falls through to step 3.
3. **`null`** — the client falls back to the default preset (Planning).

Changes are debounced (1.5 s) and auto-saved; navigating away with a pending edit flushes the save immediately on unmount. Saves are only enabled after a successful initial load.

**Server-side validation (on save):**

| Rule       | Limit                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| Widgets    | ≤ 40 per layout                                                           |
| Type       | Must exist in the widget registry (unknown types rejected)                |
| Title / id | Strings ≤ 200 characters                                                  |
| Position   | Integers: 0 ≤ row ≤ 500, 0 ≤ col ≤ 11, 1 ≤ rowSpan ≤ 24, 1 ≤ colSpan ≤ 12 |
| Config     | ≤ 8 KB serialized JSON per widget                                         |

Save rejects unknown widget types, but **load stays lenient**: unknown stored types render the "Widget not available" placeholder so old documents never break the dashboard.

### Data Flow

```text
Widget Component
  → useWidgetData(fetcher, deps)
    → Server Action (requireOrganizer() auth guard)
      → Sanity GROQ query (conference-scoped)
```

Server actions in `actions.ts` handle all data fetching with `requireOrganizer()` access control. Each action accepts the conference object or ID and returns typed data.

### Widget Configuration

Widgets with configurable options (9 of 13) define a `configSchema` in the registry using Zod. The `WidgetConfigModal` renders input fields from the schema and persists values alongside the widget layout. Widgets receive config via their `config` prop.

## Widgets

| Widget             | Category   | Description                                                 |
| ------------------ | ---------- | ----------------------------------------------------------- |
| Quick Actions      | Core       | Phase-aware action shortcuts with badge counts              |
| Upcoming Deadlines | Core       | Computed deadlines from conference date fields              |
| Review Progress    | Core       | Proposal review completion tracking                         |
| Recent Activity    | Engagement | System activity feed (sponsor CRM + proposals)              |
| CFP Health         | Analytics  | Submission momentum, format distribution, trends            |
| Proposal Pipeline  | Analytics  | Status distribution (submitted/accepted/rejected/confirmed) |
| Ticket Sales       | Analytics  | Revenue, capacity, milestones, sales trend chart            |
| Speaker Engagement | Engagement | Speaker count, diversity, and confirmation stats            |
| Sponsor Pipeline   | Operations | Deal stages, revenue goals, recent CRM activity             |
| Schedule Builder   | Operations | Slot allocation progress by day                             |
| Workshop Capacity  | Operations | Registration fill rates and waitlists                       |
| Travel Support     | Operations | Request queue, budget usage, approval workflow              |
| My Areas           | Operations | Needs-attention counts for the viewer's teams               |

## File Structure

```text
src/lib/dashboard/
├── types.ts             # Widget, GridPosition, BaseWidgetProps, config schemas
├── data-types.ts        # Widget data response types (per-widget data contracts)
├── constants.ts         # Grid configuration, debounce timing
├── grid-utils.ts        # Collision detection, column count calculation
├── placement-utils.ts   # Smart auto-placement for new widgets
├── widget-metadata.ts   # WidgetMetadata type, defineWidget helper
├── widget-registry.ts   # All widget registrations with metadata
├── presets.ts           # Dashboard preset configurations
└── chart-theme.ts       # ApexCharts dark/light mode theming

src/hooks/dashboard/
└── useWidgetData.ts     # Generic data-fetching hook for widgets

src/components/admin/dashboard/
├── AdminDashboard.tsx   # Top-level layout orchestrator
├── DashboardGrid.tsx    # Drag-drop grid container
├── WidgetContainer.tsx  # Widget wrapper with resize/controls
├── WidgetConfigModal.tsx # Configuration modal (Zod-driven)
├── WidgetErrorBoundary.tsx # Error isolation per widget
├── WidgetPicker.tsx     # Category-based widget browser
├── PresetMenu.tsx       # Edit-mode preset (layout) picker
├── widget-renderer.tsx  # Maps widget type → component
└── widgets/
    ├── shared.tsx       # Shared UI primitives
    └── [13 widget components]

src/app/(admin)/admin/
└── actions.ts           # Server actions for widget data fetching
```

## Adding a New Widget

1. **Define the data type** in `data-types.ts`.
2. **Create a server action** in `actions.ts` with `requireOrganizer()` guard.
3. **Register the widget** in `widget-registry.ts` with metadata, sizes, and optional config schema.
4. **Build the component** in `widgets/` using `useWidgetData`, shared primitives, and phase-specific views.
5. **Add the render case** in `widget-renderer.tsx`.
6. **Optionally add to presets** in `presets.ts`.
