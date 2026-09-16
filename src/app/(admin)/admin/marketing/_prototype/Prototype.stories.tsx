import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expandTemplate } from '@/lib/marketing/seed'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import type { PlanView, TaskView } from '@/lib/marketing/types'
import { MarketingPlanPrototype, type VariantKey } from './Prototype'

/**
 * PROTOTYPE stories — the SAME fixture the real plan home uses: the real
 * Template expanded against a fixture edition, so this is the true worst
 * case (9 Campaigns, ~94 Tasks) rather than a flattering sample.
 */
const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  venueName: 'Grieghallen',
  ticketCapacity: 400,
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}

function fixture(
  includeOptional: string[],
  today: string,
  source: typeof conference = conference,
): PlanView {
  let n = 0
  const seed = expandTemplate({
    template: BUILTIN_TEMPLATE,
    conference: source,
    includeOptional,
    ownerId: 'sp-1',
    now: '2026-09-01T00:00:00.000Z',
    newId: (type) => `${type}-${++n}`,
  })
  const tasks: TaskView[] = seed.tasks.map((t) => {
    const publishing = t.kind === 'publishing'
    const variant = seed.variants.find((v) => v._id === t.variantId)
    return {
      _id: t._id,
      campaignId: t.campaignId,
      key: t.key,
      title: t.title,
      kind: t.kind,
      channel: t.channel,
      date: publishing ? (variant?.scheduledAt ?? null) : (t.dueAt ?? null),
      provisional: t.provisional,
      milestone: t.milestone ?? null,
      status: publishing ? 'draft' : 'open',
      complete: false,
      prerequisiteIds: t.prerequisiteIds,
      variantId: t.variantId ?? null,
      assigneeId: t.assigneeId,
      approvedAt: null,
    }
  })
  const set = (key: string, patch: Partial<TaskView>) => {
    const task = tasks.find((t) => t.key === key)
    if (task) Object.assign(task, patch)
  }
  // Save the date went out; its render is done.
  set('saveTheDateRender', { status: 'done', complete: true })
  set('saveTheDate:linkedin', { status: 'published', complete: true })
  set('saveTheDate:bluesky', { status: 'published', complete: true })
  set('blueskySetup', { status: 'done', complete: true })
  // CFP open is scheduled on Bluesky, waiting on its render on LinkedIn.
  set('cfpOpen:bluesky', { status: 'scheduled' })
  set('cfpEncourage:bluesky', { status: 'failed' })
  set('cfpReminder4w:bluesky', { status: 'awaiting-manual' })
  set('speakerKit', { status: 'skipped' })

  const milestones = resolveAllMilestones(source)
  return {
    plan: {
      _id: seed.plan._id,
      ownerId: 'sp-1',
      ownerName: 'Ada Organizer',
      templateVersion: seed.plan.templateVersion,
      copiedFromTitle: null,
      createdAt: seed.plan.createdAt,
    },
    campaigns: seed.campaigns.map((c) => ({
      _id: c._id,
      key: c.key,
      title: c.title,
      startDate: c.startDate,
      endDate: c.endDate,
      provisional: c.provisional,
      startMilestone: c.startMilestone,
      endMilestone: c.endMilestone,
      primaryOutcome: c.primaryOutcome,
      target: c.target,
      optional: c.optional,
    })),
    tasks,
    milestones,
    today,
    ceilingWarnings: [],
    organizers: [
      { _id: 'sp-1', name: 'Ada Organizer' },
      { _id: 'sp-2', name: 'Grace Organizer' },
    ],
  }
}

/** Every optional Milestone set: nothing on the plan is provisional. */
const fullyDated = {
  ...conference,
  earlyBirdEndDate: '2027-04-10',
  registrationCloseDate: '2027-06-04',
  speakersAnnouncedDate: '2027-04-12',
  sponsorDeadlineDate: '2027-04-30',
  recordingsLiveDate: '2027-06-28',
  ticketTargets: { enabled: true, salesStartDate: '2027-02-15' },
}

const seeded = fixture(['sponsorAcquisition'], '2027-02-01')

function Harness({ initial }: { initial: VariantKey }) {
  const [variant, setVariant] = useState<VariantKey>(initial)
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <MarketingPlanPrototype
        view={seeded}
        variant={variant}
        onVariant={(v) => setVariant(v as VariantKey)}
      />
    </div>
  )
}

const meta = {
  title: 'Systems/Marketing/Prototype/PlanDensity',
  component: Harness,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Harness>
export default meta
type Story = StoryObj<typeof meta>

export const A_DenseBoard: Story = { args: { initial: 'A' } }
export const B_WorkList: Story = { args: { initial: 'B' } }
export const C_FocusWeeks: Story = { args: { initial: 'C' } }
