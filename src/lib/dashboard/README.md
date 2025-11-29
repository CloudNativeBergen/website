# Dashboard Grid System

A flexible, responsive widget-based dashboard system built with React, TypeScript, and @dnd-kit.

## Conference Management Domains & Phase Matrix

### Core Feature Domains

Based on the site's admin structure and conference lifecycle, the following core domains have been identified:

1. **Call for Papers (CFP)** - Talk submissions, review, and speaker management
2. **Schedule & Program** - Agenda building, session management, and program publication
3. **Sponsors & Revenue** - Sponsorship pipeline, contracts, and revenue tracking
4. **Tickets & Attendance** - Ticket sales, capacity management, and registration
5. **Workshops** - Workshop registration, capacity, and waitlist management
6. **Travel Support** - Speaker travel requests, budget, and expense tracking
7. **Speakers & Engagement** - Speaker profiles, diversity tracking, and communication
8. **Marketing & Content** - Gallery, featured content, and promotional materials
9. **Volunteers & Team** - Organizer and volunteer coordination
10. **Settings & Configuration** - Conference details, dates, and system settings

### Conference Lifecycle Phases

Based on date fields in the Conference schema, we identify four distinct operational phases:

#### 1. **Initialization Phase** (Conference Setup → CFP Start)

- **Timing:** From conference creation until `cfp_start_date`
- **Focus:** Planning, configuration, and preparation
- **Key Activities:** Setting up conference details, defining formats/topics, recruiting sponsors, building team

#### 2. **Planning Phase** (CFP Open → CFP Close)

- **Timing:** From `cfp_start_date` to `cfp_end_date`
- **Focus:** Accepting submissions, reviewing proposals, engaging community
- **Key Activities:** CFP promotion, proposal review, speaker communication, sponsor recruitment

#### 3. **Execution Phase** (Pre-Conference → Event Days)

- **Timing:** From `program_date` to `start_date` and during `start_date` to `end_date`
- **Focus:** Final preparations and event delivery
- **Key Activities:** Schedule finalization, ticket sales, workshop confirmations, speaker logistics, on-site operations

#### 4. **Post-Conference Phase** (After Event)

- **Timing:** After `end_date` (specifically day after conference ends)
- **Focus:** Wrap-up, content publication, analysis
- **Key Activities:** Publishing recordings, expense reconciliation, attendee surveys, retrospectives, archival

### Domain × Phase Widget Matrix

This matrix shows which widgets are relevant for each domain during each conference phase. Widgets marked with ✅ are highly relevant, (✅) are somewhat relevant, and blank cells indicate low/no relevance.

| Domain                    | Initialization       | Planning (CFP)                                       | Execution (Pre-Event + Event)                 | Post-Conference                         |
| ------------------------- | -------------------- | ---------------------------------------------------- | --------------------------------------------- | --------------------------------------- |
| **CFP & Proposals**       | (✅) Setup goals     | ✅ Health tracking, Review progress, Pipeline status | (✅) Final confirmations                      | (✅) Analytics                          |
| **Schedule & Program**    |                      | (✅) Capacity planning                               | ✅ Builder status, Session allocation         | ✅ Actual vs planned                    |
| **Sponsors & Revenue**    | ✅ Pipeline setup    | ✅ Deal tracking, Revenue goals                      | ✅ Contract fulfillment, Activation tracking  | ✅ ROI analysis                         |
| **Tickets & Attendance**  | (✅) Capacity setup  | (✅) Early bird tracking                             | ✅ Sales dashboard, Capacity monitoring       | ✅ Attendance analysis                  |
| **Workshops**             |                      | ✅ Proposal review                                   | ✅ Capacity tracking, Registration monitoring | ✅ Attendance stats                     |
| **Travel Support**        |                      | (✅) Budget setup                                    | ✅ Approval queue, Budget tracking            | ✅ Expense reconciliation               |
| **Speakers & Engagement** | (✅) Invite keynotes | ✅ Diversity tracking, Response monitoring           | ✅ Confirmation status, Communication logs    | (✅) Feedback collection                |
| **Marketing & Content**   | (✅) Asset prep      | (✅) CFP promotion                                   | ✅ Social media tracking, Content calendar    | ✅ Video publishing, Gallery management |
| **Quick Actions**         | ✅ All phases        | ✅ All phases                                        | ✅ All phases                                 | ✅ All phases                           |
| **Activity Feed**         | ✅ All phases        | ✅ All phases                                        | ✅ All phases                                 | ✅ All phases                           |
| **Deadlines**             | ✅ All phases        | ✅ All phases                                        | ✅ All phases                                 | (✅) Final tasks                        |

