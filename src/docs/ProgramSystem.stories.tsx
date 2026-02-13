import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Program',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Architecture: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-space-grotesk mb-4 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Program System
        </h1>
        <p className="font-inter mb-12 text-lg text-brand-slate-gray dark:text-gray-300">
          The program system manages conference schedules, time-grid views, and
          live session tracking. It supports multiple view modes, real-time
          status updates, and a drag-and-drop admin schedule editor.
        </p>

        {/* Data Model */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Model
          </h2>
          <div className="space-y-6">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                schedule
              </h3>
              <p className="font-inter mb-4 text-sm text-brand-slate-gray dark:text-gray-300">
                One document per conference day. Contains tracks with time
                slots.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field name="conference" desc="Reference to conference" />
                <Field name="date" desc="Date (YYYY-MM-DD)" />
                <Field
                  name="tracks[]"
                  desc="Array of tracks, each with title, description, and talks"
                />
                <Field
                  name="tracks[].talks[]"
                  desc="Scheduled talks with startTime/endTime (HH:mm)"
                />
              </div>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                scheduledTalk (inline object)
              </h3>
              <p className="font-inter mb-4 text-sm text-brand-slate-gray dark:text-gray-300">
                A time slot within a track. Links to a talk or uses a
                placeholder for service sessions.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  name="talk"
                  desc="Reference to talk (optional — null for service sessions)"
                />
                <Field
                  name="placeholder"
                  desc='Display text when no talk (e.g. "Lunch", "Registration")'
                />
                <Field
                  name="startTime"
                  desc="Start time HH:mm (required, regex-validated)"
                />
                <Field
                  name="endTime"
                  desc="End time HH:mm (required, regex-validated)"
                />
              </div>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-jetbrains mb-3 text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                talk (referenced)
              </h3>
              <p className="font-inter mb-4 text-sm text-brand-slate-gray dark:text-gray-300">
                Shared with the Proposals system. Only{' '}
                <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
                  confirmed
                </code>{' '}
                talks appear on the public schedule.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field name="title" desc="Talk title" />
                <Field name="speakers[]" desc="References to speaker" />
                <Field
                  name="format"
                  desc="lightning_10, presentation_25, workshop_120, etc."
                />
                <Field name="topics[]" desc="References to topic" />
                <Field name="status" desc="Only 'confirmed' shown publicly" />
                <Field name="description" desc="Portable Text blocks" />
              </div>
            </div>
          </div>
        </section>

        {/* View Modes */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            View Modes
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <ViewModeCard
              name="Schedule"
              desc="Time-grid layout with tracks as columns. Desktop shows all tracks side-by-side; mobile uses tabbed navigation per track."
              badge="Default"
            />
            <ViewModeCard
              name="Grid"
              desc="Responsive card grid (1-3 columns). Good for browsing talks without time context."
              badge=""
            />
            <ViewModeCard
              name="List"
              desc="Chronological list grouped by day. Merges duplicate service sessions across tracks."
              badge=""
            />
            <ViewModeCard
              name="Agenda"
              desc="Personal agenda showing only bookmarked talks. Uses localStorage for bookmark persistence."
              badge="Personal"
            />
          </div>
        </section>

        {/* Live Features */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Live Session Tracking
          </h2>
          <p className="font-inter mb-6 text-brand-slate-gray dark:text-gray-300">
            During the conference, the program automatically tracks session
            status and highlights the current talk.
          </p>
          <div className="grid gap-4 md:grid-cols-4">
            <StatusCard
              label="Past"
              color="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
              desc="Session has ended"
            />
            <StatusCard
              label="Happening Now"
              color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              desc="Live pulsing dot indicator"
            />
            <StatusCard
              label="Happening Soon"
              color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              desc="Starting within threshold"
            />
            <StatusCard
              label="Upcoming"
              color="bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
              desc="Future session"
            />
          </div>
        </section>

        {/* Component Hierarchy */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Component Hierarchy
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`/program (Server Component, cached)
└── ProgramClient (client orchestrator)
    ├── ProgramFilters
    │   └── ViewModeSelector
    ├── ProgramScheduleView (default)
    │   ├── ScheduleTabbed (mobile)
    │   └── ScheduleStatic (desktop grid)
    ├── ProgramGridView
    ├── ProgramListView
    ├── ProgramAgendaView (bookmarks only)
    └── TalkCard (core card component)`}
            </pre>
          </div>
        </section>

        {/* Client Hooks */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Client Hooks
          </h2>
          <div className="space-y-4">
            <HookCard
              name="useProgramFilter()"
              desc="Client-side filtering by day, track, format, level, audience, topic, and text search. Returns filtered schedules and flattened talk list."
            />
            <HookCard
              name="useProgramViewMode()"
              desc="Manages view mode state persisted to localStorage. Returns current mode and setter."
            />
            <HookCard
              name="useLiveProgram()"
              desc="Real-time talk status tracking. Calculates past/happening-now/happening-soon/upcoming for each talk using current time."
            />
            <HookCard
              name="useBookmarks()"
              desc="Personal bookmarks stored in localStorage via BookmarksContext. Powers the Agenda view."
            />
          </div>
        </section>

        {/* Admin */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Admin: Schedule Editor
          </h2>
          <p className="font-inter mb-6 text-brand-slate-gray dark:text-gray-300">
            Drag-and-drop interface for building the conference schedule from
            accepted proposals. Built on{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-700">
              @dnd-kit/core
            </code>{' '}
            with performance-optimised rendering via memoisation, virtual
            scrolling, and batched state updates.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <RouteCard path="/admin/schedule" label="Schedule editor" />
            <RouteCard path="/admin/api/schedule" label="Save API (POST)" />
            <RouteCard path="/program" label="Public program page" />
          </div>

          {/* Component hierarchy */}
          <div className="mt-6 rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-space-grotesk mb-3 text-lg font-semibold text-brand-cloud-blue">
              Component Hierarchy
            </h3>
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`ScheduleEditor (orchestrator, DndContext provider)
├── UnassignedProposals (sidebar)
│   ├── SearchFilter / FormatFilter / LevelFilter
│   ├── DraggableProposal[] (virtual-scrolled when >50)
│   └── Legend
├── HeaderSection (day tabs, add-track, save button)
├── TracksGrid
│   └── DroppableTrack[] (one per track)
│       ├── Time-slot drop zones (08:00–21:00, 5-min intervals)
│       ├── DraggableProposal (scheduled talks)
│       ├── DraggableServiceSession (breaks, lunch, etc.)
│       └── Service-session create/edit/resize controls
├── DragOverlay (floating preview during drag)
└── AddTrackModal`}
            </pre>
          </div>

          {/* Component descriptions */}
          <div className="mt-6 space-y-4">
            <ComponentCard
              name="ScheduleEditor"
              desc="Top-level orchestrator. Owns DndContext, day navigation state, save workflow, and performance timers. Coordinates drag-start/end events, track CRUD, and schedule persistence."
              storyPath="Systems/Program/Admin/ScheduleEditor"
              stories="EmptySchedule, SingleDayWithTracks, MultiDay"
            />
            <ComponentCard
              name="DroppableTrack"
              desc="Renders a single track column with a 08:00–21:00 timeline. Each 5-minute interval is a droppable zone. Supports inline title/description editing, service-session creation, resize handles, talk removal, and swap detection when dragging over occupied slots."
              storyPath="Systems/Program/Admin/DroppableTrack"
              stories="EmptyTrack, WithTalks, WithServiceSessions"
            />
            <ComponentCard
              name="DraggableProposal"
              desc="A draggable card representing a proposal. Shows title, speaker, format badge, level indicator, topic colour border, and audience tags. Visual distinction between confirmed (solid) and accepted-not-confirmed (amber border) status."
              storyPath="Systems/Program/Admin/DraggableProposal"
              stories="Presentation45, LightningTalk, Presentation25, Workshop, AcceptedNotConfirmed, WithdrawnProposal, NoTopics, Dragging"
            />
            <ComponentCard
              name="DraggableServiceSession"
              desc="A draggable placeholder for non-talk slots (registration, breaks, lunch, networking). Height scales with duration. Supports duplication to all tracks."
              storyPath="Systems/Program/Admin/DraggableServiceSession"
              stories="ShortBreak, MediumBreak, LunchBreak, NetworkingSession, Dragging"
            />
            <ComponentCard
              name="UnassignedProposals"
              desc="Sidebar listing confirmed proposals not yet scheduled on any day. Features text search, format/level filtering, virtual scrolling for large lists (>50), and a visual legend explaining status/level/topic/audience indicators."
              storyPath="Systems/Program/Admin/UnassignedProposals"
              stories="WithProposals, Empty, SingleProposal, MixedStatuses"
            />
          </div>

          {/* Hooks & utilities */}
          <div className="mt-6">
            <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
              Hooks &amp; Utilities
            </h3>
            <div className="space-y-4">
              <HookCard
                name="useScheduleEditor()"
                desc="Core state manager. Manages schedule + unassigned proposals. Provides addTrack, removeTrack, updateTrack, moveTalkToTrack (with swap detection), moveServiceSessionToTrack, and removeTalkFromSchedule. Computes unassigned proposals across all days."
              />
              <HookCard
                name="usePerformanceTimer()"
                desc="Dev-mode instrumentation for drag, save, and day-change operations. Logs slow operations (>100ms drag, >200ms day change) and periodic aggregate metrics."
              />
              <HookCard
                name="useDragPerformance()"
                desc="Manages requestAnimationFrame-based throttling during drag operations to maintain 60fps rendering."
              />
              <HookCard
                name="useBatchUpdates()"
                desc="Batches rapid filter/search state updates (100ms debounce) to avoid excessive re-renders in UnassignedProposals."
              />
            </div>
          </div>

          {/* Schedule lib */}
          <div className="mt-6">
            <h3 className="font-space-grotesk mb-4 text-lg font-semibold text-brand-cloud-blue">
              Schedule Library
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                name="lib/schedule/types.ts"
                desc="DragItem, DropPosition, TimeSlot interfaces. Time arithmetic: generateTimeSlots, calculateEndTime, timesOverlap, findAvailableTimeSlot, canSwapTalks."
              />
              <Field
                name="lib/schedule/client.ts"
                desc="saveSchedule() — POST to /admin/api/schedule with cache revalidation."
              />
              <Field
                name="lib/schedule/performance.ts"
                desc="SchedulePerformanceMonitor singleton, usePerformanceTimer hook. Tracks operation durations per component."
              />
              <Field
                name="lib/schedule/performance-utils.ts"
                desc="DragPerformanceManager (rAF throttling), BatchUpdateManager (debouncing), useDragPerformance, useBatchUpdates hooks."
              />
            </div>
          </div>
        </section>

        {/* Data Flow */}
        <section>
          <h2 className="font-space-grotesk mb-6 text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Flow
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains overflow-x-auto text-sm text-brand-slate-gray dark:text-gray-300">
              {`Sanity (schedule + talk documents)
  ↓ GROQ query (confirmedTalksOnly on public)
Server Component — cacheLife('hours'), cacheTag('content:program')
  ↓ props
ProgramClient
  ↓ hooks (filter, viewMode, live status, bookmarks)
View Components (Schedule / Grid / List / Agenda)
  ↓
TalkCard — renders individual talks with status, badges, bookmarks`}
            </pre>
          </div>
        </section>
      </div>
    </div>
  ),
}

function Field({ name, desc }: { name: string; desc: string }) {
  return (
    <div>
      <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
        {name}
      </code>
      <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
        {desc}
      </p>
    </div>
  )
}

function ViewModeCard({
  name,
  desc,
  badge,
}: {
  name: string
  desc: string
  badge: string
}) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
          {name}
        </h3>
        {badge && (
          <span className="rounded-full bg-brand-cloud-blue/10 px-2 py-0.5 text-xs font-medium text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
            {badge}
          </span>
        )}
      </div>
      <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
        {desc}
      </p>
    </div>
  )
}

function StatusCard({
  label,
  color,
  desc,
}: {
  label: string
  color: string
  desc: string
}) {
  return (
    <div
      className={`rounded-lg p-4 text-center ${color} border border-gray-200 dark:border-gray-700`}
    >
      <p className="font-space-grotesk mb-1 text-sm font-semibold">{label}</p>
      <p className="font-inter text-xs opacity-75">{desc}</p>
    </div>
  )
}

function RouteCard({ path, label }: { path: string; label: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
      <span className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
        {path}
      </span>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function HookCard({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-brand-frosted-steel bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <code className="font-jetbrains mt-0.5 shrink-0 text-sm font-semibold text-brand-nordic-purple dark:text-purple-400">
        {name}
      </code>
      <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
        {desc}
      </p>
    </div>
  )
}

function ComponentCard({
  name,
  desc,
  storyPath,
  stories,
}: {
  name: string
  desc: string
  storyPath: string
  stories: string
}) {
  return (
    <div className="rounded-lg border border-brand-frosted-steel bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h4 className="font-jetbrains mb-1.5 text-base font-semibold text-brand-nordic-purple dark:text-purple-400">
        {name}
      </h4>
      <p className="font-inter mb-3 text-sm text-brand-slate-gray dark:text-gray-300">
        {desc}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>
          <span className="font-medium text-gray-600 dark:text-gray-300">
            Story:
          </span>{' '}
          {storyPath}
        </span>
        <span>
          <span className="font-medium text-gray-600 dark:text-gray-300">
            Variants:
          </span>{' '}
          {stories}
        </span>
      </div>
    </div>
  )
}