---

## Deep Dive: CFP & Proposals Domain

This domain represents the core of content curation for the conference. It encompasses the entire lifecycle of talk proposals from submission through acceptance, scheduling, and delivery.

### Phase-Specific Widget Requirements

#### Initialization Phase

**Primary Goal:** Set expectations and prepare infrastructure

**Widgets Needed:**

1. **CFP Configuration Widget** (New - Not Yet Implemented)
   - **Purpose:** Configure submission goals, deadlines, and review criteria
   - **Metrics Displayed:**
     - Target submission count
     - Number of review slots available
     - Configured formats and topics
     - Review team size
   - **Actions:**
     - Link to settings page
     - Configure email templates
     - Set up review criteria
   - **Size:** Medium (4×3)
   - **Priority:** Medium - used once during setup

2. **Quick Actions** (✅ Implemented)
   - **Purpose:** Navigate to CFP settings and configuration
   - **Relevant Actions:**
     - Configure CFP settings
     - Invite reviewers
     - Set up email templates
   - **Size:** Small (3×2)
   - **Priority:** High - constant navigation hub

3. **Upcoming Deadlines** (✅ Implemented)
   - **Purpose:** Track CFP open date and initial milestones
   - **Relevant Deadlines:**
     - CFP opens date
     - Early bird promotion deadline
     - First review checkpoint
   - **Size:** Medium (6×3)
   - **Priority:** High - critical timeline awareness

#### Planning Phase (CFP Open)

**Primary Goal:** Maximize quality submissions and efficient review process

**Widgets Needed:**

1. **CFP Health Widget** (✅ Implemented)
   - **Purpose:** Monitor submission momentum and progress toward goals
   - **Metrics Displayed:**
     - Total submissions vs goal (with progress bar)
     - Submissions trend over time (area chart)
     - Average submissions per day
     - Format distribution (breakdown cards)
     - Days remaining until CFP close
   - **Data Sources:** Proposal count queries, filtered by status='submitted'
   - **Refresh Rate:** Hourly during active CFP period
   - **Size:** Medium (6×4)
   - **Priority:** Critical - primary health indicator

2. **Proposal Pipeline Widget** (✅ Implemented)
   - **Purpose:** Visualize status distribution and decision progress
   - **Metrics Displayed:**
     - Horizontal bar chart showing:
       - Submitted (new, awaiting review)
       - Under Review (assigned to reviewers)
       - Accepted (approved, awaiting speaker confirmation)
       - Rejected (declined with notification sent)
       - Confirmed (speaker accepted slot)
     - Acceptance rate percentage
     - Pending decisions count
   - **Data Sources:** Proposal status counts, aggregated reviews
   - **Refresh Rate:** Real-time during active review
   - **Size:** Medium (6×4)
   - **Priority:** Critical - main workflow visualization

3. **Review Progress Widget** (✅ Implemented)
   - **Purpose:** Track review completion and workload
   - **Metrics Displayed:**
     - Circular progress indicator (% of proposals reviewed)
     - Reviews completed count
     - Average review score
     - Unreviewed proposals count
   - **Actions:**
     - "Review Next" button (routes to next unreviewed proposal)
   - **Data Sources:** Review completion status, average scores
   - **Refresh Rate:** Real-time
   - **Size:** Small (3×3)
   - **Priority:** High - personal accountability

4. **Reviewer Workload Widget** (New - Not Yet Implemented)
   - **Purpose:** Ensure balanced review distribution
   - **Metrics Displayed:**
     - List of reviewers with:
       - Name
       - Proposals assigned
       - Reviews completed
       - Completion percentage
       - Average review time
     - Team average completion rate
   - **Actions:**
     - Reassign proposals
     - Send reminder emails
   - **Data Sources:** Review assignments, completion stats
   - **Size:** Medium (4×4)
   - **Priority:** High - prevents bottlenecks

5. **Top Rated Proposals Widget** (New - Not Yet Implemented)
   - **Purpose:** Surface standout submissions for quick decision-making
   - **Metrics Displayed:**
     - Top 10 proposals by average score
     - Format, speaker name, review count
     - Quick status badges
   - **Actions:**
     - Quick accept/schedule button
     - View full proposal
   - **Data Sources:** Proposal reviews with aggregated scores
   - **Size:** Medium (6×4)
   - **Priority:** Medium - accelerates curation

6. **Diversity Insights Widget** (New - Not Yet Implemented)
   - **Purpose:** Track representation across submissions
   - **Metrics Displayed:**
     - Geographic distribution (map or list)
     - First-time vs returning speakers
     - Company/organization diversity
     - Topic coverage heatmap
   - **Data Sources:** Speaker profiles, proposal metadata
   - **Size:** Medium (6×3)
   - **Priority:** Medium - strategic diversity goals

7. **Upcoming Deadlines** (✅ Implemented)
   - **Purpose:** Maintain urgency and timeline awareness
   - **Relevant Deadlines:**
     - CFP close date (with countdown)
     - Speaker notification date
     - Early decision windows
   - **Size:** Medium (6×3)
   - **Priority:** High - time-sensitive decisions

8. **Recent Activity Feed** (✅ Implemented)
   - **Purpose:** Stay aware of submission and review activity
   - **Relevant Activities:**
     - New proposal submissions
     - Reviews completed
     - Speaker questions/comments
     - Status changes
   - **Size:** Wide (12×4)
   - **Priority:** Medium - contextual awareness

#### Execution Phase (Program Building)

**Primary Goal:** Finalize speaker lineup and confirm participation

**Widgets Needed:**

1. **Speaker Confirmation Status Widget** (New - Not Yet Implemented)
   - **Purpose:** Track speaker responses to acceptance notifications
   - **Metrics Displayed:**
     - Accepted proposals awaiting confirmation
     - Confirmed speakers count
     - Declined speakers (need replacements)
     - Pending responses with time elapsed
   - **Actions:**
     - Send reminder emails
     - Mark as confirmed
     - Select backup proposals
   - **Data Sources:** Proposal status, speaker response timestamps
   - **Size:** Medium (6×3)
   - **Priority:** Critical - lineup certainty

2. **Proposal Pipeline Widget** (✅ Implemented - adapted)
   - **Purpose:** Finalize remaining decisions and confirmations
   - **Metrics Displayed:**
     - Same as planning phase but focused on:
       - Accepted → Confirmed conversion
       - Backup proposals ready
   - **Size:** Medium (6×4)
   - **Priority:** High - complete the roster

3. **Schedule Integration Widget** (New - Not Yet Implemented)
   - **Purpose:** See which proposals are slotted into the schedule
   - **Metrics Displayed:**
     - Confirmed proposals with schedule slots
     - Unscheduled confirmed proposals
     - Schedule conflicts or gaps
   - **Actions:**
     - Quick link to schedule builder
     - Drag-drop placeholder assignment
   - **Data Sources:** Schedule data, confirmed proposals
   - **Size:** Large (8×4)
   - **Priority:** High - bridges CFP and schedule domains

4. **Speaker Communication Log Widget** (New - Not Yet Implemented)
   - **Purpose:** Track all speaker correspondence and outstanding items
   - **Metrics Displayed:**
     - Recent emails sent/received
     - Unanswered speaker questions
     - Missing speaker information
     - Pending agreements/releases
   - **Actions:**
     - Compose email
     - Mark as resolved
     - Flag for follow-up
   - **Data Sources:** Email logs, speaker profile completeness
   - **Size:** Medium (6×4)
   - **Priority:** Medium - operational efficiency

5. **Upcoming Deadlines** (✅ Implemented)
   - **Relevant Deadlines:**
     - Program announcement date
     - Speaker bio/photo deadline
     - Final schedule lock
   - **Size:** Medium (6×3)
   - **Priority:** High

#### Post-Conference Phase

**Primary Goal:** Analyze outcomes and document for future planning

**Widgets Needed:**

1. **CFP Performance Analytics Widget** (New - Not Yet Implemented)
   - **Purpose:** Retrospective analysis of the CFP process
   - **Metrics Displayed:**
     - Total submissions vs goal
     - Acceptance rate comparison to past years
     - Average review time per proposal
     - Submission timeline distribution (when did most submit?)
     - Format popularity
     - Geographic reach
   - **Visualizations:**
     - Line charts (submission timeline)
     - Bar charts (format/topic distribution)
     - Comparison tables (year-over-year)
   - **Data Sources:** Historical proposal data, review logs
   - **Export:** CSV export for reporting
   - **Size:** Large (8×5)
   - **Priority:** Medium - strategic learning

2. **Talk Attendance Correlation Widget** (New - Not Yet Implemented)
   - **Purpose:** Correlate proposal metadata with session popularity
   - **Metrics Displayed:**
     - Top attended sessions (if attendance tracked)
     - Correlation between review scores and attendance
     - Format performance (talk vs workshop attendance)
   - **Actions:**
     - Export insights for next year's CFP criteria
   - **Data Sources:** Attendance data, proposal metadata
   - **Size:** Medium (6×4)
   - **Priority:** Low - nice-to-have insights

3. **Speaker Feedback Summary Widget** (New - Not Yet Implemented)
   - **Purpose:** Aggregate post-event speaker satisfaction
   - **Metrics Displayed:**
     - Speaker satisfaction scores
     - Common feedback themes
     - Net Promoter Score (would they speak again?)
   - **Data Sources:** Speaker surveys
   - **Size:** Medium (4×3)
   - **Priority:** Medium - retention insights

### Current Widget Coverage: CFP Domain

**✅ Implemented (5 widgets):**

- CFP Health Widget
- Proposal Pipeline Widget
- Review Progress Widget
- Quick Actions (CFP-relevant actions)
- Upcoming Deadlines (CFP dates)

**🚧 Needed for Complete Coverage (8 widgets):**

- CFP Configuration Widget (Initialization)
- Reviewer Workload Widget (Planning)
- Top Rated Proposals Widget (Planning)
- Diversity Insights Widget (Planning)
- Speaker Confirmation Status Widget (Execution)
- Schedule Integration Widget (Execution)
- Speaker Communication Log Widget (Execution)
- CFP Performance Analytics Widget (Post-Conference)
- Talk Attendance Correlation Widget (Post-Conference)
- Speaker Feedback Summary Widget (Post-Conference)

### Data Sources Required

For full CFP domain support, the following data must be queryable:

1. **Proposals:** Status, format, topics, speakers, submission timestamp, review scores
2. **Reviews:** Reviewer ID, completion status, scores, comments, timestamp
3. **Reviewers:** Name, email, assigned proposals, review history
4. **Speakers:** Name, profile, diversity data (opt-in), contact info, response timestamps
5. **Schedule:** Slots assigned to proposals, timing conflicts
6. **Communications:** Email logs, speaker Q&A threads
7. **Attendance:** Session attendance counts (if tracked)
8. **Surveys:** Speaker satisfaction responses

---

## Implementation Strategy: Phase-Aware Widgets

### The Question: Separate Widgets vs Phase Configuration?

After analyzing the existing architecture and use cases, here's the recommended approach:

### ✅ **Recommended: Phase as Configuration (Adaptive Widgets)**

**Rationale:**

1. **Existing Patterns:** The codebase already uses phase detection extensively:
   - `src/lib/conference/state.ts` provides helpers: `isCfpOpen()`, `isProgramPublished()`, `isConferenceOver()`
   - Components like `Hero.tsx` and `QuickActionsWidget.tsx` already adapt based on conference state
   - This pattern is proven, tested, and understood by the team

2. **Reduced Complexity:** One widget type that adapts is simpler than managing multiple widget variants:
   - Single registration in widget registry
   - Single component to maintain
   - Easier testing (test phases, not separate components)
   - Less code duplication

3. **Flexible Data Layer:** Widgets can request exactly the data they need for the current phase:

   ```typescript
   // Inside widget - conditional data fetching
   const data = await getWidgetData({
     type: 'cfp-health',
     phase: getCurrentPhase(conference),
     conferenceId: conference._id,
   })
   ```

4. **Smooth Transitions:** Real conference work doesn't have hard phase boundaries:
   - CFP might close but reviews continue
   - Execution phase overlaps with planning
   - Adaptive widgets handle edge cases naturally

5. **User Experience:** Organizers see widgets evolve with their work rather than appearing/disappearing

### Architecture Design

#### 1. **Extend Widget Type System**

```typescript
// src/lib/dashboard/types.ts

export type ConferencePhase =
  | 'initialization'
  | 'planning'
  | 'execution'
  | 'post-conference'

export interface PhaseConfig {
  /** Phases where this widget is most relevant */
  relevantPhases: ConferencePhase[]
  /** Whether widget should be hidden in irrelevant phases */
  hideInIrrelevantPhases?: boolean
  /** Whether widget adapts its display based on phase */
  isPhaseAdaptive?: boolean
}

export interface Widget<TConfig = Record<string, unknown>> {
  id: string
  type: string
  position: GridPosition
  title: string
  config?: TConfig
  metadata?: WidgetMetadata
  /** Optional phase configuration for conditional rendering */
  phaseConfig?: PhaseConfig
}
```

#### 2. **Add Phase Detection Utility**

```typescript
// src/lib/conference/phase.ts

import { Conference } from './types'
import { isCfpOpen, isProgramPublished, isConferenceOver } from './state'

export type ConferencePhase =
  | 'initialization'
  | 'planning'
  | 'execution'
  | 'post-conference'

/**
 * Determine current conference phase based on dates and state
 */
export function getCurrentPhase(conference: Conference): ConferencePhase {
  // Post-conference: After event ends
  if (isConferenceOver(conference)) {
    return 'post-conference'
  }

  // Execution: Program published until event end
  if (isProgramPublished(conference)) {
    return 'execution'
  }

  // Planning: CFP open until program published
  if (isCfpOpen(conference)) {
    return 'planning'
  }

  // Check if CFP has closed but program not yet published (still planning/review)
  const now = new Date()
  const cfpEnd = conference.cfp_end_date
    ? new Date(conference.cfp_end_date + 'T23:59:59.999Z')
    : null
  const programDate = conference.program_date
    ? new Date(conference.program_date)
    : null

  if (cfpEnd && programDate && now > cfpEnd && now < programDate) {
    return 'planning' // Still in review/selection phase
  }

  // Default: Initialization (before CFP opens)
  return 'initialization'
}

/**
 * Get phase-specific context for widgets
 */
export function getPhaseContext(conference: Conference) {
  const phase = getCurrentPhase(conference)
  const now = new Date()

  return {
    phase,
    isCfpOpen: isCfpOpen(conference),
    isProgramPublished: isProgramPublished(conference),
    isConferenceOver: isConferenceOver(conference),
    daysUntilCfpClose: conference.cfp_end_date
      ? Math.ceil(
          (new Date(conference.cfp_end_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,
    daysUntilConference: conference.start_date
      ? Math.ceil(
          (new Date(conference.start_date).getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null,
  }
}
```

#### 3. **Update Widget Metadata**

```typescript
// src/lib/dashboard/widget-registry.ts

export const CFP_HEALTH_WIDGET = defineWidget({
  type: 'cfp-health',
  displayName: 'CFP Health',
  description: 'Call for Papers submission tracking',
  category: 'analytics',
  icon: 'DocumentTextIcon',
  // ... existing constraints and sizes ...

  // NEW: Phase configuration
  phaseConfig: {
    relevantPhases: ['planning', 'execution', 'post-conference'],
    hideInIrrelevantPhases: false, // Still visible but shows different data
    isPhaseAdaptive: true, // Widget content changes by phase
  },
  tags: ['cfp', 'submissions', 'analytics', 'chart'],
})
```

#### 4. **Phase-Adaptive Widget Implementation**

```typescript
// src/components/admin/dashboard/widgets/CFPHealthWidget.tsx

'use client'

import { useEffect, useState } from 'react'
import { getCurrentPhase, getPhaseContext } from '@/lib/conference/phase'
import { Conference } from '@/lib/conference/types'

interface CFPHealthWidgetProps {
  conference: Conference
}

export function CFPHealthWidget({ conference }: CFPHealthWidgetProps) {
  const [phaseContext, setPhaseContext] = useState(() => getPhaseContext(conference))

  // Recalculate phase context on mount and periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseContext(getPhaseContext(conference))
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [conference])

  const { phase } = phaseContext

  // Render different content based on phase
  switch (phase) {
    case 'initialization':
      return <CFPHealthInitialization conference={conference} />

    case 'planning':
      return <CFPHealthPlanning conference={conference} context={phaseContext} />

    case 'execution':
      return <CFPHealthExecution conference={conference} />

    case 'post-conference':
      return <CFPHealthAnalytics conference={conference} />

    default:
      return <CFPHealthPlanning conference={conference} context={phaseContext} />
  }
}

// Phase-specific sub-components
function CFPHealthInitialization({ conference }: { conference: Conference }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        CFP Not Yet Open
      </h3>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Opens {conference.cfp_start_date}
      </p>
      <button className="mt-4 text-sm text-blue-600 hover:text-blue-700">
        Configure CFP Settings →
      </button>
    </div>
  )
}

// Planning phase shows the full submission tracking UI (existing implementation)
function CFPHealthPlanning({
  conference,
  context
}: {
  conference: Conference
  context: ReturnType<typeof getPhaseContext>
}) {
  // Existing CFPHealthWidget implementation here
  // Shows: submissions trend, format distribution, progress toward goal
  return <div>... existing implementation ...</div>
}

// Execution phase emphasizes finalization
function CFPHealthExecution({ conference }: { conference: Conference }) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 text-xs font-semibold">CFP Summary</h3>
      <div className="space-y-3">
        <Stat label="Total Submissions" value={147} />
        <Stat label="Accepted" value={42} change="+5 since last week" />
        <Stat label="Confirmed" value={38} change="4 pending" />
      </div>
      <button className="mt-auto text-sm text-blue-600">
        View All Proposals →
      </button>
    </div>
  )
}

// Post-conference shows analytics
function CFPHealthAnalytics({ conference }: { conference: Conference }) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 text-xs font-semibold">CFP Performance</h3>
      {/* Year-over-year comparison, acceptance rates, etc. */}
    </div>
  )
}
```

#### 5. **Dashboard Grid Phase Filtering**

```typescript
// src/components/admin/dashboard/DashboardGrid.tsx

function shouldShowWidget(
  widget: Widget,
  currentPhase: ConferencePhase,
): boolean {
  if (!widget.phaseConfig) return true // No config = always show

  const { relevantPhases, hideInIrrelevantPhases } = widget.phaseConfig

  if (!hideInIrrelevantPhases) return true // Show but may adapt

  return relevantPhases.includes(currentPhase)
}

// Inside DashboardGrid component:
const visibleWidgets = widgets.filter((widget) =>
  shouldShowWidget(widget, getCurrentPhase(conference)),
)
```

### When to Use Separate Widgets Instead

There are rare cases where separate widget types make sense:

1. **Completely Unrelated Functionality:** If "CFP Health" in planning vs post-conference share NO code or UI patterns
2. **Different Data Sources:** If phases require entirely different backend integrations
3. **Dramatically Different Sizes:** If one phase needs 3×2 and another needs 12×6 minimum

**For this project:** These cases are rare. Most widgets share significant overlap across phases.

### Benefits Summary

| Aspect            | Phase Config (✅ Recommended) | Separate Widgets            |
| ----------------- | ----------------------------- | --------------------------- |
| Code Reuse        | High - shared logic/UI        | Low - duplicate patterns    |
| Maintainability   | Single source of truth        | Multiple components to sync |
| User Experience   | Smooth evolution              | Jarring replacements        |
| Testing           | Test phase logic once         | Test each widget variant    |
| Registry Size     | Manageable (12 types)         | Large (30+ types)           |
| Data Fetching     | Optimized per phase           | Duplicate queries           |
| Existing Patterns | Matches Hero, QuickActions    | New pattern to learn        |

### Implementation Roadmap

1. **Phase 1:** Create phase detection utilities (`src/lib/conference/phase.ts`) ✅ **COMPLETE**
2. **Phase 2:** Extend widget types with `PhaseConfig` ✅ **COMPLETE**
3. **Phase 3:** Migrate existing widgets to be phase-aware (starting with QuickActions as prototype)
4. **Phase 4:** Build new phase-adaptive widgets for gaps identified in CFP domain
5. **Phase 5:** Add phase filtering to dashboard layout management

### Example: Phase-Adaptive Widget

See the implementation guide in the architecture section above. Key files created:

- `src/lib/conference/phase.ts` - Phase detection and utilities
- `__tests__/lib/conference/phase.test.ts` - Comprehensive test coverage
- `src/lib/dashboard/types.ts` - Extended with `PhaseConfig`

### Quick Start: Making a Widget Phase-Aware

```typescript
// 1. Import phase utilities
import { getCurrentPhase, getPhaseContext } from '@/lib/conference/phase'

// 2. Add phase detection to your widget
export function MyWidget({ conference }: { conference: Conference }) {
  const phaseContext = getPhaseContext(conference)

  // 3. Render different content based on phase
  if (phaseContext.phase === 'planning') {
    return <PlanningView data={...} />
  }

  if (phaseContext.phase === 'execution') {
    return <ExecutionView data={...} />
  }

  // ... etc
}

// 4. Update widget registry with phase config
export const MY_WIDGET = defineWidget({
  type: 'my-widget',
  // ... other metadata ...
  phaseConfig: {
    relevantPhases: ['planning', 'execution'],
    hideInIrrelevantPhases: false,
    isPhaseAdaptive: true,
  },
})
```

---

## Architecture

### Core Components

- **`DashboardGrid`** - Main grid container managing layout, drag-and-drop, and responsive behavior
- **`WidgetContainer`** - Wrapper for individual widgets with drag/resize capabilities
- **Widget Components** - Custom widget implementations (e.g., `DummyStatsWidget`, `DummyChartWidget`)

### Utilities

- **`grid-utils.ts`** - Core grid calculations, collision detection, and snapping logic
- **`constants.ts`** - Grid configuration (cell size, gaps, breakpoints)
- **`types.ts`** - TypeScript interfaces for type safety

## Key Features

### 1. Responsive Grid System

- **Desktop** (≥1024px): 12 columns
- **Tablet** (≥768px): 6 columns
- **Mobile** (<768px): 4 columns
- Fluid layout: columns scale to fill 100% width
- Fixed row height: 80px
- Gap: 16px

### 2. Drag and Drop

- Real-time snapping to grid cells during drag
- Collision detection prevents overlapping widgets
- Visual feedback during drag operations
- Smooth, natural drag experience (no ghost/hologram effect)

### 3. Resize Capability

- Resize handle in bottom-right corner (edit mode only)
- Snaps to grid cell boundaries
- Respects grid boundaries (can&apos;t exceed column count)
- Real-time collision detection
- Visual feedback (red border on collision)

### 4. Dynamic Cell Sizing

- Uses `ResizeObserver` to track grid width
- Calculates cell width: `(gridWidth - gaps) / columnCount`
- Drag and resize adapt to current cell size
- Handles viewport resizing seamlessly

### 5. Edit Mode

- Visual grid overlay when enabled
- Drag handles (hamburger icon, top-left)
- Resize handles (triangle, bottom-right)
- Can be toggled on/off

## Usage Example

```tsx
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { Widget } from '@/lib/dashboard/types'

function MyDashboard() {
  const [widgets, setWidgets] = useState<Widget[]>([...])
  const [editMode, setEditMode] = useState(true)
  const [columnCount, setColumnCount] = useState(12)

  const renderWidget = (widget: Widget, isDragging: boolean, cellWidth: number) => (
    <WidgetContainer
      widget={widget}
      editMode={editMode}
      isDragging={isDragging}
      columnCount={columnCount}
      cellWidth={cellWidth}
      allWidgets={widgets}
      onResize={handleResize}
    >
      <MyWidgetContent />
    </WidgetContainer>
  )

  return (
    <DashboardGrid
      widgets={widgets}
      onWidgetsChange={setWidgets}
      columnCount={columnCount}
      editMode={editMode}
    >
      {renderWidget}
    </DashboardGrid>
  )
}
```

## Widget Definition

```typescript
interface Widget<TConfig = Record<string, unknown>> {
  id: string // Unique identifier
  type: string // Widget type (for rendering)
  position: GridPosition // Grid coordinates
  title: string // Widget title
  config?: TConfig // Optional widget-specific configuration
}

interface GridPosition {
  row: number // Starting row (0-indexed)
  col: number // Starting column (0-indexed)
  rowSpan: number // Number of rows to span
  colSpan: number // Number of columns to span
}
```

## Configuration

### Grid Constants (`constants.ts`)

```typescript
export const GRID_CONFIG: GridConfig = {
  cellSize: 80, // Base cell height in pixels
  gap: 16, // Gap between cells
  breakpoints: {
    desktop: { minWidth: 1024, cols: 12 },
    tablet: { minWidth: 768, cols: 6 },
    mobile: { minWidth: 0, cols: 4 },
  },
}
```

### Customization

To customize the grid:

1. Modify `GRID_CONFIG` in `constants.ts`
2. Update breakpoint logic in `getColumnCountForWidth()`
3. Adjust SVG pattern in `DashboardGrid` if needed

## Single Source of Truth

**CRITICAL**: All grid calculations use `GRID_CONFIG` as the single source of truth.

- Cell size: `GRID_CONFIG.cellSize`
- Gap: `GRID_CONFIG.gap`
- Breakpoints: `GRID_CONFIG.breakpoints`

Never hardcode these values elsewhere!

## Future Enhancements (Phase 1+)

- [ ] Widget persistence (Sanity CMS + tRPC)
- [ ] Real data widgets (proposals, speakers, stats)
- [ ] Widget library/catalog
- [ ] Undo/redo functionality
- [ ] Keyboard shortcuts
- [ ] Multi-user collaboration
- [ ] Widget templates/presets
- [ ] Export/import layouts
- [ ] Mobile-optimized drag/resize
- [ ] Accessibility improvements (keyboard navigation)

## Testing

Run tests:

```bash
pnpm test
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Considerations

- `useMemo` for expensive calculations
- `useCallback` for stable function references
- `ResizeObserver` instead of window resize events
- Debouncing resize calculations
- Efficient collision detection (occupation map)

## Troubleshooting

### Grid lines don&apos;t align with widgets

- Ensure `gridAutoRows` uses `GRID_CONFIG.cellSize`
- Check SVG pattern dimensions match cell+gap size

### Drag/resize feels jumpy

- Verify `snapModifier` uses correct `cellWithGap` calculation
- Check `cellWidth` is being calculated and passed correctly

### Widgets overlap

- Check `checkCollision()` is being called before updates
- Verify occupation map is built correctly

### Grid doesn&apos;t resize

- Ensure `ResizeObserver` is properly set up in `gridRef`
- Check `gridWidth` state is updating
- Verify `cellWidth` calculation includes gaps
